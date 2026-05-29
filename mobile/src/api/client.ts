/**
 * Base Axios client for the Peak Fettle REST API.
 *
 * Responsibilities:
 *   1. Read base URL from EXPO_PUBLIC_API_URL (env var, safe for client bundle).
 *   2. Attach Authorization: Bearer <accessToken> to every request.
 *   3. On 401 response: call /auth/refresh once with the stored refresh token,
 *      retry the original request with the new access token.
 *   4. If the refresh also fails (token revoked / expired): call logout() and
 *      let AuthContext redirect the user to the login screen.
 *
 * The access token is read from a module-level setter (setAuthHandlers) rather
 * than imported directly from AuthContext, to avoid a circular dependency:
 *   client.ts → AuthContext → client.ts
 *
 * Usage in AuthContext:
 *   import { setAuthHandlers } from '@/api/client';
 *   setAuthHandlers({ getAccessToken, getRefreshToken, onRefresh, onLogout });
 */

import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  InternalAxiosRequestConfig,
  AxiosResponse,
} from 'axios';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';

// ---------------------------------------------------------------------------
// Auth handler interface — injected by AuthContext at startup
// ---------------------------------------------------------------------------

interface AuthHandlers {
  /** Returns the current in-memory access token (null if not authenticated). */
  getAccessToken: () => string | null;
  /** Returns the persisted refresh token from SecureStore (null if none). */
  getRefreshToken: () => string | null;
  /**
   * Called after a successful silent refresh.
   * Handlers must update in-memory state with the new token pair.
   */
  onRefresh: (accessToken: string, refreshToken: string) => void;
  /** Called when the refresh fails — AuthContext should clear state and redirect. */
  onLogout: () => void;
}

let _authHandlers: AuthHandlers | null = null;

/**
 * Inject auth callbacks from AuthContext.
 * Must be called once during app boot (before any API request is made).
 */
export function setAuthHandlers(handlers: AuthHandlers): void {
  _authHandlers = handlers;
}

// ---------------------------------------------------------------------------
// Axios instance
// ---------------------------------------------------------------------------

export const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 15_000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ---------------------------------------------------------------------------
// Request interceptor — attach Bearer token
// ---------------------------------------------------------------------------

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig): InternalAxiosRequestConfig => {
    const token = _authHandlers?.getAccessToken();
    if (token && config.headers) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error: unknown) => Promise.reject(error)
);

// ---------------------------------------------------------------------------
// Response interceptor — handle 401 with one silent refresh attempt
// ---------------------------------------------------------------------------

/**
 * Track whether a refresh is already in flight to prevent multiple
 * simultaneous refresh calls (race condition when many requests 401 together).
 */
let _refreshPromise: Promise<string> | null = null;

apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: unknown) => {
    // Narrow to an Axios error shape.
    if (!axios.isAxiosError(error)) {
      return Promise.reject(error);
    }

    const originalRequest = error.config as AxiosRequestConfig & { _retried?: boolean };

    if (error.response?.status !== 401 || originalRequest._retried) {
      // Not a 401, or we already retried — bubble up.
      return Promise.reject(error);
    }

    if (!_authHandlers) {
      return Promise.reject(error);
    }

    const refreshToken = _authHandlers.getRefreshToken();
    if (!refreshToken) {
      // No refresh token — user needs to log in again.
      _authHandlers.onLogout();
      return Promise.reject(error);
    }

    originalRequest._retried = true;

    try {
      // Deduplicate concurrent refresh calls.
      if (!_refreshPromise) {
        _refreshPromise = _doRefresh(refreshToken).finally(() => {
          _refreshPromise = null;
        });
      }
      const newAccessToken = await _refreshPromise;

      // Retry the original request with the new token.
      if (originalRequest.headers) {
        (originalRequest.headers as Record<string, string>)[
          'Authorization'
        ] = `Bearer ${newAccessToken}`;
      }
      return apiClient(originalRequest);
    } catch (err) {
      console.warn('[PF] client/responseInterceptor:', err instanceof Error ? err.message : String(err));
      _authHandlers.onLogout();
      return Promise.reject(error);
    }
  }
);

// ---------------------------------------------------------------------------
// Internal refresh helper
// ---------------------------------------------------------------------------

async function _doRefresh(refreshToken: string): Promise<string> {
  // Use a plain axios call (not apiClient) to avoid triggering the interceptor
  // again and creating an infinite loop.
  const response = await axios.post<{ accessToken: string; refreshToken: string }>(
    `${BASE_URL}/auth/refresh`,
    { refreshToken },
    { timeout: 10_000 }
  );
  const { accessToken, refreshToken: newRefreshToken } = response.data;

  // Let AuthContext persist the new token pair.
  _authHandlers?.onRefresh(accessToken, newRefreshToken);

  return accessToken;
}
