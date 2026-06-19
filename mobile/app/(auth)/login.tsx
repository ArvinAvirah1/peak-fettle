/**
 * Login screen — wires to POST /auth/login via AuthContext.
 *
 * UX decisions:
 *   - Email keyboard type + autocomplete for smoother mobile entry.
 *   - Password field uses secureTextEntry.
 *   - Submit button disabled while request is in flight (prevents double-tap).
 *   - Error message shown inline below the form.
 *   - "Create account" ghost button navigates to the Register screen.
 *
 * On success: AuthContext.login() calls router.replace('/(tabs)/').
 * On failure: we display the server error message (or a generic fallback).
 *
 * E-005: ScreenLayout wrapper, PFInput, PFButton — replaces raw SafeAreaView,
 *        TextInput, and TouchableOpacity.
 */

import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/hooks/useAuth';
import { useTheme } from '../../src/theme/ThemeContext';
import { fontSize, fontWeight, spacing, radius } from '../../src/theme/tokens';
import { ScreenLayout, PFButton, PFInput } from '../../src/components/ui';
import { BrandLogo } from '../../src/components/BrandLogo';
import { OAuthButtons } from '../../src/components/auth/OAuthButtons';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(email: string): string | null {
  if (!email.trim()) return 'Email is required.';
  if (!EMAIL_REGEX.test(email.trim())) return 'Enter a valid email address.';
  return null;
}

function validatePassword(password: string): string | null {
  if (!password) return 'Password is required.';
  return null;
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function LoginScreen(): React.ReactElement {
  const { login } = useAuth();
  const { theme } = useTheme();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const handleLogin = useCallback(async () => {
    // Re-entrancy guard: ignore a second tap while a submit is already in
    // flight. With this AND the auth-call timeout, the button can never get
    // wedged "doing nothing" — it always re-enables in finally{}.
    if (isSubmitting) return;

    // Client-side validation before hitting the network.
    const emailErr = validateEmail(email);
    const passwordErr = validatePassword(password);

    if (emailErr || passwordErr) {
      setFieldErrors({ email: emailErr ?? undefined, password: passwordErr ?? undefined });
      return;
    }

    setFieldErrors({});
    setServerError(null);
    setIsSubmitting(true);

    try {
      await login(email.trim().toLowerCase(), password);
      // AuthContext.login() calls router.replace('/(tabs)/'). Navigate here too
      // as a belt-and-braces fallback: if that first replace is ever swallowed
      // (router not ready right after a forced sign-out), this guarantees we
      // leave the login screen instead of silently sitting on a re-enabled
      // button. Replacing to the same target twice is an idempotent no-op.
      router.replace('/(tabs)/');
    } catch (err: unknown) {
      const message = extractErrorMessage(err);
      setServerError(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [email, password, login, isSubmitting, router]);

  return (
    <ScreenLayout scrollable keyboardAvoiding contentStyle={styles.content}>
      {/* Header — TICKET-063: brand logo */}
      <View style={styles.logoContainer}>
        <BrandLogo height={100} dark />
      </View>
      <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
        Sign in to your account
      </Text>

      {/* Email */}
      <View style={styles.fieldGroup}>
        <PFInput
          label="Email"
          value={email}
          onChangeText={(text) => {
            setEmail(text);
            if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
          }}
          error={fieldErrors.email}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          disabled={isSubmitting}
          returnKeyType="next"
        />
      </View>

      {/* Password */}
      <View style={styles.fieldGroup}>
        <PFInput
          label="Password"
          value={password}
          onChangeText={(text) => {
            setPassword(text);
            if (fieldErrors.password)
              setFieldErrors((prev) => ({ ...prev, password: undefined }));
          }}
          error={fieldErrors.password}
          placeholder="••••••••"
          secureTextEntry
          autoComplete="current-password"
          disabled={isSubmitting}
          returnKeyType="done"
          onSubmitEditing={handleLogin}
        />
      </View>

      {/* Server error */}
      {serverError ? (
        <View
          style={[
            styles.errorBox,
            {
              backgroundColor: theme.colors.bgPrimary,
              borderColor: theme.colors.statusError,
            },
          ]}
        >
          <Text style={[styles.errorText, { color: theme.colors.statusError }]}>
            {serverError}
          </Text>
        </View>
      ) : null}

      {/* Submit */}
      <PFButton
        variant="primary"
        label="Sign In"
        onPress={handleLogin}
        loading={isSubmitting}
      />

      <OAuthButtons />

      {/* Register link */}
      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: theme.colors.textSecondary }]}>
          Don't have an account?
        </Text>
        <PFButton
          variant="ghost"
          label="Create one"
          onPress={() => router.push('/(auth)/register')}
          size="sm"
        />
      </View>
    </ScreenLayout>
  );
}

// ---------------------------------------------------------------------------
// Error extraction helper
// ---------------------------------------------------------------------------

function extractErrorMessage(err: unknown): string {
  // Axios error with a response body from the Peak Fettle API.
  if (
    typeof err === 'object' &&
    err !== null &&
    'response' in err
  ) {
    const axiosErr = err as { response?: { data?: { error?: string; message?: string } } };
    const apiError = axiosErr.response?.data?.error;
    if (apiError === 'invalid_credentials') {
      return 'Incorrect email or password.';
    }
    if (axiosErr.response?.data?.message) {
      return axiosErr.response.data.message;
    }
  }
  return 'Something went wrong. Please try again.';
}

// ---------------------------------------------------------------------------
// Styles — layout only, no hardcoded colors or font sizes
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  content: {
    justifyContent: 'center',
    paddingVertical: spacing.s12,
  },
  // TICKET-063: logo container replaces the old text title
  logoContainer: {
    alignItems: 'center',
    marginBottom: spacing.s4,
  },
  subtitle: {
    fontSize: fontSize.bodyMd,
    textAlign: 'center',
    marginBottom: spacing.s8,
  },
  fieldGroup: {
    marginBottom: spacing.s5,
  },
  errorBox: {
    borderRadius: radius.sm,
    padding: spacing.s3,
    marginBottom: spacing.s5,
    borderWidth: 1,
  },
  errorText: {
    fontSize: fontSize.bodySm,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.s4,
    gap: spacing.s1,
  },
  footerText: {
    fontSize: fontSize.bodySm,
  },
});
