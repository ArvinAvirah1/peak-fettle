/**
 * Home tab — Today's workout + streak summary
 * TICKET-016 stub. Full implementation in TICKET-017.
 */

import React from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { Colors, Spacing, FontSizes, FontWeights } from '@/constants/theme';

export default function HomeScreen() {
    const { user } = useAuth();

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.greeting}>
                    {user?.displayName ? `Hey, ${user.displayName}` : 'Good session'}
                </Text>
                <Text style={styles.subtitle}>Ready to log?</Text>
            </View>

            {/* TODO TICKET-017: workout logging flow */}
            <View style={styles.placeholder}>
                <Text style={styles.placeholderText}>Workout logging coming in TICKET-017</Text>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    header: { padding: Spacing.lg, paddingTop: Spacing.xl },
    greeting: {
        fontSize:   FontSizes.xxl,
        fontWeight: FontWeights.bold,
        color:      Colors.textPrimary,
    },
    subtitle: {
        fontSize:  FontSizes.md,
        color:     Colors.textSecondary,
        marginTop: Spacing.xs,
    },
    placeholder: {
        flex:            1,
        alignItems:      'center',
        justifyContent:  'center',
    },
    placeholderText: {
        color:    Colors.textDisabled,
        fontSize: FontSizes.sm,
    },
});
