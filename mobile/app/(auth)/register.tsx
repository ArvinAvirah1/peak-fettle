/**
 * Register screen — wires to POST /auth/signup via AuthContext.
 *
 * UX decisions:
 *   - Display name is optional (matching the server schema).
 *   - Password min length is 8 (mirrors the server Zod validator).
 *   - Error messages are specific where possible (e.g. email already in use).
 *
 * On success: AuthContext.register() calls router.replace('/(tabs)/').
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

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FieldErrors {
  email?: string;
  password?: string;
  displayName?: string;
}

function validate(email: string, password: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!email.trim()) {
    errors.email = 'Email is required.';
  } else if (!EMAIL_REGEX.test(email.trim())) {
    errors.email = 'Enter a valid email address.';
  }
  if (!password) {
    errors.password = 'Password is required.';
  } else if (password.length < 8) {
    errors.password = 'Password must be at least 8 characters.';
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function RegisterScreen(): React.ReactElement {
  const { register } = useAuth();
  const { theme } = useTheme();
  const router = useRouter();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const handleRegister = useCallback(async () => {
    const errors = validate(email, password);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setServerError(null);
    setIsSubmitting(true);

    try {
      await register(
        email.trim().toLowerCase(),
        password,
        displayName.trim() || undefined
      );
      // On success, AuthContext calls router.replace('/(tabs)/').
    } catch (err: unknown) {
      setServerError(extractErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }, [email, password, displayName, register]);

  return (
    <ScreenLayout scrollable keyboardAvoiding contentStyle={styles.content}>
      {/* Header — TICKET-063: brand logo */}
      <View style={styles.logoContainer}>
        <BrandLogo height={100} dark />
      </View>
      <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
        Create your account
      </Text>

      {/* Display name (optional) */}
      <View style={styles.fieldGroup}>
        <PFInput
          label="Display Name (optional)"
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Your name"
          autoCapitalize="words"
          autoCorrect={false}
          autoComplete="name"
          disabled={isSubmitting}
          returnKeyType="next"
        />
      </View>

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
          placeholder="Min. 8 characters"
          secureTextEntry
          autoComplete="new-password"
          disabled={isSubmitting}
          returnKeyType="done"
          onSubmitEditing={handleRegister}
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
        label="Create Account"
        onPress={handleRegister}
        loading={isSubmitting}
      />

      {/* Login link */}
      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: theme.colors.textSecondary }]}>
          Already have an account?
        </Text>
        <PFButton
          variant="ghost"
          label="Sign in"
          onPress={() => router.push('/(auth)/login')}
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
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const axiosErr = err as { response?: { status?: number; data?: { error?: string; message?: string } } };
    const status = axiosErr.response?.status;
    if (status === 409 || axiosErr.response?.data?.error === 'email_taken') {
      return 'An account with this email already exists.';
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
