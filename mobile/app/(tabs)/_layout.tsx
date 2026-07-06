/**
 * Tab bar layout — defines the five main tabs of the authenticated app.
 *
 * Tabs:
 *   Home     — today's workout + streak counter (TICKET-017)
 *   Log      — exercise picker + set logger (TICKET-018) — FAB center button
 *   Rankings — percentile display, free tier (TICKET-019)
 *   Plans    — AI plan viewer/generator, paid tier gated (TICKET-020)
 *   Profile  — settings, units toggle, sign out (TICKET-021)
 *
 * The tab bar is only reachable when isAuthenticated = true.
 * If a user somehow lands here while unauthenticated, the Redirect below
 * sends them to login. This is a belt-and-suspenders guard — the primary
 * auth routing is driven by AuthContext.login() / logout() calls.
 *
 * Resolved TODOs:
 *   TICKET-017–021: Replaced Unicode emoji placeholders with Ionicons (P0-001)
 *   P0-001: FAB center tab for Log, 56pt tab bar height, active tint wired
 *   TICKET-043: Glossary ? button added to every tab header
 *   P1-012: Active tab icon scale animation — 180ms spring, 1.0 → 1.15
 */

import React from 'react';
import { TouchableOpacity } from 'react-native';
import { Redirect, Tabs, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '../../src/components/Icon';
import Animated, {
  useAnimatedStyle,
  withSpring,
  useSharedValue,
} from 'react-native-reanimated';
import { useAuth } from '../../src/hooks/useAuth';
import { useTheme } from '../../src/theme/ThemeContext';
import { useAutoBackup } from '../../src/hooks/useAutoBackup';
import { useTranslation } from 'react-i18next';

// ---------------------------------------------------------------------------
// AnimatedTabIcon — scale spring on focus, per spec §7 (P1-012)
// ---------------------------------------------------------------------------

function AnimatedTabIcon({
  name,
  color,
  size,
  focused,
}: {
  name: string;
  color: string;
  size: number;
  focused: boolean;
}): React.ReactElement {
  const scale = useSharedValue(1);

  React.useEffect(() => {
    scale.value = withSpring(focused ? 1.15 : 1.0, { damping: 10, stiffness: 200 });
  }, [focused]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animStyle}>
      <Ionicons name={name as any} size={size} color={color} />
    </Animated.View>
  );
}

export default function TabsLayout(): React.ReactElement {
  const { isAuthenticated, isLoading } = useAuth();
  const { theme, fontWeight } = useTheme();
  const { colors } = theme;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  useAutoBackup();

  // Don't render anything while the cold-start auth check is running —
  // the root layout is already showing a spinner.
  if (isLoading) {
    return <></>;
  }

  // Guard: redirect to login if the user somehow lands here unauthenticated.
  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        // BLANK-TAB BUG (2026-07-05): `animation: 'shift'` (added 2026-06-10,
        // "animate tab switches instead of hard cuts") REMOVED. bottom-tabs v7
        // drives scene visibility through the transition's animated
        // opacity/transform values; intermittently a FOCUSED scene was left in
        // its hidden state — a fully-rendered page showing as a blank screen
        // until the next tab switch recomputed scene states (its content
        // flashed in exactly at transition start). Timing-dependent race, any
        // tab, any time, worse under JS-thread stalls. The default hard cut is
        // the pre-2026-06-10 behavior and never exhibited this. Do NOT re-add
        // 'shift'/'fade' without soak-testing the blank-tab repro on device.
        tabBarActiveTintColor: colors.accentDefault,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarStyle: {
          // Add the bottom safe-area inset so icons aren't squashed on
          // home-indicator iPhones (and gesture-nav Android). The 56pt fixed
          // height is the content area; insets.bottom is reserved by the OS.
          height: 56 + insets.bottom,
          paddingBottom: insets.bottom,
          backgroundColor: colors.bgSecondary,
          borderTopColor: colors.borderDefault,
          borderTopWidth: 1,
        },
        headerStyle: { backgroundColor: colors.bgPrimary },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { fontWeight: fontWeight.bold }, // E-003: was '700'
        headerRight: () => (
          <TouchableOpacity
            onPress={() => router.push('/glossary')}
            style={{ marginRight: 16 }}
            accessibilityLabel={t('tabs:layout.openGlossary')}
            accessibilityRole="button"
          >
            <Ionicons
              name="help-circle-outline"
              size={24}
              color={colors.textSecondary}
            />
          </TouchableOpacity>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs:layout.home'),
          tabBarLabel: t('tabs:layout.home'),
          tabBarIcon: ({ color, size, focused }) => (
            <AnimatedTabIcon
              name={focused ? 'home' : 'home-outline'}
              size={size}
              color={color}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="routines"
        options={{
          title: t('tabs:layout.routines'),
          tabBarLabel: t('tabs:layout.routines'),
          tabBarIcon: ({ color, size, focused }) => (
            <AnimatedTabIcon
              name={focused ? 'barbell' : 'barbell-outline'}
              size={size}
              color={color}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="log"
        options={{
          href: null, // hidden from tab bar — redirects to Home
        }}
      />
      <Tabs.Screen
        name="rankings"
        options={{
          title: t('tabs:layout.rankings'),
          tabBarLabel: t('tabs:layout.rankings'),
          tabBarIcon: ({ color, size, focused }) => (
            <AnimatedTabIcon
              name={focused ? 'trophy' : 'trophy-outline'}
              size={size}
              color={color}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="plans"
        options={{
          title: t('tabs:layout.plans'),
          tabBarLabel: t('tabs:layout.plans'),
          tabBarIcon: ({ color, size, focused }) => (
            <AnimatedTabIcon
              name={focused ? 'calendar' : 'calendar-outline'}
              size={size}
              color={color}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs:layout.profile'),
          tabBarLabel: t('tabs:layout.profile'),
          tabBarIcon: ({ color, size, focused }) => (
            <AnimatedTabIcon
              name={focused ? 'person' : 'person-outline'}
              size={size}
              color={color}
              focused={focused}
            />
          ),
        }}
      />
    </Tabs>
  );
}
