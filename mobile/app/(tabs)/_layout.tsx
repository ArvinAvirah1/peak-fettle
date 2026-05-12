/**
 * Tab bar layout — defines the five main tabs of the authenticated app.
 *
 * Tabs:
 *   Home     — today's workout + streak counter (TICKET-017)
 *   Log      — exercise picker + set logger (TICKET-018)
 *   Rankings — percentile display, free tier (TICKET-019)
 *   Plans    — AI plan viewer/generator, paid tier gated (TICKET-020)
 *   Profile  — settings, units toggle, sign out (TICKET-021)
 *
 * The tab bar is only reachable when isAuthenticated = true.
 * If a user somehow lands here while unauthenticated, the Redirect below
 * sends them to login. This is a belt-and-suspenders guard — the primary
 * auth routing is driven by AuthContext.login() / logout() calls.
 */

import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router';
import { useAuth } from '../../src/hooks/useAuth';

// Simple Unicode emoji icons as placeholders.
// TODO(TICKET-017–021): Replace with a proper icon library (e.g. @expo/vector-icons
//   Ionicons) once the design system is confirmed.

export default function TabsLayout(): React.ReactElement {
  const { isAuthenticated, isLoading } = useAuth();

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
        tabBarStyle: {
          backgroundColor: '#1e293b',
          borderTopColor: '#334155',
        },
        tabBarActiveTintColor: '#818cf8',
        tabBarInactiveTintColor: '#64748b',
        headerStyle: { backgroundColor: '#0f172a' },
        headerTintColor: '#f8fafc',
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarLabel: 'Home',
          tabBarIcon: ({ color }) => (
            // Placeholder — replace with <Ionicons name="home" /> in TICKET-017
            <TabIcon emoji="🏠" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="log"
        options={{
          title: 'Log Workout',
          tabBarLabel: 'Log',
          tabBarIcon: ({ color }) => (
            <TabIcon emoji="📝" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="rankings"
        options={{
          title: 'Rankings',
          tabBarLabel: 'Rankings',
          tabBarIcon: ({ color }) => (
            <TabIcon emoji="🏆" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="plans"
        options={{
          title: 'Plans',
          tabBarLabel: 'Plans',
          tabBarIcon: ({ color }) => (
            <TabIcon emoji="📋" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color }) => (
            <TabIcon emoji="👤" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

// ---------------------------------------------------------------------------
// Minimal emoji tab icon placeholder
// ---------------------------------------------------------------------------

import { Text } from 'react-native';

function TabIcon({ emoji, color: _color }: { emoji: string; color: string }): React.ReactElement {
  // `color` is unused here because emoji can't be tinted — swap this
  // component for a proper icon component in TICKET-017–021.
  return <Text style={{ fontSize: 20 }}>{emoji}</Text>;
}
