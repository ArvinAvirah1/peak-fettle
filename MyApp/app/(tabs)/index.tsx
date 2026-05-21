import { StyleSheet, View } from 'react-native';

import { PeakFettleLogo } from '@/components/peak-fettle-logo';
import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand } from '@/constants/theme';

// ── Header image — logo centred in the parallax band ─────────────────────────

function HeaderContent() {
  return (
    <View style={styles.headerContent}>
      <PeakFettleLogo size={96} showWordmark />
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: Brand.navyLight, dark: Brand.navyDeep }}
      headerImage={<HeaderContent />}>

      {/* ── Welcome ─────────────────────────────────────────────── */}
      <ThemedView style={styles.titleContainer}>
        <ThemedText type="title" style={styles.titleText}>
          Welcome back
        </ThemedText>
      </ThemedView>

      <ThemedText style={styles.subtitleText}>
        Track your lifts, see where you rank, and keep pushing further.
      </ThemedText>

      {/* ── Quick-action cards ──────────────────────────────────── */}
      <ThemedView style={styles.cardRow}>
        <ThemedView style={[styles.card, styles.cardPrimary]}>
          <ThemedText style={styles.cardLabel}>Log Workout</ThemedText>
          <ThemedText style={styles.cardSub}>Tap to record today's session</ThemedText>
        </ThemedView>

        <ThemedView style={[styles.card, styles.cardSecondary]}>
          <ThemedText style={styles.cardLabel}>My Rank</ThemedText>
          <ThemedText style={styles.cardSub}>See your percentile across lifts</ThemedText>
        </ThemedView>
      </ThemedView>

      {/* ── Divider ─────────────────────────────────────────────── */}
      <View style={styles.divider} />

      {/* ── Getting started steps ───────────────────────────────── */}
      <ThemedView style={styles.stepContainer}>
        <ThemedText type="subtitle">Get started</ThemedText>
        <ThemedText style={styles.stepBody}>
          Log your first workout to unlock your personal strength percentile across squats,
          bench, deadlift, and more.
        </ThemedText>
      </ThemedView>

      <ThemedView style={styles.stepContainer}>
        <ThemedText type="subtitle">Your percentile</ThemedText>
        <ThemedText style={styles.stepBody}>
          Peak Fettle benchmarks your lifts against real-world data so you always know where
          you stand — not just how much you lifted.
        </ThemedText>
      </ThemedView>

      <ThemedView style={styles.stepContainer}>
        <ThemedText type="subtitle">Compete & improve</ThemedText>
        <ThemedText style={styles.stepBody}>
          Group streaks, weekly goals, and banked credits keep you consistent and your crew
          accountable.
        </ThemedText>
      </ThemedView>

    </ParallaxScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  headerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 32,
  },

  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  titleText: {
    color: Brand.turquoise,
    letterSpacing: 0.5,
  },

  subtitleText: {
    fontSize: 15,
    lineHeight: 22,
    opacity: 0.75,
    marginBottom: 4,
  },

  cardRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  card: {
    flex: 1,
    borderRadius: 14,
    padding: 16,
    gap: 6,
  },
  cardPrimary: {
    backgroundColor: Brand.turquoise + '22', // ~13 % opacity tint
    borderWidth: 1,
    borderColor: Brand.turquoise + '55',
  },
  cardSecondary: {
    backgroundColor: Brand.skyBlue + '22',
    borderWidth: 1,
    borderColor: Brand.skyBlue + '55',
  },
  cardLabel: {
    fontWeight: '700',
    fontSize: 15,
    color: Brand.turquoise,
  },
  cardSub: {
    fontSize: 12,
    lineHeight: 16,
    opacity: 0.7,
  },

  divider: {
    height: 1,
    backgroundColor: Brand.navySurface,
    marginVertical: 8,
    opacity: 0.6,
  },

  stepContainer: {
    gap: 6,
    marginBottom: 4,
  },
  stepBody: {
    fontSize: 14,
    lineHeight: 21,
    opacity: 0.75,
  },
});
