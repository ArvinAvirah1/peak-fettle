/**
 * Register — creates the shared Peak Fettle account.
 */

import React, { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import axios from 'axios';
import { useAuth } from '../../src/auth/AuthContext';
import { useTheme } from '../../src/theme/ThemeContext';
import { PFButton, PFInput, ScreenLayout } from '../../src/components/ui';
import { OAuthButtons } from '../../src/components/auth/OAuthButtons';
import { fontFamily, fontSize, spacing } from '../../src/theme/tokens';

export default function RegisterScreen(): React.ReactElement {
  const { register } = useAuth();
  const { theme } = useTheme();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string; confirm?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleRegister = useCallback(async () => {
    setServerError(null);
    const next: typeof errors = {};
    if (!/^\S+@\S+\.\S+$/.test(email)) next.email = 'Enter a valid email address.';
    if (password.length < 8) next.password = 'Use at least 8 characters.';
    if (confirm !== password) next.confirm = 'Passwords do not match.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSubmitting(true);
    try {
      await register(email.trim(), password);
      router.replace('/');
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        setServerError('An account with this email already exists — try signing in.');
      } else {
        setServerError('Could not create the account. Check your connection and retry.');
      }
    } finally {
      setSubmitting(false);
    }
  }, [email, password, confirm, register, router]);

  return (
    <ScreenLayout>
      <View style={{ paddingTop: spacing.s16 }}>
        <Text
          accessibilityRole="header"
          style={{
            color: theme.colors.textPrimary,
            fontFamily: fontFamily.bold,
            fontSize: fontSize.heading1,
            marginBottom: spacing.s8,
          }}
        >
          Create account
        </Text>

        <PFInput
          label="Email"
          value={email}
          onChangeText={setEmail}
          error={errors.email}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
        />
        <PFInput
          label="Password"
          value={password}
          onChangeText={setPassword}
          error={errors.password}
          helper="At least 8 characters."
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
        />
        <PFInput
          label="Confirm password"
          value={confirm}
          onChangeText={setConfirm}
          error={errors.confirm}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
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

        <PFButton label="Create account" onPress={handleRegister} loading={submitting} />

        <OAuthButtons />

        <Link href="/(auth)/login" asChild>
          <Text
            accessibilityRole="link"
            accessibilityLabel="Already have an account? Sign in"
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
            Already have an account? Sign in
          </Text>
        </Link>
      </View>
    </ScreenLayout>
  );
}
