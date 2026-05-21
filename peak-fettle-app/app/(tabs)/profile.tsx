/**
 * Profile tab — settings, sign-out, data export link
 * TICKET-016 stub. Full implementation in TICKET-026.
 */

import React, { useState } from 'react';
import {
    View, Text, StyleSheet, SafeAreaView,
    TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { Colors, Spacing, FontSizes, FontWeights, Radii } from '@/constants/theme';

export default function ProfileScreen() {
    const { user, logout } = useAuth();
    const [signingOut, setSigningOut] = useState(false);

    async function handleSignOut() {
        Alert.alert(
            'Sign out',
            'Are you sure you want to sign out?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Sign out',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            setSigningOut(true);
                            await logout();
                            // Root layout redirects to login once isAuthenticated = false
                        } catch {
                            Alert.alert('Error', 'Could not sign out. Please try again.');
                        } finally {
                            setSigningOut(false);
                        }
                    },
                },
            ]
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Profile</Text>
            </View>

            {/* User info */}
            <View style={styles.card}>
                <Text style={styles.name}>{user?.displayName ?? 'Athlete'}</Text>
                <Text style={styles.email}>{user?.email}</Text>
                <View style={styles.tierBadge}>
                    <Text style={styles.tierText}>
                        {user?.tier === 'paid' ? 'Paid' : 'Free tier'}
                    </Text>
                </View>
            </View>

            {/* Settings stubs — TICKET-026 */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Settings</Text>
                <SettingRow label="Units"          value={user?.unitPref === 'lbs' ? 'lbs' : 'kg'} />
                <SettingRow label="Strength score" value={user?.scorePref ?? 'peak_fettle'} />
            </View>

            {/* Sign out */}
            <View style={styles.footer}>
                <TouchableOpacity
                    style={styles.signOutButton}
                    onPress={handleSignOut}
                    disabled={signingOut}
                    activeOpacity={0.8}
                >
                    {signingOut
                        ? <ActivityIndicator color={Colors.error} />
                        : <Text style={styles.signOutText}>Sign out</Text>
                    }
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

function SettingRow({ label, value }: { label: string; value: string }) {
    return (
        <View style={rowStyles.container}>
            <Text style={rowStyles.label}>{label}</Text>
            <Text style={rowStyles.value}>{value}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container:    { flex: 1, backgroundColor: Colors.background },
    header:       { padding: Spacing.lg, paddingTop: Spacing.xl },
    title:        { fontSize: FontSizes.xxl, fontWeight: FontWeights.bold, color: Colors.textPrimary },
    card: {
        marginHorizontal: Spacing.lg,
        backgroundColor:  Colors.surface,
        borderRadius:     Radii.lg,
        padding:          Spacing.lg,
        marginBottom:     Spacing.lg,
    },
    name:  { fontSize: FontSizes.xl, fontWeight: FontWeights.semibold, color: Colors.textPrimary },
    email: { fontSize: FontSizes.sm, color: Colors.textSecondary, marginTop: Spacing.xs },
    tierBadge: {
        alignSelf:       'flex-start',
        backgroundColor: Colors.surfaceAlt,
        borderRadius:    Radii.full,
        paddingHorizontal: Spacing.sm,
        paddingVertical:   2,
        marginTop:       Spacing.sm,
    },
    tierText: { fontSize: FontSizes.xs, color: Colors.textSecondary, fontWeight: FontWeights.medium },
    section: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.lg },
    sectionTitle: {
        fontSize:     FontSizes.sm,
        fontWeight:   FontWeights.semibold,
        color:        Colors.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom:  Spacing.sm,
    },
    footer: { padding: Spacing.lg, marginTop: 'auto' },
    signOutButton: {
        borderWidth:  1,
        borderColor:  Colors.error,
        borderRadius: Radii.md,
        paddingVertical: Spacing.md,
        alignItems:   'center',
    },
    signOutText: { color: Colors.error, fontWeight: FontWeights.semibold, fontSize: FontSizes.md },
});

const rowStyles = StyleSheet.create({
    container: {
        flexDirection:  'row',
        justifyContent: 'space-between',
        alignItems:     'center',
        backgroundColor: Colors.surface,
        borderRadius:   Radii.md,
        padding:        Spacing.md,
        marginBottom:   Spacing.sm,
    },
    label: { fontSize: FontSizes.md, color: Colors.textPrimary },
    value: { fontSize: FontSizes.md, color: Colors.textSecondary },
});
