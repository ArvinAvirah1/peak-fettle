/**
 * Rankings tab — percentile rankings (free tier, no paywall)
 * TICKET-016 stub. Full implementation in TICKET-019.
 *
 * Free-tier feature per TICKET-015 decision: all users see their percentile
 * rankings. The /percentile routes carry no is_paid gate.
 */

import React, { useEffect, useState } from 'react';
import {
    View, Text, StyleSheet, SafeAreaView,
    FlatList, ActivityIndicator,
} from 'react-native';
import { getAllPercentiles, type PercentileRanking } from '@/api/percentile';
import { Colors, Spacing, FontSizes, FontWeights, Radii } from '@/constants/theme';

export default function RankingsScreen() {
    const [rankings, setRankings] = useState<PercentileRanking[]>([]);
    const [note,     setNote]     = useState('');
    const [loading,  setLoading]  = useState(true);
    const [error,    setError]    = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            try {
                const data = await getAllPercentiles();
                setRankings(data.rankings);
                setNote(data.cohort_note);
            } catch {
                setError('Could not load rankings. Check your connection and try again.');
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    if (loading) {
        return (
            <SafeAreaView style={styles.container}>
                <ActivityIndicator color={Colors.accent} style={{ marginTop: Spacing.xl }} />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Rankings</Text>
                {note ? <Text style={styles.note}>{note}</Text> : null}
            </View>

            {error && (
                <View style={styles.errorBanner}>
                    <Text style={styles.errorText}>{error}</Text>
                </View>
            )}

            {rankings.length === 0 && !error ? (
                <View style={styles.empty}>
                    <Text style={styles.emptyTitle}>No rankings yet</Text>
                    <Text style={styles.emptySubtitle}>
                        Log at least one set with a tracked exercise and check back after the weekly update.
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={rankings}
                    keyExtractor={(item) => item.lift_id}
                    contentContainerStyle={styles.list}
                    renderItem={({ item }) => (
                        <RankingRow ranking={item} />
                    )}
                />
            )}
        </SafeAreaView>
    );
}

function RankingRow({ ranking }: { ranking: PercentileRanking }) {
    const pct = ranking.percentile != null ? Math.round(ranking.percentile) : null;
    const label = ranking.lift_id.replace(/_/g, ' ');
    const updated = new Date(ranking.computed_at).toLocaleDateString(undefined, {
        month: 'short', day: 'numeric',
    });

    return (
        <View style={rowStyles.container}>
            <View style={rowStyles.left}>
                <Text style={rowStyles.liftName}>{label}</Text>
                <Text style={rowStyles.updated}>Updated {updated}</Text>
            </View>
            <View style={rowStyles.right}>
                {pct != null
                    ? <>
                        <Text style={rowStyles.percentile}>{pct}</Text>
                        <Text style={rowStyles.pctLabel}>th pctile</Text>
                    </>
                    : <Text style={rowStyles.noData}>—</Text>
                }
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container:    { flex: 1, backgroundColor: Colors.background },
    header:       { padding: Spacing.lg, paddingTop: Spacing.xl },
    title:        { fontSize: FontSizes.xxl, fontWeight: FontWeights.bold, color: Colors.textPrimary },
    note:         { fontSize: FontSizes.xs, color: Colors.textSecondary, marginTop: Spacing.xs },
    errorBanner:  { backgroundColor: '#742A2A', margin: Spacing.md, borderRadius: Radii.sm, padding: Spacing.sm },
    errorText:    { color: Colors.error, fontSize: FontSizes.sm },
    empty:        { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
    emptyTitle:   { fontSize: FontSizes.lg, fontWeight: FontWeights.semibold, color: Colors.textPrimary, textAlign: 'center' },
    emptySubtitle:{ fontSize: FontSizes.sm, color: Colors.textSecondary, textAlign: 'center', marginTop: Spacing.sm, lineHeight: 20 },
    list:         { paddingHorizontal: Spacing.md, paddingBottom: Spacing.xl },
});

const rowStyles = StyleSheet.create({
    container: {
        flexDirection:   'row',
        alignItems:      'center',
        justifyContent:  'space-between',
        backgroundColor: Colors.surface,
        borderRadius:    Radii.md,
        padding:         Spacing.md,
        marginBottom:    Spacing.sm,
    },
    left:        { flex: 1 },
    liftName:    { fontSize: FontSizes.md, fontWeight: FontWeights.medium, color: Colors.textPrimary, textTransform: 'capitalize' },
    updated:     { fontSize: FontSizes.xs, color: Colors.textDisabled, marginTop: 2 },
    right:       { alignItems: 'flex-end' },
    percentile:  { fontSize: FontSizes.xl, fontWeight: FontWeights.bold, color: Colors.accent },
    pctLabel:    { fontSize: FontSizes.xs, color: Colors.textSecondary },
    noData:      { fontSize: FontSizes.lg, color: Colors.textDisabled },
});
