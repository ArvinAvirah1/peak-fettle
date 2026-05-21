/**
 * History tab — workout history + PR graph
 * TICKET-016 stub. Full implementation in TICKET-018.
 */

import React from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import { Colors, Spacing, FontSizes, FontWeights } from '@/constants/theme';

export default function HistoryScreen() {
    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>History</Text>
            </View>
            <View style={styles.placeholder}>
                <Text style={styles.placeholderText}>Workout history + PR graph — TICKET-018</Text>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container:       { flex: 1, backgroundColor: Colors.background },
    header:          { padding: Spacing.lg, paddingTop: Spacing.xl },
    title:           { fontSize: FontSizes.xxl, fontWeight: FontWeights.bold, color: Colors.textPrimary },
    placeholder:     { flex: 1, alignItems: 'center', justifyContent: 'center' },
    placeholderText: { color: Colors.textDisabled, fontSize: FontSizes.sm },
});
