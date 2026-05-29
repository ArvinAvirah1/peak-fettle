/**
 * Cosmetics & Shop screen — Peak Fettle
 *
 * Reachable via router.push('/cosmetics') from the profile tab.
 * Registered in _layout.tsx as name="cosmetics".
 *
 * Layout:
 *   1. Active loadout summary bar (4 slots)
 *   2. Category filter tabs — All | Avatar | Frame | Badge | Theme
 *   3. 2-column grid of cosmetic item cards:
 *        - Owned/equipped: full opacity, Equip/Unequip button
 *        - Locked: 0.4 opacity, lock icon, Buy button (POST /cosmetics/:id/purchase)
 *   4. Loading skeleton, empty state, error state with Retry
 *
 * Endpoints used:
 *   GET  /cosmetics             — full catalog with owned + equipped flags per item
 *   GET  /cosmetics/equipped    — active loadout (4 slots)
 *   PUT  /cosmetics/equipped/:slot    — equip an item
 *   DELETE /cosmetics/equipped/:slot  — unequip (fall back to default)
 *   POST /cosmetics/:id/purchase      — debit credits + grant ownership
 *
 * All colors via useTheme() → theme.colors.*. Zero hardcoded hex.
 * All font sizes via theme.fontSizes.*. All spacing via theme.spacing.*.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '../src/components/Icon';
import { useTheme } from '../src/theme/ThemeContext';
import { PFButton, ScreenLayout } from '../src/components/ui';
import { apiClient } from '../src/api/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Rarity = 'common' | 'rare' | 'legendary';
type Category = 'avatar' | 'frame' | 'badge' | 'theme';

interface CosmeticItem {
  id: string;
  name: string;
  description: string;
  category: Category;
  rarity: Rarity;
  price_credits: number;
  is_default: boolean;
  owned: boolean;
  equipped: boolean;
  acquired_at: string | null;
  acquisition_source: string | null;
  metadata: Record<string, unknown> | null;
  sort_order: number;
}

interface LoadoutSlot {
  slot: Category;
  item_id: string;
  name: string;
  description: string;
  category: Category;
  rarity: Rarity;
  is_default: boolean;
  is_fallback_default: boolean;
  equipped_at: string | null;
}

interface Loadout {
  avatar: LoadoutSlot | null;
  frame: LoadoutSlot | null;
  badge: LoadoutSlot | null;
  theme: LoadoutSlot | null;
}

interface SectionData {
  title: string;
  category: Category;
  data: CosmeticItem[][];  // SectionList data — outer array is rows, each inner array is columns
}

type FilterTab = 'all' | Category;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<Category, string> = {
  avatar: 'AVATARS',
  frame: 'FRAMES',
  badge: 'BADGES',
  theme: 'THEMES',
};

const CATEGORY_ICONS: Record<Category, keyof typeof Ionicons.glyphMap> = {
  avatar: 'person-circle-outline',
  frame: 'albums-outline',
  badge: 'ribbon-outline',
  theme: 'color-palette-outline',
};

const RARITY_COLORS_KEY: Record<Rarity, string> = {
  common: 'textTertiary',
  rare: 'accentDefault',
  legendary: 'statusWarning',
};

const COLUMNS = 2;

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all',    label: 'All'    },
  { key: 'avatar', label: 'Avatar' },
  { key: 'frame',  label: 'Frame'  },
  { key: 'badge',  label: 'Badge'  },
  { key: 'theme',  label: 'Theme'  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function getRarityLabel(rarity: Rarity): string {
  return rarity.charAt(0).toUpperCase() + rarity.slice(1);
}

/** Chunk a flat array into rows of `size` items for grid rendering. */
function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionHeader({ label, icon }: { label: string; icon: keyof typeof Ionicons.glyphMap }): React.ReactElement {
  const { theme, fontSize, fontWeight, spacing } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.s2,
        marginTop: spacing.s5,
        marginBottom: spacing.s3,
      }}
    >
      <Ionicons name={icon} size={16} color={theme.colors.textTertiary} accessibilityElementsHidden />
      <Text
        style={{
          fontSize: fontSize.caption,
          fontWeight: fontWeight.bold,
          color: theme.colors.textTertiary,
          letterSpacing: 1.1,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </Text>
    </View>
  );
}

