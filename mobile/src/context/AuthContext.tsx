/**
 * AuthContext — central authentication state for Peak Fettle.
 *
 * Token security model:
 *   - accessToken:  stored in React state (in-memory only). Never written to
 *                   disk or AsyncStorage. Expires in 15 minutes.
 *   - refreshToken: stored in expo-secure-store (device keychain/keystore).
 *                   Persists across app restarts. Expires in 30 days.
 *                   Server uses single-use rotation (T-02 hardening) — each
 *                   refresh call issues a new pair and revokes the old one.
 *
 * Cold-start flow:
 *   1. Read refreshToken from SecureStore.
 *   2. If present, POST /auth/refresh to get a new accessToken silently.
 *   3. If refresh fails (revoked, expired), clear SecureStore and show login.
 *   4. Inject auth handlers into apiClient so the 401 interceptor can call back here.
 *
 * TICKET-027 (done): PowerSync is wired. setAccessToken() on the connector is
 *   called after every auth event (login, silent refresh, logout) so PowerSync
 *   always has a fresh JWT without needing a React hook in the non-React connector.
 * TICKET-024 (done): Push token registration is wired after login/register.
 *   expo-notifications is not yet installed — the service stubs gracefully.
 *   Once expo-notifications is installed + EAS dev build is set up, the real
 *   token registration will flow automatically from this wiring.
 */

