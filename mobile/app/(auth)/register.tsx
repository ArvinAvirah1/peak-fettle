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
import { OAuthButtons } from '../../src/components/auth/OAuthButtons';
import { useTranslation } from 'react-i18next';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FieldErrors {
  email?: string;
  password?: string;
  displayName?: string;
}

function validate(email: string, password: string, t: (key: string) => string): FieldErrors {
  const errors: FieldErrors = {};
  if (!email.trim()) {
    errors.email = t('tabs:register.emailRequired');
  } else if (!EMAIL_REGEX.test(email.trim())) {
    errors.email = t('tabs:register.emailInvalid');
  }
  if (!password) {
    errors.password = t('tabs:register.passwordRequired');
  } else if (password.length < 8) {
    errors.password = t('tabs:register.passwordTooShort');
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
  const { t } = useTranslation();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const handleRegister = useCallback(async () => {
    // Re-entrancy guard — see login.tsx. With the auth-call timeout, the button
    // can never get wedged disabled: it always re-enables in finally{}.
    if (isSubmitting) return;

    const errors = validate(email, password, t);
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
      // AuthContext.register() routes new users through /splash (intro →
      // onboarding). Navigate here too as an idempotent fallback so a swallowed
      // first replace can't leave the user stranded on a re-enabled button.
      router.replace('/splash');
    } catch (err: unknown) {
      setServerError(extractErrorMessage(err, t));
    } finally {
      setIsSubmitting(false);
    }
  }, [email, password, displayName, register, isSubmitting, router]);

  return (
    <ScreenLayout scrollable keyboardAvoiding contentStyle={styles.content}>
      {/* Header — TICKET-063: brand logo */}
      <View style={styles.logoContainer}>
        <BrandLogo height={100} dark />
      </View>
      <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
        {t('tabs:register.subtitle')}
      </Text>

      {/* Display name (optional) */}
      <View style={styles.fieldGroup}>
        <PFInput
          label={t('tabs:register.displayNameLabel')}
          value={displayName}
          onChangeText={setDisplayName}
          placeholder={t('tabs:register.displayNamePlaceholder')}
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
          label={t('tabs:register.emailLabel')}
          value={email}
          onChangeText={(text) => {
            setEmail(text);
            if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
          }}
          error={fieldErrors.email}
          placeholder={t('tabs:register.emailPlaceholder')}
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
          label={t('tabs:register.passwordLabel')}
          value={password}
          onChangeText={(text) => {
            setPassword(text);
            if (fieldErrors.password)
              setFieldErrors((prev) => ({ ...prev, password: undefined }));
          }}
          error={fieldErrors.password}
          placeholder={t('tabs:register.passwordPlaceholder')}
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
        label={t('tabs:register.submit')}
        onPress={handleRegister}
        loading={isSubmitting}
      />

      {/* Login link */}
      <OAuthButtons />

      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: theme.colors.textSecondary }]}>
          {t('tabs:register.haveAccount')}
        </Text>
        <PFButton
          variant="ghost"
          label={t('tabs:register.signIn')}
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

function extractErrorMessage(err: unknown, t: (key: string) => string): string {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const axiosErr = err as { response?: { status?: number; data?: { error?: string; message?: string } } };
    const status = axiosErr.response?.status;
    if (status === 409 || axiosErr.response?.data?.error === 'email_taken') {
      return t('tabs:register.emailTaken');
    }
    if (axiosErr.response?.data?.message) {
      return axiosErr.response.data.message;
    }
  }
  return t('tabs:register.genericError');
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
