/**
 * Plans tab — AI-generated plans (paid tier only)
 * TICKET-016 stub. Full implementation in TICKET-020.
 */

import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { Colors, Spacing, FontSizes, FontWeights, Radii } from '@/constants/theme';

export default function PlansScreen() {
    const { user } = useAuth();
    const isPaid = user?.tier === 'paid';

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>AI Plans</Text>
            </View>

            {!isPaid ? (
                // Upsell card for free-tier users
                <View style={styles.upsellCard}>
                    <Text style={styles.upsellTitle}>Personalised plans</Text>
                    <Text style={styles.upsellBody}>
                        Paid members get fully adaptive AI-generated workout plans that learn
                        from your history, health metrics, and physical constraints.
                    </Text>
                    {/* TODO TICKET-020: link to upgrade flow */}
                    <TouchableOpacity style={styles.upgradeButton} activeOpacity={0.8}>
                        <Text style={styles.upgradeButtonText}>Upgrade to paid</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <View style={styles.placeholder}>
                    <Text style={styles.placeholderText}>Plan generation UI — TICKET-020</Text>
                </View>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container:    { flex: 1, backgroundColor: Colors.background },
    header:       { padding: Spacing.lg, paddingTop: Spacing.xl },
    title:        { fontSize: FontSizes.xxl, fontWeight: FontWeights.bold, color: Colors.textPrimary },
    placeholder:  { flex: 1, alignItems: 'center', justifyContent: 'center' },
    placeholderText: { color: Colors.textDisabled, fontSize: FontSizes.sm },
    upsellCard: {
        margin:          Spacing.lg,
        backgroundColor: Colors.surface,
        borderRadius:    Radii.lg,
        padding:         Spacing.lg,
    },
    upsellTitle: {
        fontSize:     FontSizes.lg,
        fontWeight:   FontWeights.semibold,
        color:        Colors.textPrimary,
        marginBottom: Spacing.sm,
    },
    upsellBody: {
        fontSize:     FontSizes.sm,
        color:        Colors.textSecondary,
        lineHeight:   20,
        marginBottom: Spacing.lg,
    },
    upgradeButton: {
        backgroundColor: Colors.accent,
        borderRadius:    Radii.md,
        paddingVertical: Spacing.md,
        alignItems:      'center',
    },
    upgradeButtonText: {
        color:      Colors.background,
        fontWeight: FontWeights.semibold,
        fontSize:   FontSizes.md,
    },
});
