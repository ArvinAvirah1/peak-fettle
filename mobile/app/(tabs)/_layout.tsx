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
        // 2026-06-10 aesthetic pass: animate tab switches instead of hard cuts.
        animation: 'shift',
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
            accessibilityLabel="Open glossary"
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
          title: 'Home',
          tabBarLabel: 'Home',
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
          title: 'Routines',
          tabBarLabel: 'Routines',
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
          title: 'Rankings',
          tabBarLabel: 'Rankings',
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
          title: 'Plans',
          tabBarLabel: 'Plans',
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
          title: 'Profile',
          tabBarLabel: 'Profile',
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
