/**
 * AuthContext — shared Peak Fettle account in the Life OS app.
 *
 * One account, two apps: same /auth/login, /auth/refresh, /auth/logout
 * endpoints as the fitness app. Tokens persist in expo-secure-store.
 *
 * Entitlement (TICKET-101 #3): after login we fetch GET /user/profile and
 * read `lifeos_access` (server-derived from users.tier — never computed
 * client-side, so a JWT can't be massaged into access). Free users are
 * routed to the upsell screen by the root layout.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { apiClient, setAuthHandlers } from '../api/client';

const KEY_ACCESS = 'lifeos.accessToken';
const KEY_REFRESH = 'lifeos.refreshToken';

export interface ProfileSummary {
  id: string;
  email: string;
  display_name: string | null;
  tier: 'free' | 'paid';
  lifeos_access: boolean;
}

interface AuthContextValue {
  isLoading: boolean;
  isAuthenticated: boolean;
  profile: ProfileSummary | null;
  /** null until the entitlement check completes. */
  hasLifeOsAccess: boolean | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  /**
   * Sign in with Apple / Google: provider id_token -> POST /auth/oauth (TICKET-099 server).
   * Rejects with an axios 409 `private_relay_no_account` when the Apple ID uses
   * Hide My Email and matches no account — the caller should then offer
   * linkOAuth (existing account) or retry with intent 'create' (new account).
   */
  loginWithOAuth: (
    provider: 'apple' | 'google',
    idToken: string,
    opts?: { intent?: 'create' }
  ) => Promise<void>;
  /**
   * One-time Hide My Email link: proves the provider id_token AND the existing
   * account's password to POST /auth/oauth/link, which maps the Apple identity
   * to that account and signs in. Afterwards plain Apple sign-in just works.
   */
  linkOAuth: (
    provider: 'apple' | 'google',
    idToken: string,
    email: string,
    password: string
  ) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [isLoading, setIsLoading] = useState(true);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileSummary | null>(null);

  // ---- token persistence ----------------------------------------------------

  const persistTokens = useCallback(async (access: string | null, refresh: string | null) => {
    setAccessToken(access);
    setRefreshToken(refresh);
    if (access) await SecureStore.setItemAsync(KEY_ACCESS, access);
    else await SecureStore.deleteItemAsync(KEY_ACCESS).catch(() => undefined);
    if (refresh) await SecureStore.setItemAsync(KEY_REFRESH, refresh);
    else await SecureStore.deleteItemAsync(KEY_REFRESH).catch(() => undefined);
  }, []);

  const clearSession = useCallback(() => {
    setProfile(null);
    void persistTokens(null, null);
  }, [persistTokens]);

  // ---- wire interceptor handlers (module-level, latest state via refs) -------

  const accessRef = React.useRef<string | null>(null);
  const refreshRef = React.useRef<string | null>(null);
  accessRef.current = accessToken;
  refreshRef.current = refreshToken;

  useEffect(() => {
    setAuthHandlers({
      getAccessToken: () => accessRef.current,
      getRefreshToken: () => refreshRef.current,
      onRefresh: (a, r) => {
        void persistTokens(a, r);
      },
      onLogout: clearSession,
    });
  }, [persistTokens, clearSession]);

  // ---- profile / entitlement --------------------------------------------------

  const refreshProfile = useCallback(async () => {
    const res = await apiClient.get<ProfileSummary>('/user/profile');
    setProfile(res.data);
  }, []);

  // ---- boot: restore persisted session ---------------------------------------

  useEffect(() => {
    (async () => {
      try {
        const [storedAccess, storedRefresh] = await Promise.all([
          SecureStore.getItemAsync(KEY_ACCESS),
          SecureStore.getItemAsync(KEY_REFRESH),
        ]);
        if (storedAccess && storedRefresh) {
          accessRef.current = storedAccess;
          refreshRef.current = storedRefresh;
          setAccessToken(storedAccess);
          setRefreshToken(storedRefresh);
          try {
            const res = await apiClient.get<ProfileSummary>('/user/profile');
            setProfile(res.data);
          } catch {
            // Offline boot is fine — local-first app. Entitlement re-checks
            // next time we're online; cached profile stays null until then.
          }
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  // ---- actions -----------------------------------------------------------------

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await apiClient.post<{ accessToken: string; refreshToken: string }>('/auth/login', {
        email,
        password,
      });
      await persistTokens(res.data.accessToken, res.data.refreshToken);
      accessRef.current = res.data.accessToken;
      refreshRef.current = res.data.refreshToken;
      await refreshProfile();
    },
    [persistTokens, refreshProfile]
  );

  const register = useCallback(
    async (email: string, password: string) => {
      const res = await apiClient.post<{ accessToken: string; refreshToken: string }>('/auth/register', {
        email,
        password,
      });
      await persistTokens(res.data.accessToken, res.data.refreshToken);
      accessRef.current = res.data.accessToken;
      refreshRef.current = res.data.refreshToken;
      await refreshProfile();
    },
    [persistTokens, refreshProfile]
  );

  const loginWithOAuth = useCallback(
    async (provider: 'apple' | 'google', idToken: string, opts?: { intent?: 'create' }) => {
      const res = await apiClient.post<{ accessToken: string; refreshToken: string }>('/auth/oauth', {
        provider,
        idToken,
        ...(opts?.intent ? { intent: opts.intent } : {}),
      });
      await persistTokens(res.data.accessToken, res.data.refreshToken);
      accessRef.current = res.data.accessToken;
      refreshRef.current = res.data.refreshToken;
      await refreshProfile();
    },
    [persistTokens, refreshProfile]
  );

  const linkOAuth = useCallback(
    async (provider: 'apple' | 'google', idToken: string, email: string, password: string) => {
      const res = await apiClient.post<{ accessToken: string; refreshToken: string }>(
        '/auth/oauth/link',
        { provider, idToken, email, password }
      );
      await persistTokens(res.data.accessToken, res.data.refreshToken);
      accessRef.current = res.data.accessToken;
      refreshRef.current = res.data.refreshToken;
      await refreshProfile();
    },
    [persistTokens, refreshProfile]
  );

  const logout = useCallback(async () => {
    try {
      await apiClient.post('/auth/logout', { refreshToken: refreshRef.current });
    } catch {
      // Best-effort server-side revoke; local session clears regardless.
    }
    clearSession();
  }, [clearSession]);

  const value: AuthContextValue = useMemo(
    () => ({
      isLoading,
      isAuthenticated: accessToken != null,
      profile,
      hasLifeOsAccess: profile ? profile.lifeos_access : null,
      login,
      register,
      loginWithOAuth,
      linkOAuth,
      logout,
      refreshProfile,
    }),
    [isLoading, accessToken, profile, login, register, loginWithOAuth, linkOAuth, logout, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
