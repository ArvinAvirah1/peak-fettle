/**
 * Achievements & Shop screen — Peak Fettle
 *
 * Surfaces the cosmetic tier ladder:
 *   - All cosmetic categories and their options (hair, outfit, background, etc.)
 *   - Locked/unlocked state via cosmeticUnlocks.isUnlocked(optionId, { streak, isPaid })
 *   - Streak progress bar toward the next milestone (7 / 30 / 100 days)
 *   - A clearly-marked PRO section (locked for free users; no purchase flow — Phase 6)
 *   - Equip unlocked items via cosmeticUnlocks.setEquipped
 *
 * LOCAL-FIRST INVARIANT: no personal REST calls on mount. Streak comes from
 * useLocalStreak (SQLite-backed, hang-proof). Equipped state is read/written
 * via cosmeticUnlocks which goes through localDb only. All colors/spacing from
 * useTheme() — zero hardcoded hex.
 *
 * Safe-area: this screen uses ScreenLayout (ScrollView), NOT a Modal, so the
 * standard SafeAreaView propagation is sufficient.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '../src/components/Icon';
import { useTheme } from '../src/theme/ThemeContext';
import { PFProgressBar, ScreenLayout } from '../src/components/ui';
import { useAuth } from '../src/hooks/useAuth';
import { useLocalStreak } from '../src/hooks/useStreak';
import { useWorkoutHistory } from '../src/hooks/useWorkoutHistory';
import {
  isUnlocked,
  unlockLabel,
  getEquipped,
  setEquipped,
} from '../src/data/cosmeticUnlocks';
import {
  AVATAR_CATEGORIES,
  COSMETIC_TIERS,
  type AvatarCategory,
  type UnlockTier,
} from '../src/components/avatar/peakAvatarOptions';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Streak milestones in ascending order. */
const STREAK_MILESTONES = [7, 30, 100] as const;
type StreakMilestone = typeof STREAK_MILESTONES[number];

