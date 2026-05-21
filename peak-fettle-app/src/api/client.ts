/**
 * Peak Fettle — typed API client
 *
 * Thin wrapper around fetch that:
 *   - Reads the base URL from EXPO_PUBLIC_API_BASE_URL
 *   - Attaches the stored JWT access token to every authenticated request
 *   - Throws ApiError (with typed code + message) on non-2xx responses
 *   - Handles 401 → clears stored tokens and routes to login
 *
 * Usage:
 *   import { apiClient } from '@/api/client';
 *   const data = await apiClient.get<MyResponse>('/percentile');
 *   const result = await apiClient.post<CreateResponse>('/workouts', body);
 */

import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const API_BASE_URL =
    (process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:4000').replace(/\/$/, '');

export const TOKEN_KEY   = 'pf_access_token';
export const REFRESH_KEY = 'pf_refresh_token';

// ---------------------------------------------------------------------------
// Typed error
// ---------------------------------------------------------------------------

export class ApiError extends Error {
    constructor(
        public readonly status: number,
        public readonly code:   string,
        message:                string,
    ) {
        super(message);
        this.name = 'ApiError';
    }
}

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

export async function getAccessToken(): Promise<string | null> {
    return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setTokens(access: string, refresh: string): Promise<void> {
    await SecureStore.setItemAsync(TOKEN_KEY,   access);
    await SecureStore.setItemAsync(REFRESH_KEY, refresh);
}

export async function clearTokens(): Promise<void> {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_KEY);
}

// ---------------------------------------------------------------------------
// Core request helper
// ---------------------------------------------------------------------------

interface RequestOptions {
    method:  'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
    path:    string;
    body?:   unknown;
    /** Pass false to skip the Authorization header (e.g. /auth/login). */
    auth?:   boolean;
    signal?: AbortSignal;
}

async function request<T>(opts: RequestOptions): Promise<T> {
    const { method, path, body, auth = true, signal } = opts;

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept':       'application/json',
    };

    if (auth) {
        const token = await getAccessToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
        method,
        headers,
        body:   body !== undefined ? JSON.stringify(body) : undefined,
        signal,
    });

    // 204 No Content — no JSON to parse
    if (response.status === 204) {
        return undefined as unknown as T;
    }

    // Parse response body (always JSON from our API)
    let data: unknown;
    try {
        data = await response.json();
    } catch {
        data = {};
    }

    if (!response.ok) {
        // 401: clear tokens and redirect to login
        if (response.status === 401) {
            await clearTokens();
            router.replace('/login');
        }

        const errorData = data as { error?: string; message?: string };
        throw new ApiError(
            response.status,
            errorData.error   ?? 'api_error',
            errorData.message ?? `Request failed with status ${response.status}`,
        );
    }

    return data as T;
}

// ---------------------------------------------------------------------------
// Public API client
// ---------------------------------------------------------------------------

export const apiClient = {
    get: <T>(path: string, opts?: Omit<RequestOptions, 'method' | 'path' | 'body'>) =>
        request<T>({ ...opts, method: 'GET', path }),

    post: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'path' | 'body'>) =>
        request<T>({ ...opts, method: 'POST', path, body }),

    patch: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'path' | 'body'>) =>
        request<T>({ ...opts, method: 'PATCH', path, body }),

    put: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'path' | 'body'>) =>
        request<T>({ ...opts, method: 'PUT', path, body }),

    delete: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'path' | 'body'>) =>
        request<T>({ ...opts, method: 'DELETE', path, body }),
};
