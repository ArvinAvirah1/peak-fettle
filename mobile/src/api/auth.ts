/**
 * Auth API module.
 *
 * Wraps /auth endpoints. AuthContext calls these functions; UI screens call
 * AuthContext — screens should never import this file directly.
 *
 * Note: the refresh flow is handled transparently by the Axios interceptor in
 * client.ts. The refreshTokens() function here is exposed for AuthContext's
 * cold-start bootstrap only.
 */

import axios from 'axios';
import { AuthResponse, AuthTokens } from '../types/api';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';

// Every auth call MUST have an explicit timeout. These use plain axios (not the
// shared apiClient, whose 15s timeout they'd otherwise inherit) because:
//   - login/register have no Bearer token to attach.
//   - refresh must not trigger the 401 interceptor (would loop).
// Without a timeout a hung/unreachable server leaves the calling screen's
// `isSubmitting` true forever → the Sign In / Create Account button stays
// disabled (spinner) and "does nothing" until the app is force-quit. That was
// the reported "button does nothing after being signed out" bug. A bounded
// timeout makes the request reject, the screen's finally{} re-enables the
// button, and the error surfaces. (AUTH-RELIABILITY, 2026-06-19)
const AUTH_TIMEOUT_MS = 15_000;

/**
 * POST /auth/login
 * @throws ApiError with `error` field on failure (e.g. 'invalid_credentials').
 */
export async function login(email: string, password: string): Promise<AuthResponse> {
  const response = await axios.post<AuthResponse>(
    `${BASE_URL}/auth/login`,
    { email, password },
    { timeout: AUTH_TIMEOUT_MS },
  );
  return response.data;
}

/**
 * POST /auth/signup
 * @throws ApiError on validation failure or duplicate email.
 */
export async function register(
  email: string,
  password: string,
  displayName?: string
): Promise<AuthResponse> {
  const response = await axios.post<AuthResponse>(
    `${BASE_URL}/auth/signup`,
    { email, password, displayName },
    { timeout: AUTH_TIMEOUT_MS },
  );
  return response.data;
}

/**
 * POST /auth/refresh
 * Validates the refresh token and returns a new rotated token pair.
 * The server uses single-use refresh token rotation (T-02 hardening).
 * @throws on invalid/expired/revoked token — caller must redirect to login.
 */
/**
 * POST /auth/oauth — Sign in with Apple / Google (TICKET-099).
 * The provider id_token is obtained on the client (expo-apple-authentication /
 * expo-auth-session — added in the dev/EAS build) and verified server-side.
 * Returns the same {user, accessToken, refreshToken} shape as login(); the
 * backup identity (TICKET-094) is keyed to the resulting account.
 */
export async function oauthLogin(
  provider: 'google' | 'apple',
  idToken: string
): Promise<AuthResponse & { isNew?: boolean }> {
  const response = await axios.post<AuthResponse & { isNew?: boolean }>(
    `${BASE_URL}/auth/oauth`,
    { provider, idToken },
    { timeout: AUTH_TIMEOUT_MS },
  );
  return response.data;
}

export async function refreshTokens(refreshToken: string): Promise<AuthTokens> {
  const response = await axios.post<AuthTokens>(
    `${BASE_URL}/auth/refresh`,
    { refreshToken },
    { timeout: AUTH_TIMEOUT_MS },
  );
  return response.data;
}

/**
 * POST /auth/logout
 * Revokes the refresh token on the server. Tolerates network failures
 * gracefully — the caller should clear local state regardless of whether
 * this request succeeds.
 */
export async function logout(refreshToken: string): Promise<void> {
  try {
    await axios.post(`${BASE_URL}/auth/logout`, { refreshToken }, { timeout: 5_000 });
  } catch {
    // Fire-and-forget. If the server is unreachable, the token will expire
    // naturally after 30 days. The client clears its local state either way.
  }
}
