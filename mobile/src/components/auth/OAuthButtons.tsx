/**
 * OAuthButtons — TICKET-099 (Sign in with Apple & Google, client).
 *
 * Obtains a provider id_token on-device and hands it to AuthContext.loginWithOAuth,
 * which verifies it server-side (/auth/oauth) and establishes the same session as
 * email/password login.
 *
 * Native modules (added to package.json): expo-apple-authentication,
 * expo-auth-session, expo-web-browser. They do NOT run in Expo Go — a dev/EAS
 * build is required. Google client IDs + the App Store "Apple alongside Google"
 * rule are configured via env (see below). Until the env IDs are set the Google
 * button is simply disabled, and Apple only shows on iOS.
 *
 * Env (EXPO_PUBLIC_*): GOOGLE_IOS_CLIENT_ID, GOOGLE_ANDROID_CLIENT_ID,
 * GOOGLE_WEB_CLIENT_ID.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Platform, ActivityIndicator, StyleSheet } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../theme/ThemeContext';
import { fontSize, spacing, radius } from '../../theme/tokens';

// Required so the auth popup can close itself and return control to the app.
WebBrowser.maybeCompleteAuthSession();

function isDarkColor(hex: string): boolean {
  const h = (hex || '').replace('#', '');
  if (h.length < 6) return true;
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b < 140;
}

export function OAuthButtons(): React.ReactElement {
  const { loginWithOAuth } = useAuth();
  const { theme, fontWeight } = useTheme();
  const c = theme.colors;

  const [busy, setBusy] = useState<null | 'apple' | 'google'>(null);
  const [error, setError] = useState<string | null>(null);

  // Google — implicit id_token flow (no client secret on device).
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  });

  useEffect(() => {
    if (response?.type === 'success') {
      const idToken = response.params?.id_token;
      if (idToken) {
        setBusy('google');
        setError(null);
        loginWithOAuth('google', idToken)
          .catch(() => setError('Google sign-in failed. Please try again.'))
          .finally(() => setBusy(null));
      }
    } else if (response?.type === 'error') {
      setError('Google sign-in failed. Please try again.');
    }
  }, [response, loginWithOAuth]);

  const handleApple = async () => {
    try {
      setBusy('apple');
      setError(null);
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (credential.identityToken) {
        await loginWithOAuth('apple', credential.identityToken);
      } else {
        setError('Apple did not return a token. Please try again.');
      }
    } catch (e: unknown) {
      // User-cancelled is not an error worth surfacing.
      const code = (e as { code?: string })?.code;
      if (code !== 'ERR_REQUEST_CANCELED') setError('Apple sign-in failed. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ marginTop: spacing.s2 }}>
      {/* "or" divider */}
      <View style={styles.dividerRow}>
        <View style={[styles.line, { backgroundColor: c.borderDefault }]} />
        <Text style={{ color: c.textTertiary, fontSize: fontSize.caption, marginHorizontal: spacing.s3 }}>or</Text>
        <View style={[styles.line, { backgroundColor: c.borderDefault }]} />
      </View>

      {/* Apple — iOS only, per the App Store rule (must accompany Google on iOS). */}
      {Platform.OS === 'ios' ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={
            isDarkColor(c.bgPrimary)
              ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
              : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
          }
          cornerRadius={radius.md}
          style={styles.appleBtn}
          onPress={handleApple}
        />
      ) : null}

      {/* Google */}
      <TouchableOpacity
        onPress={() => promptAsync()}
        disabled={!request || busy !== null}
        style={[styles.googleBtn, { borderColor: c.borderDefault, backgroundColor: c.bgSecondary, opacity: !request ? 0.5 : 1 }]}
        accessibilityRole="button"
        accessibilityLabel="Continue with Google"
      >
        {busy === 'google' ? (
          <ActivityIndicator color={c.textPrimary} />
        ) : (
          <Text style={{ color: c.textPrimary, fontSize: fontSize.bodyMd, fontWeight: fontWeight.semibold }}>
            Continue with Google
          </Text>
        )}
      </TouchableOpacity>

      {error ? (
        <Text style={{ color: c.statusError, fontSize: fontSize.bodySm, textAlign: 'center', marginTop: spacing.s2 }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.s4 },
  line: { flex: 1, height: StyleSheet.hairlineWidth },
  appleBtn: { height: 48, marginBottom: spacing.s3 },
  googleBtn: {
    height: 48,
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default OAuthButtons;
