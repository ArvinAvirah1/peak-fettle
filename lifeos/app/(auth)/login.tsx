/**
 * Login — shared Peak Fettle account (TICKET-101 #2).
 */

import React, { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import axios from 'axios';
import { useAuth } from '../../src/auth/AuthContext';
import { useTheme } from '../../src/theme/ThemeContext';
import { PFButton, PFInput, ScreenLayout } from '../../src/components/ui';
import { fontFamily, fontSize, spacing } from '../../src/theme/tokens';
import { COMPANION_FITNESS_NAME, PRODUCT_NAME } from '../../src/config/product';

export default function LoginScreen(): React.ReactElement {
  const { login } = useAuth();
  const { theme } = useTheme();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleLogin = useCallback(async () => {
    setServerError(null);
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setEmailError('Enter a valid email address.');
      return;
    }
    setEmailError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      router.replace('/');
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        setServerError('Email or password is incorrect. Check both and try again.');
      } else {
        setServerError('Could not reach the server. Check your connection and retry.');
      }
    } finally {
      setSubmitting(false);
    }
  }, [email, password, login, router]);

  return (
    <ScreenLayout>
      <View style={{ paddingTop: spacing.s16 }}>
        <Text
          accessibilityRole="header"
          style={{
            color: theme.colors.textPrimary,
            fontFamily: fontFamily.bold,
            fontSize: fontSize.heading1,
            marginBottom: spacing.s2,
          }}
        >
          {PRODUCT_NAME}
        </Text>
        <Text
          style={{
            color: theme.colors.textSecondary,
            fontFamily: fontFamily.regular,
            fontSize: fontSize.bodyMd,
            marginBottom: spacing.s8,
            lineHeight: 24,
          }}
        >
          Sign in with your {COMPANION_FITNESS_NAME} account. One account, both apps.
        </Text>

        <PFInput
          label="Email"
          value={email}
          onChangeText={setEmail}
          error={emailError}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
        />
        <PFInput
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
        />

        {serverError ? (
          <Text
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={{
              color: theme.colors.statusError,
              fontFamily: fontFamily.regular,
              fontSize: fontSize.bodySm,
              marginBottom: spacing.s3,
            }}
          >
            {serverError}
          </Text>
        ) : null}

        <PFButton label="Sign in" onPress={handleLogin} loading={submitting} />

        <Link href="/(auth)/register" asChild>
          <Text
            accessibilityRole="link"
            accessibilityLabel="New here? Create an account"
            style={{
              color: theme.colors.accentDefault,
              fontFamily: fontFamily.medium,
              fontSize: fontSize.bodyMd,
              textAlign: 'center',
              marginTop: spacing.s5,
              paddingVertical: spacing.s2,
              minHeight: 44,
            }}
          >
            New here? Create an account
          </Text>
        </Link>
      </View>
    </ScreenLayout>
  );
}
