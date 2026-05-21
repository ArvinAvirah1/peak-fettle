/**
 * Peak Fettle — Auth API calls
 * Covers: login, register, logout, token refresh.
 */

import { apiClient, setTokens, clearTokens, REFRESH_KEY, API_BASE_URL, TOKEN_KEY } from './client';
import * as SecureStore from 'expo-secure-store';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LoginRequest {
    email:    string;
    password: string;
}

export interface RegisterRequest {
    email:       string;
    password:    string;
    displayName?: string;
}

export interface AuthResponse {
    accessToken:  string;
    refreshToken: string;
    user: {
        id:           string;
        email:        string;
        displayName:  string | null;
        tier:         'free' | 'paid';
        unitPref:     'kg' | 'lbs';
        scorePref:    'peak_fettle' | 'wilks' | 'dots';
    };
}

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

/** Login and persist tokens in SecureStore. */
export async function login(payload: LoginRequest): Promise<AuthResponse> {
    const data = await apiClient.post<AuthResponse>('/auth/login', payload, { auth: false });
    await setTokens(data.accessToken, data.refreshToken);
    return data;
}

/** Register a new account and persist tokens. */
export async function register(payload: RegisterRequest): Promise<AuthResponse> {
    const data = await apiClient.post<AuthResponse>('/auth/register', payload, { auth: false });
    await setTokens(data.accessToken, data.refreshToken);
    return data;
}

/** Logout: revoke refresh token server-side and clear local storage. */
export async function logout(): Promise<void> {
    try {
        await apiClient.post('/auth/logout', {});
    } catch {
        // Best-effort server revocation — clear local tokens regardless.
    }
    await clearTokens();
}

/** Silently refresh the access token. Returns new access token or null. */
export async function refreshAccessToken(): Promise<string | null> {
    const refreshToken = await SecureStore.getItemAsync(REFRESH_KEY);
    if (!refreshToken) return null;

    try {
        const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ refreshToken }),
        });
        if (!response.ok) return null;
        const data = await response.json() as { accessToken: string };
        await SecureStore.setItemAsync(TOKEN_KEY, data.accessToken);
        return data.accessToken;
    } catch {
        return null;
    }
}
