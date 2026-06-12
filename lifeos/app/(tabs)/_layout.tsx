/**
 * Tab shell — Today · Focus · Habits · Goals · You (spec §4, ≤5 tabs,
 * icon + label, active state via color + weight).
 */

import React from 'react';
import { Tabs, Redirect } from 'expo-router';
import { useAuth } from '../../src/auth/AuthContext';
import { useTheme } from '../../src/theme/ThemeContext';
import { Ionicons } from '../../src/components/Icon';
import { fontFamily } from '../../src/theme/tokens';

export default function TabsLayout(): React.ReactElement {
  const { isLoading, isAuthenticated } = useAuth();
  const { theme } = useTheme();
  const c = theme.colors;

  if (isLoading) return <></>;
  if (!isAuthenticated) return <Redirect href="/(auth)/login" />;

  const icon =
    (name: string, focusedName: string) =>
    ({ color, focused }: { color: string; focused: boolean }) =>
      <Ionicons name={focused ? focusedName : name} size={24} color={color} />;

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
    >
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: icon('today-outline', 'today') }} />
      <Tabs.Screen name="focus" options={{ title: 'Focus', tabBarIcon: icon('shield-half-outline', 'shield-half') }} />
      <Tabs.Screen name="habits" options={{ title: 'Habits', tabBarIcon: icon('repeat-outline', 'repeat') }} />
      <Tabs.Screen name="goals" options={{ title: 'Goals', tabBarIcon: icon('flag-outline', 'flag') }} />
      <Tabs.Screen name="you" options={{ title: 'You', tabBarIcon: icon('person-outline', 'person') }} />
    </Tabs>
  );
}
