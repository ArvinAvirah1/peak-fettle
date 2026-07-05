/**
 * Tab shell — Today · Focus · Habits · Goals · You (spec §4, ≤5 tabs,
 * icon + label, active state via color + weight).
 *
 * TICKET-150 "Summit depth pass": active tab gets a soft accentMuted pill
 * behind icon+label, and the active icon does a subtle spring "pop" on
 * focus change. Both respect reduce-motion; a selection haptic fires on
 * tab press via screenListeners (does not fire on re-press of the already-
 * focused tab, matching iOS platform conventions for tab navigation).
 */

import React, { useEffect } from 'react';
import { View } from 'react-native';
import { Tabs, Redirect } from 'expo-router';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring } from 'react-native-reanimated';
import { useAuth } from '../../src/auth/AuthContext';
import { useTheme } from '../../src/theme/ThemeContext';
import { Ionicons } from '../../src/components/Icon';
import { fontFamily, radius, spacing } from '../../src/theme/tokens';
import { haptic } from '../../src/lib/haptics';
import { springs } from '../../src/components/motion';

function TabIcon({
  name,
  focusedName,
  color,
  focused,
}: {
  name: string;
  focusedName: string;
  color: string;
  focused: boolean;
}): React.ReactElement {
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);

  useEffect(() => {
    if (reducedMotion) return;
    if (focused) {
      scale.value = withSequence(withSpring(1.08, springs.bouncy), withSpring(1, springs.press));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused, reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reducedMotion ? 1 : scale.value }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Ionicons name={focused ? focusedName : name} size={24} color={color} />
    </Animated.View>
  );
}

function TabPillIcon({
  name,
  focusedName,
  color,
  focused,
}: {
  name: string;
  focusedName: string;
  color: string;
  focused: boolean;
}): React.ReactElement {
  const { theme } = useTheme();
  return (
    <View
      style={{
        minWidth: 44,
        height: 30,
        borderRadius: radius.full,
        backgroundColor: focused ? theme.colors.accentMuted : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: spacing.s3,
      }}
    >
      <TabIcon name={name} focusedName={focusedName} color={color} focused={focused} />
    </View>
  );
}

export default function TabsLayout(): React.ReactElement {
  const { isLoading, isAuthenticated } = useAuth();
  const { theme } = useTheme();
  const c = theme.colors;

  if (isLoading) return <></>;
  if (!isAuthenticated) return <Redirect href="/(auth)/login" />;

  const icon =
    (name: string, focusedName: string) =>
    ({ color, focused }: { color: string; focused: boolean }) =>
      <TabPillIcon name={name} focusedName={focusedName} color={color} focused={focused} />;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: c.bgPrimary },
        headerTitleStyle: { color: c.textPrimary, fontFamily: fontFamily.semibold },
        headerShadowVisible: false,
        tabBarStyle: { backgroundColor: c.bgSecondary, borderTopColor: c.borderDefault },
        tabBarActiveTintColor: c.accentDefault,
        tabBarInactiveTintColor: c.textTertiary,
        tabBarLabelStyle: { fontFamily: fontFamily.medium, fontSize: 11 },
      }}
      screenListeners={{
        tabPress: () => {
          haptic.selection();
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: icon('today-outline', 'today') }} />
      <Tabs.Screen name="focus" options={{ title: 'Focus', tabBarIcon: icon('shield-half-outline', 'shield-half') }} />
      <Tabs.Screen name="habits" options={{ title: 'Habits', tabBarIcon: icon('repeat-outline', 'repeat') }} />
      <Tabs.Screen name="goals" options={{ title: 'Goals', tabBarIcon: icon('flag-outline', 'flag') }} />
      <Tabs.Screen name="you" options={{ title: 'You', tabBarIcon: icon('person-outline', 'person') }} />
    </Tabs>
  );
}