import React, {
  createContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { router } from 'expo-router';

// ---------------------------------------------------------------------------
// Web-safe SecureStore wrapper
// expo-secure-store is not available in web/Expo Go — fall back to in-memory
// storage for development. Tokens won't survive a page refresh, which is fine.
// ---------------------------------------------------------------------------

const _webStore = new Map<string, string>();

// keychainAccessible = AFTER_FIRST_UNLOCK: the refresh token (and cached
// profile) MUST survive across launches and be readable even when the app is
// woken/launched while the device is locked (background launch, push wake,
// boot-then-open-from-lock-screen). expo-secure-store's DEFAULT is
// WHEN_UNLOCKED, under which a read returns null whenever the device is locked
// at access time — which silently dropped the refresh token and forced a fresh
// sign-in on the next launch. AFTER_FIRST_UNLOCK is the same level the backup
// keyStore.ts uses for its key material, and is the correct durability tier for
// a long-lived credential. (No requireAuthentication — must never gate on
// biometrics here.)
const SECURE_STORE_OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

const safeSecureStore = {
  async getItemAsync(key: string): Promise<string | null> {
    if (Platform.OS === 'web') return _webStore.get(key) ?? null;
    return SecureStore.getItemAsync(key);
  },
  async setItemAsync(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') { _webStore.set(key, value); return; }
    return SecureStore.setItemAsync(key, value, SECURE_STORE_OPTS);
  },
  async deleteItemAsync(key: string): Promise<void> {
    if (Platform.OS === 'web') { _webStore.delete(key); return; }
    return SecureStore.deleteItemAsync(key);
  },
};

import { setAuthHandlers, isDefinitiveAuthFailure } from '../api/client';
import { setAccessToken as setPowerSyncToken } from '../db/connector';
import * as AuthApi from '../api/auth';
import { upgradeToProRequest, downgradeToFreeRequest } from '../api/billing';
import { migrateLocalDataToServer, MigrationOutcome } from '../data/migrateToPro';
import { User } from '../types/api';
import {
  registerForPushNotificationsAsync,
  unregisterForPushNotificationsAsync,
} from '../services/pushNotifications';

// ---------------------------------------------------------------------------
// DEV MOCK — bypass the real API and accept any credentials.
//
// MOCK-001 fix (2026-05-16): the default was previously `true`, which meant any
// build that didn't manually toggle the flag would silently accept any
// credentials AND grant a hardcoded `tier: 'paid'` profile. Production builds
// shipped against this default would have a non-functional auth model AND a
// gating bypass.
//
// New rule: mock auth is *only* enabled when ALL of the following hold:
//   1. The build is a development build (`__DEV__` is true). Production /
//      preview EAS profiles set `__DEV__ = false` automatically, so the flag
//      can never be true in those builds regardless of env config.
//   2. The explicit env var `EXPO_PUBLIC_USE_MOCK_AUTH=true` is set at build
//      time. The default (unset) is `false`, so an unconfigured dev machine
//      still uses the real backend.
//
// To opt in locally, add `EXPO_PUBLIC_USE_MOCK_AUTH=true` to `.env.local`
// (gitignored) — never check this in.
// ---------------------------------------------------------------------------
const USE_MOCK_AUTH =
  typeof __DEV__ !== 'undefined' &&
  __DEV__ === true &&
  process.env.EXPO_PUBLIC_USE_MOCK_AUTH === 'true';

const MOCK_USER: User = {
  id: 'mock-user-001',
  email: 'dev@peakfettle.com',
  display_name: 'Dev User',
  tier: 'paid',
  is_paid: true,
  unit_pref: 'kg',
  score_pref: 'e1rm',
  experience_level: 'intermediate',
  weight_class_kg: 80,
  sex: 'male',
  age_band: '25-34',
};

// ---------------------------------------------------------------------------
// SecureStore key
// ---------------------------------------------------------------------------

const REFRESH_TOKEN_KEY = 'peak_fettle_refresh_token';
const USER_PROFILE_KEY = 'peak_fettle_user_profile';

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

export interface AuthContextValue {
  /** The currently authenticated user, or null if not logged in. */
  user: User | null;
  /** In-memory access token (null when unauthenticated). */
  accessToken: string | null;
  /**
   * True when the user has an active session — either an in-memory access token
   * (normal) or a stored refresh token with a cached user (transient network
   * failure on cold-start refresh — the access token will be re-established by
   * the 401 interceptor on the first API call).
   */
  isAuthenticated: boolean;
  /**
   * True while:
   *   - The cold-start refresh is in flight, OR
   *   - A login/register request is in flight.
   * The root layout uses this to show a splash/loading screen instead of
   * flashing the login screen before the silent refresh completes.
   */
  isLoading: boolean;
  /** Log in with email and password. Navigates to tabs on success. */
  login: (email: string, password: string) => Promise<void>;
  /** Register a new account. Navigates to tabs on success. */
  register: (email: string, password: string, displayName?: string) => Promise<void>;
  /** Sign in with Apple / Google (TICKET-099). Verified server-side, then a session is established. */
  loginWithOAuth: (provider: 'google' | 'apple', idToken: string) => Promise<void>;
  /** Sign out. Revokes refresh token, clears all local state, navigates to login. */
  logout: () => Promise<void>;
  /**
   * Merge a partial User update into the in-memory user object.
   * Used by the profile screen to reflect settings changes (e.g. unit_pref)
   * without requiring a full re-fetch.
   */
  updateUser: (patch: Partial<User>) => void;
  /**
   * Phase 6 — upgrade the current user to Pro.
   *
   * SAFE-ORDERING (load-bearing): uploads the user's on-device SQLite data to
   * the server FIRST (while still tier='free'), then flips the server tier to
   * 'paid', then reflects Pro in-session, then (re)starts PowerSync sync. The
   * `is_paid` flip happens LAST so a mid-upload crash leaves the user safely
   * still-free and the upload (idempotent + resumable via the migration_state
   * ledger) just continues on the next attempt — never duplicating rows.
   *
   * @param onProgress optional (done, total) callback fired as each row/phase of
   *                   the upload completes, for a determinate progress UI.
   * @returns the migration tally (uploaded / skipped / failed + error lines).
   * @throws on a transient upload failure (network/5xx) — the UI can offer a
   *         "tap to resume" that re-calls this (the ledger skips finished rows).
   */
  upgradeToPro: (onProgress?: (done: number, total: number) => void) => Promise<MigrationOutcome>;
  /**
   * Phase 6 — downgrade the current user to Free.
   *
   * Flips the server tier to 'free' (server data is KEPT, never deleted), then
   * reflects Free in-session, then pauses PowerSync. The app reverts to
   * local-first: free mode never reads/writes the server, and the local SQLite
   * still holds everything so it works offline immediately (no download needed).
   */
  downgradeToFree: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export const AuthContext = createContext<AuthContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps): React.ReactElement {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Keep a ref for the refresh token so the apiClient interceptor can access
  // it synchronously without triggering a re-render.
  const refreshTokenRef = useRef<string | null>(null);

  // True only during the cold-start silent refresh. While set, the apiClient
  // 401 interceptor must NOT log the user out: the bootstrap owns the
  // authoritative refresh on launch, and a Pro data call that raced ahead of it
  // (fired before the in-memory access token existed) would otherwise trip a
  // 401 → onLogout and wipe a perfectly good session. See the bootstrap effect.
  const bootstrappingRef = useRef<boolean>(false);

  // ---------------------------------------------------------------------------
  // Helpers for persisting refresh token
  // ---------------------------------------------------------------------------

  const persistRefreshToken = useCallback(async (token: string) => {
    refreshTokenRef.current = token;
    await safeSecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
  }, []);

  const clearRefreshToken = useCallback(async () => {
    refreshTokenRef.current = null;
    await safeSecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  }, []);

  /** Persist the full user profile so it survives app restarts (cold-start fix). */
  const persistUser = useCallback(async (u: User) => {
    try {
      await safeSecureStore.setItemAsync(USER_PROFILE_KEY, JSON.stringify(u));
    } catch (err) {
      // Non-blocking — worst case the user has to log in again after restart.
      console.warn('[PF] AuthContext/persistUser:', err instanceof Error ? err.message : String(err));
    }
  }, []);

  /** Clear stored user profile on logout. */
  const clearUser = useCallback(async () => {
    try {
      await safeSecureStore.deleteItemAsync(USER_PROFILE_KEY);
    } catch (err) {
      // Ignore
      console.warn('[PF] AuthContext/clearUser:', err instanceof Error ? err.message : String(err));
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Core logout (shared by explicit logout + 401 interceptor callback)
  // ---------------------------------------------------------------------------

  const _clearAuthState = useCallback(async () => {
    const currentRefreshToken = refreshTokenRef.current;

    setUser(null);
    setAccessToken(null);
    // Clear the PowerSync connector token so sync pauses on logout.
    setPowerSyncToken(null);
    await clearRefreshToken();
    await clearUser();

    // Fire-and-forget: unregister push token so this device stops receiving
    // notifications. Errors are swallowed in the service — never blocks logout.
    unregisterForPushNotificationsAsync();

    // Fire-and-forget server-side revocation. AuthApi.logout() swallows
    // network errors gracefully.
    if (currentRefreshToken) {
      AuthApi.logout(currentRefreshToken);
    }
  }, [clearRefreshToken, clearUser]);

  // ---------------------------------------------------------------------------
  // Inject handlers into the Axios client
  // ---------------------------------------------------------------------------

  // Use a ref so getAccessToken() always reads the current token without
  // requiring the effect to re-run on every render.
  const accessTokenRef = useRef<string | null>(null);
  useEffect(() => {
    accessTokenRef.current = accessToken;
  }, [accessToken]);

  // Wire the interceptor once on mount. Closures access state via refs so
  // they always see the latest values without the effect needing to re-run.
  useEffect(() => {
    setAuthHandlers({
      getAccessToken: () => accessTokenRef.current,
      getRefreshToken: () => refreshTokenRef.current,
      onRefresh: (newAccessToken: string, newRefreshToken: string) => {
        setAccessToken(newAccessToken);
        accessTokenRef.current = newAccessToken;
        // Keep the PowerSync connector token current after a silent refresh.
        setPowerSyncToken(newAccessToken);
        persistRefreshToken(newRefreshToken);
      },
      onLogout: () => {
        // Suppress logout while the cold-start bootstrap is still running its
        // own authoritative refresh. A Pro data call that raced ahead of the
        // bootstrap (no in-memory access token yet) can 401 → land here; wiping
        // the session now is the forced-relogin bug. The bootstrap will set a
        // valid token momentarily (or itself classify a definitive failure).
        if (bootstrappingRef.current) {
          console.warn('[PF] AuthContext/onLogout: suppressed during cold-start bootstrap');
          return;
        }
        _clearAuthState().then(() => {
          router.replace('/(auth)/login');
        });
      },
    });
  }, [_clearAuthState, persistRefreshToken]); // stable callbacks — effect runs once

  // ---------------------------------------------------------------------------
  // Cold-start: attempt silent refresh
  // ---------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      // DEV MOCK: skip token refresh entirely — start unauthenticated.
      if (USE_MOCK_AUTH) {
        setIsLoading(false);
        return;
      }
      try {
        const storedRefreshToken = await safeSecureStore.getItemAsync(REFRESH_TOKEN_KEY);

        if (!storedRefreshToken) {
          // No token — user has never logged in or explicitly logged out.
          return;
        }

        refreshTokenRef.current = storedRefreshToken;
        // Guard the cold-start refresh window: a racing Pro 401 must not log us
        // out while this authoritative refresh is in flight (see onLogout).
        bootstrappingRef.current = true;

        // STARTUP PERF: restore the cached user profile and release the splash
        // IMMEDIATELY — do NOT block the whole app behind the /auth/refresh
        // network round-trip (that stalled every cold start behind a call to a
        // possibly-slow server). The token refresh runs in the background below;
        // free/local-first users make no token-dependent calls, and any Pro call
        // that races the refresh is recovered by the apiClient 401 interceptor.
        try {
          const storedUser = await safeSecureStore.getItemAsync(USER_PROFILE_KEY);
          if (storedUser && !cancelled) {
            setUser(JSON.parse(storedUser) as User);
          }
        } catch (err) {
          // Corrupted or missing — leave user null; login will fix it.
          console.warn('[PF] AuthContext/bootstrap restoreUser:', err instanceof Error ? err.message : String(err));
        }
        if (!cancelled) setIsLoading(false);

        // Silent token refresh — now runs AFTER the UI is up (non-blocking).
        // Race against an 8-second timeout so a hung/slow server doesn't stall
        // the background task indefinitely.
        const REFRESH_TIMEOUT_MS = 8_000;
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('refresh_timeout')), REFRESH_TIMEOUT_MS)
        );
        const tokens = await Promise.race([
          AuthApi.refreshTokens(storedRefreshToken),
          timeoutPromise,
        ]);

        if (cancelled) return;

        // Persist the rotated refresh token and update in-memory state.
        await persistRefreshToken(tokens.refreshToken);
        setAccessToken(tokens.accessToken);
        // Propagate the new token to the PowerSync connector.
        setPowerSyncToken(tokens.accessToken);
      } catch (err) {
        // Classify the error before deciding whether to wipe the stored token.
        //
        // Only clear on a DEFINITIVE server-side auth rejection:
        //   - HTTP 401 (Unauthorized) from the refresh endpoint
        //   - Response body error field containing "invalid", "revoked", or "expired"
        //
        // On network errors, timeouts (err.message === 'refresh_timeout'), or 5xx
        // server errors, KEEP the stored token so the user stays signed in.
        // The app will retry silently on the next launch, and any API call that
        // needs a valid access token will be recovered by the 401 interceptor.
        // Classify via the shared helper in the api client so the bootstrap
        // refresh and the 401 interceptor agree on what "definitive" means.
        // A genuine 401, or a 4xx whose body says the token is invalid/revoked/
        // expired, clears the token. A network error, a refresh_timeout, or a
        // 5xx is transient → keep the token (Invariant 5).
        const definitiveAuthFailure = isDefinitiveAuthFailure(err);
        // err.message === 'refresh_timeout' → network was slow, keep the token

        console.warn(
          '[PF] AuthContext/bootstrap silentRefresh:',
          definitiveAuthFailure ? 'definitive auth failure — clearing token' : 'transient error — keeping token',
          err instanceof Error ? err.message : String(err)
        );

        if (!cancelled && definitiveAuthFailure) {
          // Token is genuinely revoked/expired — clear everything and show login.
          await _clearAuthState();
          router.replace('/(auth)/login');
        }
        // Transient failure: user stays signed in with the cached profile.
        // Access token is null (not restored) until the next successful refresh,
        // but free/local-first users won't need it, and any authenticated call
        // will hit the 401 interceptor which retries the refresh.
      } finally {
        // Cold-start refresh is done (success, definitive failure, or transient
        // keep-token). Re-enable the 401 interceptor's logout path: from here a
        // genuine 401 means the session really is gone.
        bootstrappingRef.current = false;
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    bootstrap();
    return () => { cancelled = true; bootstrappingRef.current = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Empty deps: runs once on mount. persistRefreshToken and clearRefreshToken
  // are stable (useCallback with no deps). Adding them would make the linter
  // happy but cause a double-run on mount.

  // ---------------------------------------------------------------------------
  // Push token registration helper
  // ---------------------------------------------------------------------------

  /**
   * Fire-and-forget push token registration.
   * Errors are swallowed — push token failures must never block auth flow.
   * The stub in pushNotifications.ts returns null until expo-notifications
   * is installed, making this a safe no-op until then.
   *
   * Declared BEFORE login/register so it is in scope when those useCallback
   * deps arrays are evaluated (avoids temporal dead zone with const).
   */
  const _registerPushToken = useCallback(async () => {
    try {
      await registerForPushNotificationsAsync();
    } catch (err) {
      // Swallow — push registration is non-blocking.
      console.warn('[PF] AuthContext/_registerPushToken:', err instanceof Error ? err.message : String(err));
    }
  }, []);

  // ---------------------------------------------------------------------------
  // login()
  // ---------------------------------------------------------------------------

  const login = useCallback(
    async (email: string, password: string): Promise<void> => {
      // NOTE: do NOT set global isLoading here. isLoading is only for the
      // cold-start bootstrap spinner. Setting it true here unmounts the entire
      // screen tree (RootNavigator in _layout.tsx renders a spinner when true),
      // which destroys the login form's local error state on remount — making
      // API errors invisible to the user. Each auth screen manages its own
      // isSubmitting state for its loading button.
      try {
        // DEV MOCK: accept any credentials and log in instantly.
        if (USE_MOCK_AUTH) {
          setUser({ ...MOCK_USER, email });
          setAccessToken('mock-access-token');
          router.replace('/(tabs)/');
          return;
        }
        const response = await AuthApi.login(email, password);
        setUser(response.user);
        setAccessToken(response.accessToken);
        setPowerSyncToken(response.accessToken);
        await persistRefreshToken(response.refreshToken);
        // Persist user profile so cold-start can restore it without /auth/me.
        persistUser(response.user);
        _registerPushToken();
        router.replace('/(tabs)/');
      } catch (err) {
        // Re-throw so the login screen's catch block can show the error.
        throw err;
      }
    },
    [persistRefreshToken, persistUser, _registerPushToken]
  );

  // ---------------------------------------------------------------------------
  // register()
  // ---------------------------------------------------------------------------

  const register = useCallback(
    async (email: string, password: string, displayName?: string): Promise<void> => {
      // NOTE: do NOT set global isLoading here — same reason as login().
      // isLoading is only for the cold-start bootstrap. The register screen
      // manages its own isSubmitting state for the button loading indicator.
      try {
        // DEV MOCK: create account instantly with provided details.
        if (USE_MOCK_AUTH) {
          setUser({ ...MOCK_USER, email, display_name: displayName ?? null });
          setAccessToken('mock-access-token');
          // Route through splash so first-launch flag check runs and new users
          // see the intro flow before onboarding (P2-001 / §2.2).
          router.replace('/splash');
          return;
        }
        const response = await AuthApi.register(email, password, displayName);
        setUser(response.user);
        setAccessToken(response.accessToken);
        // Propagate fresh token to PowerSync connector so sync starts immediately.
        setPowerSyncToken(response.accessToken);
        await persistRefreshToken(response.refreshToken);
        // Persist user profile so cold-start can restore it without /auth/me.
        persistUser(response.user);
        // TICKET-024: register push token after new account creation (fire-and-forget).
        _registerPushToken();
        // Route through splash so new users see the intro flow (P2-001 / §2.2)
        // before landing in onboarding. Splash clears the first-launch flag and
        // navigates to /intro → /onboarding for first-timers.
        router.replace('/splash');
      } catch (err) {
        // Re-throw so the register screen's catch block can show the error.
        throw err;
      }
    },
    [persistRefreshToken, persistUser, _registerPushToken]
  );

  // ---------------------------------------------------------------------------
  // loginWithOAuth() — TICKET-099 (Apple / Google)
  // ---------------------------------------------------------------------------

  const loginWithOAuth = useCallback(
    async (provider: 'google' | 'apple', idToken: string): Promise<void> => {
      if (USE_MOCK_AUTH) {
        setUser({ ...MOCK_USER });
        setAccessToken('mock-access-token');
        router.replace('/(tabs)/');
        return;
      }
      const response = await AuthApi.oauthLogin(provider, idToken);
      setUser(response.user);
      setAccessToken(response.accessToken);
      setPowerSyncToken(response.accessToken);
      await persistRefreshToken(response.refreshToken);
      persistUser(response.user);
      _registerPushToken();
      // New accounts route through splash -> intro -> onboarding; returning users to tabs.
      router.replace(response.isNew ? '/splash' : '/(tabs)/');
    },
    [persistRefreshToken, persistUser, _registerPushToken]
  );

  // ---------------------------------------------------------------------------
  // logout()
  // ---------------------------------------------------------------------------

  const logout = useCallback(async (): Promise<void> => {
    await _clearAuthState();
    router.replace('/(auth)/login');
  }, [_clearAuthState]);

  // ---------------------------------------------------------------------------
  // updateUser() — partial in-memory patch for profile edits
  // ---------------------------------------------------------------------------

  const updateUser = useCallback((patch: Partial<User>): void => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      // Keep the persisted profile in sync so cold-start restores the latest state.
      persistUser(next);
      return next;
    });
  }, [persistUser]);

  // ---------------------------------------------------------------------------
  // upgradeToPro() — Phase 6 Free→Pro transition (ORDER is load-bearing)
  // ---------------------------------------------------------------------------

  /**
   * Free→Pro upgrade. The step order is the whole point — `is_paid` flips LAST
   * so a mid-upload crash is recoverable as still-free (see AuthContextValue
   * docs and the Phase-6 design). Idempotent + resumable: the uploader skips
   * everything already in the migration_state ledger, and POST /user/upgrade is
   * a no-op on an already-paid user.
   */
  const upgradeToPro = useCallback(
    async (
      onProgress?: (done: number, total: number) => void,
    ): Promise<MigrationOutcome> => {
      if (!user) throw new Error('upgradeToPro: no authenticated user');

      // Fast path: already Pro (e.g. a double-tap, or a prior run flipped the
      // server tier but the app died before the in-session flip). Don't re-run
      // the uploader — just make sure sync is (re)authorised and return an empty
      // tally. The upload is safe to re-run, but skipping it avoids needless work.
      if (user.is_paid) {
        setPowerSyncToken(accessTokenRef.current);
        return { uploaded: 0, skipped: 0, failed: 0, errors: [] };
      }

      // 1. Upload on-device data FIRST, while the server is still tier='free'.
      //    Resumable + idempotent; throws on a transient (network/5xx) failure so
      //    the caller can offer "tap to resume". This is the ONE sanctioned REST
      //    burst for a former-free user — it runs during an explicit upgrade, not
      //    on a free mount, so the local-first invariant holds.
      const result = await migrateLocalDataToServer(onProgress);

      // 2. ONLY after a fully successful upload, flip the server tier to 'paid'.
      //    Idempotent on the server. Returns the updated User (with derived
      //    is_paid === true, tier === 'paid').
      const updated = await upgradeToProRequest();

      // 3. Reflect Pro in-session and persist (this is the is_paid=true flip the
      //    app actually sees). Spread the explicit derived fields so the local
      //    state is correct even if the server response shape ever drifts.
      updateUser({ ...updated, is_paid: true, tier: 'paid' });

      // 4. Start sync LAST. The connector token is already current (set on every
      //    auth event), but nudge PowerSync so it (re)authorises and begins
      //    syncing the just-uploaded data now. Safe no-op if unchanged.
      setPowerSyncToken(accessTokenRef.current);

      return result;
    },
    [user, updateUser],
  );

  // ---------------------------------------------------------------------------
  // downgradeToFree() — Phase 6 Pro→Free (server data KEPT, never deleted)
  // ---------------------------------------------------------------------------

  /**
   * Pro→Free downgrade. Flip the server first (authoritative), then the client
   * `is_paid=false` (so the app stops Pro reads), then pause PowerSync. Server
   * rows are retained but never read in free mode; the local SQLite remains the
   * free-tier source of truth, so no download step is needed.
   */
  const downgradeToFree = useCallback(async (): Promise<void> => {
    if (!user) throw new Error('downgradeToFree: no authenticated user');

    // 1. Flip the server tier to 'free' (KEEPS all server rows). Idempotent.
    const updated = await downgradeToFreeRequest();

    // 2. Reflect Free in-session + persist so the app stops issuing Pro reads.
    updateUser({ ...updated, is_paid: false, tier: 'free' });

    // 3. Pause PowerSync — free mode is local-first and never reads the server.
    //    Do NOT clear localDb: it still holds everything, so free mode works
    //    offline immediately.
    setPowerSyncToken(null);
  }, [user, updateUser]);

  // ---------------------------------------------------------------------------
  // Context value
  // ---------------------------------------------------------------------------

  const value: AuthContextValue = {
    user,
    accessToken,
    // True when the user has a valid session — either an in-memory access token
    // (normal) or a cached user + stored refresh token (transient cold-start
    // refresh failure). In the latter case the 401 interceptor re-establishes
    // the access token on the first API call, so the user never sees login.
    isAuthenticated: !!(accessToken || (user && refreshTokenRef.current)),
    isLoading,
    login,
    register,
    loginWithOAuth,
    logout,
    updateUser,
    upgradeToPro,
    downgradeToFree,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
