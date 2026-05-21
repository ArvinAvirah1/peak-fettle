/**
 * Login screen
 *
 * TICKET-016 — Phase D scaffold
 * Full form logic lives here. TICKET-017 onwards adds exercise-specific screens.
 */

import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Alert,
} from 'react-native';
import { Link } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { ApiError } from '@/api/client';
import { Colors, Spacing, FontSizes, FontWeights, Radii } from '@/constants/theme';

export default function LoginScreen() {
    const { login } = useAuth();

    const [email,    setEmail]    = useState('');
    const [password, setPassword] = useState('');
    const [loading,  setLoading]  = useState(false);
    const [error,    setError]    = useState<string | null>(null);

    async function handleLogin() {
        setError(null);

        const trimmedEmail = email.trim().toLowerCase();
        if (!trimmedEmail || !password) {
            setError('Email and password are required.');
            return;
        }

        try {
            setLoading(true);
            await login({ email: trimmedEmail, password });
            // Navigation is handled by the root layout's useEffect on isAuthenticated.
        } catch (err) {
            if (err instanceof ApiError) {
                if (err.status === 401) {
                    setError('Incorrect email or password.');
                } else {
                    setError(err.message ?? 'Login failed. Please try again.');
                }
            } else {
                setError('Network error. Check your connection.');
            }
        } finally {
            setLoading(false);
        }
    }

    return (
        <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <ScrollView
                contentContainerStyle={styles.container}
                keyboardShouldPersistTaps="handled"
            >
                {/* Logo / wordmark */}
                <View style={styles.headerSection}>
                    <Text style={styles.logo}>Peak Fettle</Text>
                    <Text style={styles.tagline}>Track. Rank. Improve.</Text>
                </View>

                {/* Form card */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Sign in</Text>

                    {error && (
                        <View style={styles.errorBanner}>
                            <Text style={styles.errorText}>{error}</Text>
                        </View>
                    )}

                    <Text style={styles.label}>Email</Text>
                    <TextInput
                        style={styles.input}
                        value={email}
                        onChangeText={setEmail}
                        placeholder="you@example.com"
                        placeholderTextColor={Colors.textDisabled}
                        autoCapitalize="none"
                        keyboardType="email-address"
                        textContentType="emailAddress"
                        autoComplete="email"
                        returnKeyType="next"
                    />

                    <Text style={styles.label}>Password</Text>
                    <TextInput
                        style={styles.input}
                        value={password}
                        onChangeText={setPassword}
                        placeholder="••••••••"
                        placeholderTextColor={Colors.textDisabled}
                        secureTextEntry
                        textContentType="password"
                        autoComplete="current-password"
                        returnKeyType="done"
                        onSubmitEditing={handleLogin}
                    />

                    <TouchableOpacity
                        style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
                        onPress={handleLogin}
                        disabled={loading}
                        activeOpacity={0.8}
                    >
                        {loading
                            ? <ActivityIndicator color={Colors.textPrimary} />
                            : <Text style={styles.primaryButtonText}>Sign in</Text>
                        }
                    </TouchableOpacity>

                    <View style={styles.footer}>
                        <Text style={styles.footerText}>Don't have an account? </Text>
                        <Link href="/(auth)/register" asChild>
                            <TouchableOpacity>
                                <Text style={styles.footerLink}>Create one</Text>
                            </TouchableOpacity>
                        </Link>
                    </View>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    flex: {
        flex:            1,
        backgroundColor: Colors.background,
    },
    container: {
        flexGrow:        1,
        justifyContent:  'center',
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.xxl,
    },
    headerSection: {
        alignItems:    'center',
        marginBottom:  Spacing.xl,
    },
    logo: {
        fontSize:   FontSizes.xxl,
        fontWeight: FontWeights.bold,
        color:      Colors.accent,
        letterSpacing: 1,
    },
    tagline: {
        fontSize:   FontSizes.sm,
        color:      Colors.textSecondary,
        marginTop:  Spacing.xs,
    },
    card: {
        backgroundColor: Colors.surface,
        borderRadius:    Radii.lg,
        padding:         Spacing.lg,
    },
    cardTitle: {
        fontSize:    FontSizes.xl,
        fontWeight:  FontWeights.semibold,
        color:       Colors.textPrimary,
        marginBottom: Spacing.md,
    },
    errorBanner: {
        backgroundColor: '#742A2A',
        borderRadius:    Radii.sm,
        padding:         Spacing.sm,
        marginBottom:    Spacing.md,
    },
    errorText: {
        color:    Colors.error,
        fontSize: FontSizes.sm,
    },
    label: {
        fontSize:    FontSizes.sm,
        color:       Colors.textSecondary,
        marginBottom: Spacing.xs,
        fontWeight:  FontWeights.medium,
    },
    input: {
        backgroundColor: Colors.surfaceAlt,
        borderRadius:    Radii.md,
        paddingHorizontal: Spacing.md,
        paddingVertical:   Spacing.sm + 2,
        fontSize:        FontSizes.md,
        color:           Colors.textPrimary,
        marginBottom:    Spacing.md,
    },
    primaryButton: {
        backgroundColor: Colors.accent,
        borderRadius:    Radii.md,
        paddingVertical: Spacing.md,
        alignItems:      'center',
        marginTop:       Spacing.sm,
    },
    primaryButtonDisabled: {
        opacity: 0.6,
    },
    primaryButtonText: {
        color:      Colors.background,
        fontSize:   FontSizes.md,
        fontWeight: FontWeights.semibold,
    },
    footer: {
        flexDirection:  'row',
        justifyContent: 'center',
        marginTop:      Spacing.lg,
    },
    footerText: {
        color:    Colors.textSecondary,
        fontSize: FontSizes.sm,
    },
    footerLink: {
        color:      Colors.accent,
        fontSize:   FontSizes.sm,
        fontWeight: FontWeights.medium,
    },
});