/** Category keys that get a "Pro" badge on the header (they contain pro items). */
const PRO_CATEGORIES = new Set(
  AVATAR_CATEGORIES
    .filter((cat) => cat.ids.some((id) => COSMETIC_TIERS[id] === 'pro'))
    .map((cat) => cat.key)
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the next streak milestone the user has not yet reached, or null if
 * all milestones are passed.
 */
function nextMilestone(streak: number): StreakMilestone | null {
  for (const m of STREAK_MILESTONES) {
    if (streak < m) return m;
  }
  return null;
}

/**
 * Returns the previous milestone floor (the one the user has most recently
 * crossed), or 0 if none yet.
 */
function prevMilestone(streak: number): number {
  let prev = 0;
  for (const m of STREAK_MILESTONES) {
    if (streak >= m) prev = m;
  }
  return prev;
}

/** Get tier for a given optionId. */
function tierFor(optionId: string): UnlockTier {
  return COSMETIC_TIERS[optionId] ?? 'free';
}

/** True if this option requires a Pro subscription. */
function isPro(optionId: string): boolean {
  return tierFor(optionId) === 'pro';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Progress bar + label showing streak advancement toward next milestone. */
function StreakProgressBanner({
  streak,
  isLoading,
}: {
  streak: number;
  isLoading: boolean;
}): React.ReactElement {
  const { theme, fontSize, fontWeight, radius, spacing } = useTheme();
  const next = nextMilestone(streak);
  const prev = prevMilestone(streak);

  const progress = next ? (streak - prev) / (next - prev) : 1;
  const allUnlocked = next === null;

  return (
    <View
      style={[
        styles.streakBanner,
        {
          backgroundColor: theme.colors.bgSecondary,
          borderColor: theme.colors.borderDefault,
          borderRadius: radius.md,
          padding: spacing.s4,
          marginBottom: spacing.s4,
        },
      ]}
    >
      {/* Row: icon + label */}
      <View style={styles.streakHeaderRow}>
        <Ionicons
          name="flame-outline"
          size={18}
          color={theme.colors.statusWarning}
          accessibilityElementsHidden
        />
        <Text
          style={{
            fontSize: fontSize.bodySm,
            fontWeight: fontWeight.bold,
            color: theme.colors.textPrimary,
            marginLeft: spacing.s2,
            flex: 1,
          }}
        >
          {isLoading ? 'Loading streak…' : allUnlocked ? 'All streak tiers unlocked!' : `${streak}-day streak`}
        </Text>
        {!isLoading && !allUnlocked && (
          <Text
            style={{
              fontSize: fontSize.caption,
              fontWeight: fontWeight.semibold,
              color: theme.colors.accentDefault,
            }}
          >
            {`Next: ${next} days`}
          </Text>
        )}
      </View>

      {/* Progress bar */}
      <View style={{ marginTop: spacing.s3 }}>
        {isLoading ? (
          <View
            style={[
              styles.progressPlaceholder,
              { backgroundColor: theme.colors.bgTertiary, borderRadius: radius.sm },
            ]}
          />
        ) : (
          <PFProgressBar value={Math.min(progress, 1)} />
        )}
      </View>

      {/* Milestone pip labels */}
      {!isLoading && !allUnlocked && (
        <View style={[styles.milestonePips, { marginTop: spacing.s2 }]}>
          {STREAK_MILESTONES.map((m) => {
            const reached = streak >= m;
            return (
              <View key={m} style={styles.milestonePip}>
                <View
                  style={[
                    styles.pipDot,
                    {
                      backgroundColor: reached
                        ? theme.colors.accentDefault
                        : theme.colors.bgTertiary,
                      borderColor: reached
                        ? theme.colors.accentDefault
                        : theme.colors.borderDefault,
                    },
                  ]}
                />
                <Text
                  style={{
                    fontSize: fontSize.micro,
                    color: reached ? theme.colors.accentDefault : theme.colors.textTertiary,
                    marginTop: 3,
                  }}
                >
                  {m}d
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

/** The Pro tier locked banner shown at the top of the Pro section. */
function ProLockedBanner(): React.ReactElement {
  const { theme, fontSize, fontWeight, radius, spacing } = useTheme();
  return (
    <View
      style={[
        styles.proLockedBanner,
        {
          backgroundColor: theme.colors.accentSecondary,
          borderColor: theme.colors.accentDefault,
          borderRadius: radius.md,
          padding: spacing.s4,
          marginBottom: spacing.s3,
        },
      ]}
      accessibilityRole="none"
      accessibilityLabel="Pro cosmetics are locked. Upgrade to Pro to unlock them."
    >
      <View style={styles.streakHeaderRow}>
        <Ionicons
          name="lock-closed"
          size={16}
          color={theme.colors.accentDefault}
          accessibilityElementsHidden
        />
        <Text
          style={{
            fontSize: fontSize.bodySm,
            fontWeight: fontWeight.bold,
            color: theme.colors.accentDefault,
            marginLeft: spacing.s2,
            flex: 1,
          }}
        >
          PRO — Exclusive cosmetics
        </Text>
      </View>
      <Text
        style={{
          fontSize: fontSize.caption,
          color: theme.colors.textSecondary,
          marginTop: spacing.s2,
          lineHeight: 18,
        }}
      >
        Upgrade to Peak Fettle Pro to unlock gradient backgrounds, animated
        accessories, premium outfits, and more. Purchase coming in a future
        update.
      </Text>
    </View>
  );
}

/** Section heading row (category label + optional Pro badge). */
function CategorySectionHeader({
  cat,
  isPaidUser,
}: {
  cat: AvatarCategory;
  isPaidUser: boolean;
}): React.ReactElement {
  const { theme, fontSize, fontWeight, radius, spacing } = useTheme();
  const hasPro = PRO_CATEGORIES.has(cat.key);

  return (
    <View
      style={[
        styles.sectionHeader,
        { marginTop: spacing.s5, marginBottom: spacing.s3 },
      ]}
    >
      <Text
        style={{
          fontSize: fontSize.caption,
          fontWeight: fontWeight.bold,
          color: theme.colors.textTertiary,
          letterSpacing: 1.1,
          textTransform: 'uppercase',
          flex: 1,
        }}
      >
        {cat.label}
      </Text>
      {hasPro && !isPaidUser && (
        <View
          style={[
            styles.proBadge,
            {
              backgroundColor: theme.colors.accentSecondary,
              borderColor: theme.colors.accentDefault,
              borderRadius: radius.full,
              paddingHorizontal: spacing.s2,
              paddingVertical: 2,
            },
          ]}
        >
          <Text
            style={{
              fontSize: fontSize.micro,
              fontWeight: fontWeight.bold,
              color: theme.colors.accentDefault,
            }}
          >
            PRO
          </Text>
        </View>
      )}
    </View>
  );
}

interface OptionChipProps {
  optionId: string;
  category: AvatarCategory;
  streak: number;
  isPaidUser: boolean;
  isEquipped: boolean;
  isEquipping: boolean;
  onEquip: (slot: string, optionId: string) => void;
}

/** A single cosmetic option chip (color swatch or labelled pill). */
function OptionChip({
  optionId,
  category,
  streak,
  isPaidUser,
  isEquipped,
  isEquipping,
  onEquip,
}: OptionChipProps): React.ReactElement {
  const { theme, fontSize, fontWeight, radius, spacing } = useTheme();

  const unlocked = isUnlocked(optionId, { streak, isPaid: isPaidUser });
  const locked = !unlocked;
  const tierLabel = unlockLabel(optionId);
  const proItem = isPro(optionId);
  const isColor = category.kind === 'color';
  const swatchColor = isColor && category.colors ? (category.colors[optionId] ?? null) : null;

  // Don't show pro items at all for free users in the main list — they appear
  // in the Pro section below instead.
  if (proItem && !isPaidUser) return <></>;

  function handlePress(): void {
    if (!locked) {
      onEquip(String(category.key), optionId);
    }
  }

  return (
    <Pressable
      onPress={handlePress}
      disabled={locked || isEquipping}
      style={({ pressed }) => [
        styles.optionChip,
        {
          backgroundColor: isEquipped
            ? theme.colors.accentDefault
            : theme.colors.bgTertiary,
          borderColor: isEquipped
            ? theme.colors.accentDefault
            : locked
            ? theme.colors.bgTertiary
            : theme.colors.borderDefault,
          borderRadius: radius.sm,
          opacity: locked ? 0.4 : pressed || (isEquipping && isEquipped) ? 0.7 : 1,
          margin: spacing.s1,
          padding: isColor ? spacing.s1 : spacing.s2,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={
        locked
          ? `${optionId} locked — requires ${tierLabel}`
          : isEquipped
          ? `${optionId} equipped`
          : `Equip ${optionId}`
      }
      accessibilityState={{ selected: isEquipped, disabled: locked }}
    >
      {swatchColor ? (
        /* Color swatch */
        <View
          style={[
            styles.colorSwatch,
            {
              backgroundColor: swatchColor,
              borderRadius: radius.sm - 2,
              borderColor: isEquipped ? theme.colors.bgPrimary : 'transparent',
            },
          ]}
        >
          {locked && (
            <View style={styles.swatchLockOverlay}>
              <Ionicons
                name="lock-closed"
                size={10}
                color={theme.colors.textPrimary}
                accessibilityElementsHidden
              />
            </View>
          )}
          {isEquipping && isEquipped && (
            <View style={styles.swatchLockOverlay}>
              <ActivityIndicator size="small" color={theme.colors.textPrimary} />
            </View>
          )}
        </View>
      ) : (
        /* Label pill */
        <View style={styles.labelPillInner}>
          {locked ? (
            <Ionicons
              name="lock-closed-outline"
              size={10}
              color={isEquipped ? theme.colors.bgPrimary : theme.colors.textTertiary}
              accessibilityElementsHidden
            />
          ) : null}
          {isEquipping && isEquipped ? (
            <ActivityIndicator
              size="small"
              color={isEquipped ? theme.colors.bgPrimary : theme.colors.accentDefault}
            />
          ) : (
            <Text
              style={{
                fontSize: fontSize.micro,
                fontWeight: isEquipped ? fontWeight.bold : fontWeight.medium,
                color: isEquipped
                  ? theme.colors.bgPrimary
                  : locked
                  ? theme.colors.textTertiary
                  : theme.colors.textPrimary,
                marginLeft: locked ? 3 : 0,
              }}
              numberOfLines={1}
            >
              {optionId}
            </Text>
          )}
        </View>
      )}
    </Pressable>
  );
}

/** Pro-only options grid for a single category — shown in the Pro section. */
function ProOptionGroup({
  cat,
  isPaidUser,
  streak,
  equippedMap,
  equippingKey,
  onEquip,
}: {
  cat: AvatarCategory;
  isPaidUser: boolean;
  streak: number;
  equippedMap: Record<string, string>;
  equippingKey: string | null;
  onEquip: (slot: string, optionId: string) => void;
}): React.ReactElement | null {
  const { theme, fontSize, fontWeight, radius, spacing } = useTheme();
  const proIds = cat.ids.filter((id) => isPro(id));
  if (proIds.length === 0) return null;

  return (
    <View style={{ marginBottom: spacing.s3 }}>
      <Text
        style={{
          fontSize: fontSize.micro,
          fontWeight: fontWeight.bold,
          color: theme.colors.textTertiary,
          letterSpacing: 1.0,
          textTransform: 'uppercase',
          marginBottom: spacing.s2,
        }}
      >
        {cat.label}
      </Text>
      <View style={styles.optionRow}>
        {proIds.map((optionId) => (
          <OptionChip
            key={optionId}
            optionId={optionId}
            category={cat}
            streak={streak}
            isPaidUser={isPaidUser}
            isEquipped={equippedMap[String(cat.key)] === optionId}
            isEquipping={equippingKey === `${String(cat.key)}:${optionId}`}
            onEquip={onEquip}
          />
        ))}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function CosmeticsScreen(): React.ReactElement {
  const { theme, fontSize, fontWeight, radius, spacing } = useTheme();
  const { user } = useAuth();
  const isPaidUser = !!user?.is_paid;

  // Streak must reflect the REAL value for BOTH tiers: free users read on-device
  // SQLite (useLocalStreak); Pro users take the server-derived streak from
  // useWorkoutHistory — mirroring the Home tab so a Pro user's streak-gated
  // cosmetics aren't all shown locked (useLocalStreak(0,…) would force streak 0).
  const { streak: historyStreak, isLoading: historyLoading } = useWorkoutHistory();
  const { streak, isLoading: streakLoading } = useLocalStreak(historyStreak, historyLoading);

  // Equipped map: slot → optionId
  const [equippedMap, setEquippedMap] = useState<Record<string, string>>({});
  const [equippingKey, setEquippingKey] = useState<string | null>(null);
  const [equippedLoading, setEquippedLoading] = useState(true);

  // Load current equipped selection from localDb (no REST call).
  useEffect(() => {
    if (!user?.id) {
      setEquippedLoading(false);
      return;
    }
    (async () => {
      try {
        const map = await getEquipped(user.id);
        setEquippedMap(map);
      } catch {
        // Degrade gracefully — table may not exist on older schema
      } finally {
        setEquippedLoading(false);
      }
    })();
  }, [user?.id]);

  const handleEquip = useCallback(
    async (slot: string, optionId: string) => {
      if (!user?.id) return;
      const key = `${slot}:${optionId}`;
      setEquippingKey(key);
      try {
        await setEquipped(user.id, { [slot]: optionId });
        setEquippedMap((prev) => ({ ...prev, [slot]: optionId }));
      } catch {
        // Fail silently — next getEquipped call will restore truth
      } finally {
        setEquippingKey(null);
      }
    },
    [user?.id]
  );

  // Separate categories into: has any non-pro items, and has any pro items
  const regularCategories = useMemo(
    () =>
      AVATAR_CATEGORIES.filter((cat) =>
        cat.ids.some((id) => !isPro(id))
      ),
    []
  );

  const proCategories = useMemo(
    () =>
      AVATAR_CATEGORIES.filter((cat) => cat.ids.some((id) => isPro(id))),
    []
  );

  const isInitialising = streakLoading || equippedLoading;

  return (
    <ScreenLayout>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: spacing.s4, paddingBottom: spacing.s12 }}
      >
        {/* Screen title */}
        <Text
          style={{
            fontSize: fontSize.heading2,
            fontWeight: fontWeight.bold,
            color: theme.colors.textPrimary,
            marginBottom: spacing.s3,
          }}
        >
          Achievements & Shop
        </Text>
        <Text
          style={{
            fontSize: fontSize.bodySm,
            color: theme.colors.textSecondary,
            marginBottom: spacing.s5,
            lineHeight: 20,
          }}
        >
          Customise your avatar by equipping unlocked items. Reach streak milestones to
          earn more — or upgrade to Pro for the full catalog.
        </Text>

        {/* Streak progress banner */}
        <StreakProgressBanner streak={streak} isLoading={streakLoading} />

        {/* Loading state for equipped map */}
        {isInitialising && !streakLoading ? (
          <View style={[styles.centered, { minHeight: 80 }]}>
            <ActivityIndicator color={theme.colors.accentDefault} />
          </View>
        ) : null}

        {/* ── Regular (free + streak) categories ─────────────────────────── */}
        {regularCategories.map((cat) => {
          const freeAndStreakIds = cat.ids.filter((id) => !isPro(id));
          if (freeAndStreakIds.length === 0) return null;

          return (
            <View key={String(cat.key)}>
              <CategorySectionHeader cat={cat} isPaidUser={isPaidUser} />
              <View style={styles.optionRow}>
                {freeAndStreakIds.map((optionId) => {
                  const unlocked = isUnlocked(optionId, { streak, isPaid: isPaidUser });
                  const locked = !unlocked;
                  const tier = tierFor(optionId);
                  const streakTier = typeof tier === 'object' && 'streak' in tier ? tier : null;

                  return (
                    <View key={optionId} style={styles.chipWrapper}>
                      <OptionChip
                        optionId={optionId}
                        category={cat}
                        streak={streak}
                        isPaidUser={isPaidUser}
                        isEquipped={equippedMap[String(cat.key)] === optionId}
                        isEquipping={equippingKey === `${String(cat.key)}:${optionId}`}
                        onEquip={handleEquip}
                      />
                      {/* Streak requirement label below locked items */}
                      {locked && streakTier && (
                        <Text
                          style={{
                            fontSize: fontSize.micro,
                            color: theme.colors.textTertiary,
                            textAlign: 'center',
                            marginTop: 2,
                          }}
                        >
                          {`${streakTier.streak}d`}
                        </Text>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })}

        {/* ── Pro section ─────────────────────────────────────────────────── */}
        <View
          style={[
            styles.proSection,
            {
              marginTop: spacing.s6,
              borderTopColor: theme.colors.borderDefault,
              borderTopWidth: 1,
              paddingTop: spacing.s5,
            },
          ]}
        >
          <Text
            style={{
              fontSize: fontSize.heading3,
              fontWeight: fontWeight.bold,
              color: isPaidUser ? theme.colors.accentDefault : theme.colors.textTertiary,
              marginBottom: spacing.s3,
            }}
          >
            Pro Exclusives
          </Text>

          {/* Locked hint for free users */}
          {!isPaidUser && <ProLockedBanner />}

          {/* Pro items — shown locked for free users; equippable for Pro */}
          {isPaidUser ? (
            proCategories.map((cat) => (
              <ProOptionGroup
                key={String(cat.key)}
                cat={cat}
                isPaidUser={isPaidUser}
                streak={streak}
                equippedMap={equippedMap}
                equippingKey={equippingKey}
                onEquip={handleEquip}
              />
            ))
          ) : (
            /* Preview: show pro items locked, greyed out, no equip button */
            proCategories.map((cat) => {
              const proIds = cat.ids.filter((id) => isPro(id));
              if (proIds.length === 0) return null;
              return (
                <View key={String(cat.key)} style={{ marginBottom: spacing.s3 }}>
                  <Text
                    style={{
                      fontSize: fontSize.micro,
                      fontWeight: fontWeight.bold,
                      color: theme.colors.textTertiary,
                      letterSpacing: 1.0,
                      textTransform: 'uppercase',
                      marginBottom: spacing.s2,
                    }}
                  >
                    {cat.label}
                  </Text>
                  <View style={styles.optionRow}>
                    {proIds.map((optionId) => {
                      const isColor = cat.kind === 'color';
                      const swatchColor =
                        isColor && cat.colors ? cat.colors[optionId] ?? null : null;
                      return (
                        <View
                          key={optionId}
                          style={[
                            styles.optionChipLocked,
                            {
                              backgroundColor: theme.colors.bgTertiary,
                              borderColor: theme.colors.bgTertiary,
                              borderRadius: radius.sm,
                              margin: spacing.s1,
                              opacity: 0.35,
                              padding: isColor ? spacing.s1 : spacing.s2,
                            },
                          ]}
                          accessibilityLabel={`${optionId} — Pro only`}
                        >
                          {swatchColor ? (
                            <View
                              style={[
                                styles.colorSwatch,
                                {
                                  backgroundColor: swatchColor,
                                  borderRadius: radius.sm - 2,
                                },
                              ]}
                            >
                              <View style={styles.swatchLockOverlay}>
                                <Ionicons
                                  name="lock-closed"
                                  size={10}
                                  color={theme.colors.textPrimary}
                                  accessibilityElementsHidden
                                />
                              </View>
                            </View>
                          ) : (
                            <View style={styles.labelPillInner}>
                              <Ionicons
                                name="lock-closed-outline"
                                size={10}
                                color={theme.colors.textTertiary}
                                accessibilityElementsHidden
                              />
                              <Text
                                style={{
                                  fontSize: fontSize.micro,
                                  color: theme.colors.textTertiary,
                                  marginLeft: 3,
                                }}
                                numberOfLines={1}
                              >
                                {optionId}
                              </Text>
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </ScreenLayout>
  );
}

// ---------------------------------------------------------------------------
// Styles — layout only; no color values
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  streakBanner: {
    borderWidth: 1,
  },
  streakHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressPlaceholder: {
    height: 6,
    borderRadius: 3,
  },
  milestonePips: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  milestonePip: {
    alignItems: 'center',
  },
  pipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
  },
  proLockedBanner: {
    borderWidth: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  proBadge: {
    borderWidth: 1,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
  },
  chipWrapper: {
    alignItems: 'center',
  },
  optionChip: {
    borderWidth: 1,
  },
  optionChipLocked: {
    borderWidth: 1,
  },
  colorSwatch: {
    width: 32,
    height: 32,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  swatchLockOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  labelPillInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  proSection: {},
});
