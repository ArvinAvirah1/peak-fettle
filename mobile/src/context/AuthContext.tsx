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
const safeSecureStore = {
  async getItemAsync(key: string): Promise<string | null> {
    if (Platform.OS === 'web') return _webStore.get(key) ?? null;
    return SecureStore.getItemAsync(key);
  },
  async setItemAsync(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') { _webStore.set(key, value); return; }
    return SecureStore.setItemAsync(key, value);
  },
  async deleteItemAsync(key: string): Promise<void> {
    if (Platform.OS === 'web') { _webStore.delete(key); return; }
    return SecureStore.deleteItemAsync(key);
  },
};

import { setAuthHandlers } from '../api/client';
import { setAccessToken as setPowerSyncToken } from '../db/connector';
import * as AuthApi from '../api/auth';
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
  /** True if the user has completed auth (login/register) and has a valid token. */
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
  /** Sign out. Revokes refresh token, clears all local state, navigates to login. */
  logout: () => Promise<void>;
  /**
   * Merge a partial User update into the in-memory user object.
   * Used by the profile screen to reflect settings changes (e.g. unit_pref)
   * without requiring a full re-fetch.
   */
  updateUser: (patch: Partial<User>) => void;
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
    } catch {
      // Non-blocking — worst case the user has to log in again after restart.
    }
  }, []);

  /** Clear stored user profile on logout. */
  const clearUser = useCallback(async () => {
    try {
      await safeSecureStore.deleteItemAsync(USER_PROFILE_KEY);
    } catch {
      // Ignore
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

        const tokens = await AuthApi.refreshTokens(storedRefreshToken);

        if (cancelled) return;

        // Persist the rotated refresh token and update in-memory state.
        await persistRefreshToken(tokens.refreshToken);
        setAccessToken(tokens.accessToken);
        // Propagate the new token to the PowerSync connector.
        setPowerSyncToken(tokens.accessToken);

        // Restore the persisted user profile so the app works immediately on
        // cold start without a separate /auth/me round-trip. The profile is
        // written to SecureStore on every login/register and kept in sync via
        // updateUser(). If it's missing (first install / cleared storage) the
        // user will see null and routes that depend on the profile gracefully
        // degrade until the next login refreshes it.
        if (!cancelled) {
          try {
            const storedUser = await safeSecureStore.getItemAsync(USER_PROFILE_KEY);
            if (storedUser) {
              setUser(JSON.parse(storedUser) as User);
            }
          } catch {
            // Corrupted or missing — leave user null; login will fix it.
          }
        }
      } catch {
        if (!cancelled) {
          // Refresh token was revoked/expired — clear everything and show login.
          await clearRefreshToken();
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    bootstrap();
    return () => { cancelled = true; };
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
    } catch {
      // Swallow — push registration is non-blocking.
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
  // Context value
  // ---------------------------------------------------------------------------

  const value: AuthContextValue = {
    user,
    accessToken,
    isAuthenticated: !!accessToken,
    isLoading,
    login,
    register,
    logout,
    updateUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