interface ItemCardProps {
  item: CosmeticItem;
  onEquip: (item: CosmeticItem) => void;
  onUnequip: (item: CosmeticItem) => void;
  onBuy: (item: CosmeticItem) => void;
  isEquipping: boolean;
  isBuying: boolean;
}

function ItemCard({ item, onEquip, onUnequip, onBuy, isEquipping, isBuying }: ItemCardProps): React.ReactElement {
  const { theme, fontSize, fontWeight, radius, spacing } = useTheme();

  const rarityColorKey = RARITY_COLORS_KEY[item.rarity];
  // Map the key to the actual color from the theme
  const rarityColor = (theme.colors as Record<string, string>)[rarityColorKey] ?? theme.colors.textTertiary;

  const isLocked = !item.owned;

  return (
    <View
      style={[
        styles.itemCard,
        {
          backgroundColor: theme.colors.bgSecondary,
          borderColor: item.equipped
            ? theme.colors.accentDefault
            : theme.colors.borderDefault,
          borderRadius: radius.md,
          padding: spacing.s4,
          opacity: isLocked ? 0.45 : 1,
        },
      ]}
      accessible
      accessibilityLabel={`${item.name}, ${item.rarity} ${item.category}${item.equipped ? ', equipped' : ''}${isLocked ? ', locked' : ''}`}
    >
      {/* Rarity + equipped badge row */}
      <View style={styles.itemCardBadgeRow}>
        <View
          style={[
            styles.rarityBadge,
            {
              backgroundColor: rarityColor + '26',
              borderRadius: radius.sm,
            },
          ]}
        >
          <Text
            style={{
              fontSize: fontSize.micro,
              fontWeight: fontWeight.bold,
              color: rarityColor,
            }}
          >
            {getRarityLabel(item.rarity)}
          </Text>
        </View>

        {item.equipped && (
          <View
            style={[
              styles.equippedBadge,
              {
                backgroundColor: theme.colors.accentDefault + '26',
                borderRadius: radius.sm,
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
              ON
            </Text>
          </View>
        )}

        {isLocked && (
          <Ionicons
            name="lock-closed-outline"
            size={14}
            color={theme.colors.textTertiary}
            accessibilityElementsHidden
          />
        )}
      </View>

      {/* Item icon placeholder */}
      <View
        style={[
          styles.itemIconArea,
          {
            backgroundColor: theme.colors.bgPrimary,
            borderRadius: radius.sm,
          },
        ]}
      >
        <Ionicons
          name={CATEGORY_ICONS[item.category]}
          size={32}
          color={item.equipped ? theme.colors.accentDefault : theme.colors.textTertiary}
          accessibilityElementsHidden
        />
      </View>

      {/* Name */}
      <Text
        style={{
          fontSize: fontSize.bodyMd,
          fontWeight: fontWeight.bold,
          color: theme.colors.textPrimary,
          marginTop: spacing.s2,
        }}
        numberOfLines={1}
      >
        {item.name}
      </Text>

      {/* Description */}
      <Text
        style={{
          fontSize: fontSize.caption,
          color: theme.colors.textTertiary,
          marginTop: 2,
          lineHeight: 16,
        }}
        numberOfLines={2}
      >
        {item.description}
      </Text>

      {/* Acquired date */}
      {item.acquired_at && (
        <Text
          style={{
            fontSize: fontSize.micro,
            color: theme.colors.textTertiary,
            marginTop: spacing.s1,
          }}
        >
          Earned {formatDate(item.acquired_at)}
        </Text>
      )}
      {item.is_default && !item.acquired_at && (
        <Text
          style={{
            fontSize: fontSize.micro,
            color: theme.colors.textTertiary,
            marginTop: spacing.s1,
          }}
        >
          Default item
        </Text>
      )}

      {/* Price label — locked non-default items */}
      {isLocked && !item.is_default && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.s2 }}>
          <Ionicons name="star-outline" size={11} color={theme.colors.textTertiary} accessibilityElementsHidden />
          <Text
            style={{
              fontSize: fontSize.micro,
              fontWeight: fontWeight.semibold,
              color: theme.colors.textTertiary,
            }}
          >
            {item.price_credits} credits
          </Text>
        </View>
      )}

      {/* Equip / Unequip button — only for owned items */}
      {item.owned && !isLocked && (
        <Pressable
          onPress={() => item.equipped ? onUnequip(item) : onEquip(item)}
          disabled={isEquipping}
          style={({ pressed }) => [
            styles.equipButton,
            {
              backgroundColor: item.equipped
                ? theme.colors.bgPrimary
                : theme.colors.accentDefault,
              borderColor: item.equipped
                ? theme.colors.borderDefault
                : theme.colors.accentDefault,
              borderRadius: radius.sm,
              marginTop: spacing.s3,
              opacity: pressed || isEquipping ? 0.7 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={item.equipped ? `Unequip ${item.name}` : `Equip ${item.name}`}
        >
          {isEquipping ? (
            <ActivityIndicator size="small" color={theme.colors.accentDefault} />
          ) : (
            <Text
              style={{
                fontSize: fontSize.caption,
                fontWeight: fontWeight.semibold,
                color: item.equipped
                  ? theme.colors.textSecondary
                  : theme.components.buttonPrimaryText,
              }}
            >
              {item.equipped ? 'Unequip' : 'Equip'}
            </Text>
          )}
        </Pressable>
      )}

      {/* Buy button — locked non-default items only */}
      {isLocked && !item.is_default && (
        <Pressable
          onPress={() => onBuy(item)}
          disabled={isBuying}
          style={({ pressed }) => [
            styles.equipButton,
            {
              backgroundColor: theme.colors.accentSecondary,
              borderColor: theme.colors.accentHover,
              borderRadius: radius.sm,
              marginTop: spacing.s3,
              opacity: pressed || isBuying ? 0.7 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Buy ${item.name} for ${item.price_credits} credits`}
        >
          {isBuying ? (
            <ActivityIndicator size="small" color={theme.colors.accentHover} />
          ) : (
            <Text
              style={{
                fontSize: fontSize.caption,
                fontWeight: fontWeight.semibold,
                color: theme.colors.accentHover,
              }}
            >
              Buy
            </Text>
          )}
        </Pressable>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Filter tab bar
// ---------------------------------------------------------------------------

interface FilterTabBarProps {
  active: FilterTab;
  onChange: (tab: FilterTab) => void;
}

function FilterTabBar({ active, onChange }: FilterTabBarProps): React.ReactElement {
  const { theme, fontSize, fontWeight, radius, spacing } = useTheme();
  return (
    <View style={[styles.tabBar, { gap: spacing.s2, marginBottom: spacing.s3 }]}>
      {FILTER_TABS.map(({ key, label }) => {
        const isActive = active === key;
        return (
          <Pressable
            key={key}
            onPress={() => onChange(key)}
            style={[
              styles.tab,
              {
                backgroundColor: isActive ? theme.colors.accentDefault : theme.colors.bgSecondary,
                borderColor: isActive ? theme.colors.accentDefault : theme.colors.borderDefault,
                borderRadius: radius.full,
                paddingHorizontal: spacing.s3,
                paddingVertical: 6,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Filter by ${label}`}
            accessibilityState={{ selected: isActive }}
          >
            <Text
              style={{
                fontSize: fontSize.bodySm,
                fontWeight: isActive ? fontWeight.bold : fontWeight.medium,
                color: isActive ? theme.components.buttonPrimaryText : theme.colors.textSecondary,
              }}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Loadout summary bar
// ---------------------------------------------------------------------------

function LoadoutBar({ loadout }: { loadout: Loadout | null }): React.ReactElement {
  const { theme, fontSize, fontWeight, radius, spacing } = useTheme();

  if (!loadout) return <View />;

  const slots: Category[] = ['avatar', 'frame', 'badge', 'theme'];

  return (
    <View
      style={[
        styles.loadoutBar,
        {
          backgroundColor: theme.colors.bgSecondary,
          borderColor: theme.colors.borderDefault,
          borderRadius: radius.md,
          padding: spacing.s4,
          marginBottom: spacing.s3,
        },
      ]}
    >
      <Text
        style={{
          fontSize: fontSize.caption,
          fontWeight: fontWeight.bold,
          color: theme.colors.textTertiary,
          letterSpacing: 1.1,
          textTransform: 'uppercase',
          marginBottom: spacing.s3,
        }}
      >
        ACTIVE LOADOUT
      </Text>

      <View style={styles.loadoutSlots}>
        {slots.map((slot) => {
          const slotData = loadout[slot];
          return (
            <View key={slot} style={styles.loadoutSlot}>
              <View
                style={[
                  styles.loadoutSlotIcon,
                  {
                    backgroundColor: theme.colors.bgPrimary,
                    borderColor: slotData
                      ? theme.colors.accentDefault
                      : theme.colors.borderDefault,
                    borderRadius: radius.sm,
                  },
                ]}
              >
                <Ionicons
                  name={CATEGORY_ICONS[slot]}
                  size={20}
                  color={slotData ? theme.colors.accentDefault : theme.colors.textTertiary}
                  accessibilityElementsHidden
                />
              </View>
              <Text
                style={{
                  fontSize: fontSize.micro,
                  color: theme.colors.textTertiary,
                  textAlign: 'center',
                  marginTop: 4,
                }}
                numberOfLines={1}
              >
                {slotData?.name ?? '—'}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function CosmeticsScreen(): React.ReactElement {
  const { theme, fontSize, fontWeight, radius, spacing } = useTheme();

  const [items, setItems] = useState<CosmeticItem[]>([]);
  const [loadout, setLoadout] = useState<Loadout | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [equippingId, setEquippingId] = useState<string | null>(null);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  // ── Data fetch — full catalog (includes locked items + owned flag) ─────────

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [catalogRes, equippedRes] = await Promise.all([
        apiClient.get<{ items: CosmeticItem[] }>('/cosmetics'),
        apiClient.get<{ loadout: Loadout }>('/cosmetics/equipped'),
      ]);
      setItems(catalogRes.data.items ?? []);
      setLoadout(equippedRes.data.loadout ?? null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load cosmetics.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ── Equip / Unequip ───────────────────────────────────────────────────────

  const handleEquip = useCallback(async (item: CosmeticItem) => {
    setEquippingId(item.id);
    try {
      await apiClient.put(`/cosmetics/equipped/${item.category}`, { itemId: item.id });
      // Update local state optimistically
      setItems((prev) =>
        prev.map((i) => {
          if (i.category !== item.category) return i;
          return { ...i, equipped: i.id === item.id };
        })
      );
      setLoadout((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          [item.category]: {
            slot: item.category,
            item_id: item.id,
            name: item.name,
            description: item.description,
            category: item.category,
            rarity: item.rarity,
            is_default: item.is_default,
            is_fallback_default: false,
            equipped_at: new Date().toISOString(),
          },
        };
      });
    } catch {
      // Silent — revert on next load
    } finally {
      setEquippingId(null);
    }
  }, []);

  const handleUnequip = useCallback(async (item: CosmeticItem) => {
    setEquippingId(item.id);
    try {
      await apiClient.delete(`/cosmetics/equipped/${item.category}`);
      // Mark all in this category as unequipped; server falls back to default
      setItems((prev) =>
        prev.map((i) => {
          if (i.category !== item.category) return i;
          return { ...i, equipped: false };
        })
      );
      setLoadout((prev) => {
        if (!prev) return prev;
        return { ...prev, [item.category]: null };
      });
    } catch {
      // Silent
    } finally {
      setEquippingId(null);
    }
  }, []);

  // ── Purchase ──────────────────────────────────────────────────────────────

  const handleBuy = useCallback(async (item: CosmeticItem) => {
    setBuyingId(item.id);
    try {
      const res = await apiClient.post<{
        purchased: boolean;
        new_balance: number;
        credits_spent: number;
      }>(`/cosmetics/${item.id}/purchase`, {});
      // Mark item as owned in local state
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? { ...i, owned: true, acquired_at: new Date().toISOString(), acquisition_source: 'purchase' }
            : i
        )
      );
      Alert.alert(
        'Purchased!',
        `${item.name} is now yours. Balance: ${res.data.new_balance} credits.`
      );
    } catch (e: unknown) {
      const anyErr = e as { response?: { data?: { error?: string; balance?: number; required?: number } } };
      const errCode = anyErr?.response?.data?.error;
      if (errCode === 'insufficient_credits') {
        const bal = anyErr.response?.data?.balance ?? 0;
        const req = anyErr.response?.data?.required ?? item.price_credits;
        Alert.alert('Not enough credits', `You have ${bal} credits, but ${item.name} costs ${req}.`);
      } else if (errCode === 'already_owned') {
        Alert.alert('Already owned', 'You already have this item.');
      } else {
        Alert.alert('Purchase failed', e instanceof Error ? e.message : 'Please try again.');
      }
    } finally {
      setBuyingId(null);
    }
  }, []);

  // ── Section data ──────────────────────────────────────────────────────────

  const categories: Category[] = ['avatar', 'frame', 'badge', 'theme'];

  const visibleCategories = activeTab === 'all' ? categories : [activeTab as Category];

  const sections: SectionData[] = visibleCategories
    .map((cat) => {
      const catItems = items.filter((i) => i.category === cat);
      return {
        title: CATEGORY_LABELS[cat],
        category: cat,
        data: chunkArray(catItems, COLUMNS),
      };
    })
    .filter((s) => s.data.length > 0);

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <ScreenLayout>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.accentDefault} />
        </View>
      </ScreenLayout>
    );
  }

  if (error) {
    return (
      <ScreenLayout>
        <View style={[styles.centered, { paddingHorizontal: spacing.s5 }]}>
          <Ionicons
            name="alert-circle-outline"
            size={40}
            color={theme.colors.statusError}
            accessibilityElementsHidden
          />
          <Text
            style={{
              fontSize: fontSize.bodyMd,
              color: theme.colors.statusError,
              textAlign: 'center',
              marginTop: spacing.s3,
              marginBottom: spacing.s4,
            }}
          >
            {error}
          </Text>
          <PFButton
            variant="primary"
            label="Retry"
            onPress={load}
            accessibilityLabel="Retry loading cosmetics"
          />
        </View>
      </ScreenLayout>
    );
  }

  if (items.length === 0) {
    return (
      <ScreenLayout>
        <View style={[styles.centered, { paddingHorizontal: spacing.s5 }]}>
          <Ionicons
            name="trophy-outline"
            size={40}
            color={theme.colors.textTertiary}
            accessibilityElementsHidden
          />
          <Text
            style={{
              fontSize: fontSize.bodyMd,
              color: theme.colors.textTertiary,
              textAlign: 'center',
              marginTop: spacing.s3,
            }}
          >
            No items yet. Log workouts to earn achievements!
          </Text>
        </View>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout scrollable>
      {/* Category filter tabs */}
      <FilterTabBar active={activeTab} onChange={setActiveTab} />

      {/* Active loadout summary */}
      <LoadoutBar loadout={loadout} />

      {/* Category sections */}
      <SectionList
        sections={sections}
        keyExtractor={(row, index) => `row-${index}-${row.map((i) => i.id).join('-')}`}
        scrollEnabled={false}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <SectionHeader
            label={section.title}
            icon={CATEGORY_ICONS[section.category]}
          />
        )}
        renderItem={({ item: row }) => (
          <View style={styles.gridRow}>
            {row.map((item) => (
              <View key={item.id} style={styles.gridCell}>
                <ItemCard
                  item={item}
                  onEquip={handleEquip}
                  onUnequip={handleUnequip}
                  onBuy={handleBuy}
                  isEquipping={equippingId === item.id}
                  isBuying={buyingId === item.id}
                />
              </View>
            ))}
            {/* Fill empty cell if odd number of items in row */}
            {row.length < COLUMNS && <View style={styles.gridCell} />}
          </View>
        )}
        ListFooterComponent={<View style={{ height: spacing.s6 }} />}
      />
    </ScreenLayout>
  );
}

// ---------------------------------------------------------------------------
// Styles — layout only, no color values
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 200,
  },
  loadoutBar: {
    borderWidth: 1,
    marginTop: 4,
  },
  loadoutSlots: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  loadoutSlot: {
    alignItems: 'center',
    flex: 1,
  },
  loadoutSlotIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  gridRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  gridCell: {
    flex: 1,
  },
  itemCard: {
    borderWidth: 1,
  },
  itemCardBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  rarityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  equippedBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  itemIconArea: {
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  equipButton: {
    borderWidth: 1,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 32,
  },
  tabBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  tab: {
    borderWidth: 1,
  },
});
