import React from 'react';
import { Stack } from 'expo-router';
import { useTheme } from '../../src/theme/ThemeContext';

export default function AuthLayout(): React.ReactElement {
  const { theme } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.bgPrimary },
      }}
    />
  );
}
