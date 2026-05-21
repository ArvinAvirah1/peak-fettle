/**
 * Root layout — Expo Router
 *
 * Wraps the entire app in AuthProvider. Redirects unauthenticated users to
 * the auth group and authenticated users away from it.
 *
 * Route groups:
 *   (auth)/  — login, register (public, no token required)
 *   (tabs)/  — main app (protected, requires valid JWT)
 */

import { useEffect } from 'react';
import { Stack, router, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider, useAuth } from '@/context/AuthContext';

// Prevent the splash screen from auto-hiding before fonts / auth state load.
SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
    const { isAuthenticated, isLoading } = useAuth();
    const segments = useSegments();

    useEffect(() => {
        if (isLoading) return;

        // Hide splash once auth state is resolved.
        SplashScreen.hideAsync();

        const inAuthGroup = segments[0] === '(auth)';

        if (!isAuthenticated && !inAuthGroup) {
            // Not logged in — send to login screen.
            router.replace('/(auth)/login');
        } else if (isAuthenticated && inAuthGroup) {
            // Already logged in — send to app.
            router.replace('/(tabs)/home');
        }
    }, [isAuthenticated, isLoading, segments]);

    return (
        <>
            <StatusBar style="light" />
            <Stack screenOptions={{ headerShown: false }} />
        </>
    );
}

export default function RootLayout() {
    return (
        <AuthProvider>
            <RootLayoutNav />
        </AuthProvider>
    );
}
