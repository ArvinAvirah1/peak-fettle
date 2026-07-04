/**
 * TabErrorBoundary — catches render-time JavaScript errors in a tab screen
 * and shows a graceful "something went wrong" card instead of a blank screen.
 *
 * Usage: wrap any screen that has complex rendering logic.
 * The error message is shown so it can be reported.
 *
 * This is a class component (required by React's error boundary API), so it
 * cannot use hooks. Colors are sourced from the DEFAULT_THEME semantic tokens
 * to stay consistent with the design system without requiring a hook.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { THEMES, DEFAULT_THEME } from '../theme/tokens';
import i18n from 'i18next';

// Use the DEFAULT_THEME semantic colors so the boundary matches the dark-navy
// design system. Falls back correctly even if a user has not loaded their
// persisted theme yet (class component cannot read ThemeContext).
const { colors, components } = THEMES[DEFAULT_THEME];

interface Props {
  children: React.ReactNode;
  screenName?: string;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class TabErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error?.message ?? String(error) };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(
      `[TabErrorBoundary] ${this.props.screenName ?? 'screen'} crashed:`,
      error,
      info.componentStack
    );
  }

  handleReset = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>{i18n.t('components:tabErrorBoundary.title')}</Text>
          <Text style={styles.message}>{this.state.errorMessage}</Text>
          <TouchableOpacity style={styles.button} onPress={this.handleReset}>
            <Text style={styles.buttonText}>{i18n.t('components:tabErrorBoundary.tryAgain')}</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: colors.bgPrimary,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  button: {
    backgroundColor: components.buttonPrimaryBg,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: components.buttonPrimaryText,
    fontSize: 15,
    fontWeight: '600',
  },
});
