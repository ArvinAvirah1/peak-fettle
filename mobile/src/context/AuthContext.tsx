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
import { router } from 'expo-router';

import { setAuthHandlers } from '../api/client';
import { setAccessToken as setPowerSyncToken } from '../db/connector';
import * as AuthApi from '../api/auth';
import { User } from '../types/api';
import { registerForPushNotifications } from '../services/pushNotifications';
import { registerPushToken } from '../api/pushTokens';

// ---------------------------------------------------------------------------
// SecureStore key
// ---------------------------------------------------------------------------

const REFRESH_TOKEN_KEY = 'peak_fettle_refresh_token';

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
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
  }, []);

  const clearRefreshToken = useCallback(async () => {
    refreshTokenRef.current = null;
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
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

    // Fire-and-forget server-side revocation. AuthApi.logout() swallows
    // network errors gracefully.
    if (currentRefreshToken) {
      AuthApi.logout(currentRefreshToken);
    }
  }, [clearRefreshToken]);

  // ---------------------------------------------------------------------------
  // Inject handlers into the Axios client
  // ---------------------------------------------------------------------------

  // We do this once during mount (before cold-start refresh runs) so the
  // interceptor is ready the moment any request fires.
  useEffect(() => {
    setAuthHandlers({
      getAccessToken: () => accessToken,
      getRefreshToken: () => refreshTokenRef.current,
      onRefresh: (newAccessToken: string, newRefreshToken: string) => {
        setAccessToken(newAccessToken);
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
  });
  // Note: this effect re-runs on every render to keep `accessToken` closure
  // fresh inside getAccessToken(). The cost is negligible.

  // ---------------------------------------------------------------------------
  // Cold-start: attempt silent refresh
  // ---------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const storedRefreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);

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

        // TODO: fetch the user profile here once a GET /auth/me endpoint is added.
        // For now, the full user object is returned only on login/register.
        // The accessToken's JWT payload contains id + email as a fallback.
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
  // login()
  // ---------------------------------------------------------------------------

  const login = useCallback(
    async (email: string, password: string): Promise<void> => {
      setIsLoading(true);
      try {
        const response = await AuthApi.login(email, password);
        setUser(response.user);
        setAccessToken(response.accessToken);
        // Propagate fresh token to PowerSync connector so sync resumes.
        setPowerSyncToken(response.accessToken);
        await persistRefreshToken(response.refreshToken);
        // TICKET-024: register push token after login (fire-and-forget).
        _registerPushToken();
        router.replace('/(tabs)/');
      } finally {
        setIsLoading(false);
      }
    },
    [persistRefreshToken, _registerPushToken]
  );

  // ---------------------------------------------------------------------------
  // register()
  // ---------------------------------------------------------------------------

  const register = useCallback(
    async (email: string, password: string, displayName?: string): Promise<void> => {
      setIsLoading(true);
      try {
        const response = await AuthApi.register(email, password, displayName);
        setUser(response.user);
        setAccessToken(response.accessToken);
        // Propagate fresh token to PowerSync connector so sync starts immediately.
        setPowerSyncToken(response.accessToken);
        await persistRefreshToken(response.refreshToken);
        // TICKET-024: register push token after new account creation (fire-and-forget).
        _registerPushToken();
        // TICKET-038 (ROADMAP 1.6): new registrations go to onboarding to collect
        // biological sex + primary discipline for percentile cohort segmentation.
        // Onboarding navigates to /(tabs)/ on completion or skip.
        router.replace('/onboarding');
      } finally {
        setIsLoading(false);
      }
    },
    [persistRefreshToken, _registerPushToken]
  );

  // ---------------------------------------------------------------------------
  // Push token registration helper
  // ---------------------------------------------------------------------------

  /**
   * Fire-and-forget push token registration.
   * Errors are swallowed — push token failures must never block auth flow.
   * The stub in pushNotifications.ts returns null until expo-notifications
   * is installed, making this a safe no-op until then.
   */
  const _registerPushToken = useCallback(async () => {
    try {
      const result = await registerForPushNotifications();
      if (result) {
        // Best-effort — 404 expected until backend /user/push-token ships.
        await registerPushToken({ token: result.token, platform: result.platform });
      }
    } catch {
      // Swallow — push registration is non-blocking.
    }
  }, []);

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
    setUser((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

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
