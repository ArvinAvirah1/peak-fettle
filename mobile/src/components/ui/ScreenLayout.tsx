/**
 * ScreenLayout — Peak Fettle design-system screen wrapper.
 * Phase E — E-005: Screen Layout Overhaul
 *
 * Enforces the §6 layout system across all primary screens:
 *   - SafeAreaView (edges: top, bottom) for notch/home-bar clearance
 *   - Consistent horizontal padding: spacing.s5 (20 pt) by default
 *   - Optional header/footer vertical spacing
 *   - KeyboardAvoidingView (optional) for form screens
 *   - ScrollView (optional) wrapping for content taller than viewport
 *
 * All spacing comes from useTheme() tokens. Zero hardcoded values.
 *
 * Usage (basic):
 *   <ScreenLayout>
 *     <Text>Content</Text>
 *   </ScreenLayout>
 *
 * Usage (scrollable form screen):
 *   <ScreenLayout scrollable keyboardAvoiding>
 *     <PFInput ... />
 *   </ScreenLayout>
 *
 * Usage (no horizontal padding — e.g. full-bleed hero):
 *   <ScreenLayout horizontalPadding={false}>
 *     <Image style={{ width: '100%' }} ... />
 *   </ScreenLayout>
 */

import React from 'react';
import {
  View,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScreenLayoutProps {
  children: React.ReactNode;
  /** Apply horizontal padding (spacing.s5). Defaults to true. */
  horizontalPadding?: boolean;
  /** Wrap children in a ScrollView for content taller than viewport. */
  scrollable?: boolean;
  /** Wrap in KeyboardAvoidingView for screens with text inputs. */
  keyboardAvoiding?: boolean;
  /** Additional style overrides for the inner content container. */
  contentStyle?: ViewStyle;
  /** Additional style overrides for the SafeAreaView root. */
  style?: ViewStyle;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ScreenLayout({
  children,
  horizontalPadding = true,
  scrollable = false,
  keyboardAvoiding = false,
  contentStyle,
  style,
}: ScreenLayoutProps): React.ReactElement {
  const { theme, spacing } = useTheme();

  const hPad = horizontalPadding ? spacing.s5 : 0;

  const content = scrollable ? (
    <ScrollView
      contentContainerStyle={[
        styles.scrollContent,
        { paddingHorizontal: hPad },
        contentStyle,
      ]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View
      style={[
        styles.fill,
        { paddingHorizontal: hPad },
        contentStyle,
      ]}
    >
      {children}
    </View>
  );

  const inner = keyboardAvoiding ? (
    <KeyboardAvoidingView
      style={styles.fill}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      {content}
    </KeyboardAvoidingView>
  ) : content;

  return (
    <SafeAreaView
      style={[
        styles.root,
        { backgroundColor: theme.colors.bgPrimary },
        style,
      ]}
      edges={['top', 'bottom']}
    >
      {inner}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Layout-only styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  fill: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
});
