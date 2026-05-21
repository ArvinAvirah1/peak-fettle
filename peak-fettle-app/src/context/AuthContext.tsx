/**
 * Peak Fettle — Auth Context
 *
 * Provides the current user + login/logout/register helpers to the whole app.
 * Token persistence is handled by SecureStore (via api/auth.ts).
 *
 * The root layout reads `isAuthenticated` to decide which navigator to mount:
 *   - true  → (tabs) — main app
 *   - false → (auth) — login / register
 */

import React, {
    createContext,
    useContext,
    useState,
    useEffect,
    useCallback,
    type ReactNode,
} from 'react';
import {
    login         as apiLogin,
    logout        as apiLogout,
    register      as apiRegister,
    type LoginRequest,
    type RegisterRequest,
    type AuthResponse,
} from '@/api/auth';
import { getAccessToken } from '@/api/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthUser {
    id:          string;
    email:       string;
    displayName: string | null;
    tier:        'free' | 'paid';
    unitPref:    'kg' | 'lbs';
    scorePref:   'peak_fettle' | 'wilks' | 'dots';
}

interface AuthContextValue {
    user:            AuthUser | null;
    isAuthenticated: boolean;
    isLoading:       boolean;
    login:           (payload: LoginRequest)    => Promise<void>;
    register:        (payload: RegisterRequest) => Promise<void>;
    logout:          ()                         => Promise<void>;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AuthContext = createContext<AuthContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser]         = useState<AuthUser | null>(null);
    const [isLoading, setLoading] = useState(true);

    // On mount, check whether a stored token exists. If it does, restore the
    // session. We don't re-validate against the server here — the first
    // authenticated API call will surface a 401 if the token has expired, which
    // triggers the automatic redirect-to-login flow in apiClient.
    useEffect(() => {
        (async () => {
            try {
                const token = await getAccessToken();
                if (!token) {
                    setLoading(false);
                    return;
                }
                // Token exists but we don't have user data in-memory.
                // Fetch profile from the server to restore the session.
                const response = await fetch(
                    `${process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:4000'}/auth/me`,
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                if (response.ok) {
                    const data = await response.json() as AuthUser;
                    setUser(data);
                }
                // If 401, tokens are cleared by apiClient on the next real call.
            } catch {
                // Network error — leave user null; app shows login
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const handleAuthResponse = useCallback((data: AuthResponse) => {
        setUser({
            id:          data.user.id,
            email:       data.user.email,
            displayName: data.user.displayName,
            tier:        data.user.tier,
            unitPref:    data.user.unitPref,
            scorePref:   data.user.scorePref,
        });
    }, []);

    const login = useCallback(async (payload: LoginRequest) => {
        const data = await apiLogin(payload);
        handleAuthResponse(data);
    }, [handleAuthResponse]);

    const register = useCallback(async (payload: RegisterRequest) => {
        const data = await apiRegister(payload);
        handleAuthResponse(data);
    }, [handleAuthResponse]);

    const logout = useCallback(async () => {
        await apiLogout();
        setUser(null);
    }, []);

    return (
        <AuthContext.Provider value={{
            user,
            isAuthenticated: user !== null,
            isLoading,
            login,
            register,
            logout,
        }}>
            {children}
        </AuthContext.Provider>
    );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
    return ctx;
}
