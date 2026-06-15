/**
 * OAuthButtons — TICKET-099 (Sign in with Apple & Google, client).
 *
 * Obtains a provider id_token on-device and hands it to AuthContext.loginWithOAuth,
 * which verifies it server-side (/auth/oauth) and establishes the same session as
 * email/password login.
 *
 * Bundle-safe: expo-apple-authentication and expo-auth-session are NOT top-level
 * imports. They are required lazily inside try/catch guards. If the packages are
 * not installed (the common case until the founder runs
 *   npx expo install expo-apple-authentication expo-auth-session expo-web-browser
 * and does an EAS build), the component renders null with one console.warn — it
 * never crashes the bundle.
 *
 * Env (EXPO_PUBLIC_*): GOOGLE_IOS_CLIENT_ID, GOOGLE_ANDROID_CLIENT_ID,
 * GOOGLE_WEB_CLIENT_ID.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../theme/ThemeContext';
import { fontSize, spacing, radius } from '../../theme/tokens';

// ---------------------------------------------------------------------------
// Guarded dynamic requires — never import these at the top level.
// The packages may not be installed (they're not in package.json yet).
// ---------------------------------------------------------------------------

/** Try to require expo-apple-authentication; returns the module or null. */
function tryRequireApple(): null | Record<string, unknown> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-apple-authentication') as Record<string, unknown>;
  } catch {
    console.warn('[OAuthButtons] expo-apple-authentication not installed — Apple sign-in unavailable.');
    return null;
  }
}

/** Try to require expo-auth-session/providers/google; returns the module or null. */
function tryRequireGoogle(): null | Record<string, unknown> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-auth-session/providers/google') as Record<string, unknown>;
  } catch {
    console.warn('[OAuthButtons] expo-auth-session not installed — Google sign-in unavailable.');
    return null;
  }
}

/** Try to require expo-web-browser (needed to complete the auth session). */
function tryRequireWebBrowser(): null | Record<string, unknown> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-web-browser') as Record<string, unknown>;
  } catch {
    return null;
  }
}

// Check availability once at module-evaluation time (not in render).
const AppleAuth = tryRequireApple();
const Google = tryRequireGoogle();
const WebBrowser = tryRequireWebBrowser();

// If neither package is available, surface nothing.
const APPLE_AVAILABLE = AppleAuth !== null;

// Google also needs a per-platform client ID baked into the bundle at build
// time. Calling useIdTokenAuthRequest with an undefined client ID throws at
// render ("Client Id property `iosClientId` must be defined…"), which takes
// down the whole login screen — so treat "package installed but no client ID
// for this platform" as unavailable and hide the button.
const GOOGLE_CLIENT_ID_FOR_PLATFORM: string | undefined = Platform.select({
  ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  android: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  default: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
});
const GOOGLE_AVAILABLE = Google !== null && !!GOOGLE_CLIENT_ID_FOR_PLATFORM;
if (Google !== null && !GOOGLE_CLIENT_ID_FOR_PLATFORM) {
  console.warn(
    `[OAuthButtons] EXPO_PUBLIC_GOOGLE_*_CLIENT_ID not set for ${Platform.OS} — Google sign-in hidden.`,
  );
}

// Complete any pending auth session so the popup can close itself.
if (WebBrowser && typeof (WebBrowser as { maybeCompleteAuthSession?: () => void }).maybeCompleteAuthSession === 'function') {
  (WebBrowser as { maybeCompleteAuthSession: () => void }).maybeCompleteAuthSession();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isDarkColor(hex: string): boolean {
  const h = (hex || '').replace('#', '');
  if (h.length < 6) return true;
  const r = parseInt(h.slice(0, 2), 16),
    g = parseInt(h.slice(2, 4), 16),
    b = parseInt(h.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b < 140;
}

// ---------------------------------------------------------------------------
// GoogleButton — inner component that uses expo-auth-session hooks.
// Extracted so the hook (useIdTokenAuthRequest) is only called when Google
// is available (hooks must not be called conditionally).
// ---------------------------------------------------------------------------

interface GoogleButtonProps {
  busy: null | 'apple' | 'google';
  setBusy: (v: null | 'apple' | 'google') => void;
  setError: (msg: string | null) => void;
  textColor: string;
  borderColor: string;
  bgColor: string;
  fontWeightSemibold: string;
}

// ---------------------------------------------------------------------------
// Stable no-op stub for useIdTokenAuthRequest — used when the Google package
// is not installed or no client ID is configured. Always returns the same
// shape as the real hook so GoogleButton can call it unconditionally.
// The stub never changes between renders, satisfying Rules of Hooks.
// ---------------------------------------------------------------------------

type IdTokenHook = (opts: Record<string, unknown>) => [
  unknown,
  { type?: string; params?: { id_token?: string } } | null,
  () => Promise<void>,
];

function useIdTokenAuthRequestStub(): [null, null, () => Promise<void>] {
  return [null, null, async () => {}];
}

// Resolve the real hook once at module-eval time. The result is either the
// real hook function or the stub — stable for the lifetime of the app.
const resolvedUseIdTokenAuthRequest: IdTokenHook | typeof useIdTokenAuthRequestStub =
  Google && GOOGLE_CLIENT_ID_FOR_PLATFORM &&
  typeof (Google as { useIdTokenAuthRequest?: unknown }).useIdTokenAuthRequest === 'function'
    ? (Google as { useIdTokenAuthRequest: IdTokenHook }).useIdTokenAuthRequest
    : useIdTokenAuthRequestStub;

function GoogleButton({
  busy,
  setBusy,
  setError,
  textColor,
  borderColor,
  bgColor,
  fontWeightSemibold,
}: GoogleButtonProps): React.ReactElement | null {
  const { loginWithOAuth } = useAuth();

  // Always call the same hook (either the real one or the stable stub) on every
  // render. The hook reference is resolved once at module-eval time and never
  // changes between renders, so React's hook-count invariant is satisfied.
  const [request, response, promptAsync] = resolvedUseIdTokenAuthRequest({
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  });

  useEffect(() => {
    if (!response) return;
    if (response.type === 'success') {
      const idToken = response.params?.id_token;
      if (idToken) {
        setBusy('google');
        setError(null);
        loginWithOAuth('google', idToken)
          .catch(() => setError('Google sign-in failed. Please try again.'))
          .finally(() => setBusy(null));
      }
    } else if (response.type === 'error') {
      setError('Google sign-in failed. Please try again.');
    }
  }, [response, loginWithOAuth, setBusy, setError]);

  if (!GOOGLE_AVAILABLE) return null;

  return (
    <TouchableOpacity
      onPress={() => void promptAsync()}
      disabled={!request || busy !== null}
      style={[
        styles.googleBtn,
        {
          borderColor,
          backgroundColor: bgColor,
          opacity: !request ? 0.5 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel="Continue with Google"
    >
      {busy === 'google' ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text
          style={{
            color: textColor,
            fontSize: fontSize.bodyMd,
            fontWeight: fontWeightSemibold as '600',
          }}
        >
          Continue with Google
        </Text>
      )}
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function OAuthButtons(): React.ReactElement | null {
  const { loginWithOAuth } = useAuth();
  const { theme, fontWeight } = useTheme();
  const c = theme.colors;

  const [busy, setBusy] = useState<null | 'apple' | 'google'>(null);
  const [error, setError] = useState<string | null>(null);

  // If neither package is available, render nothing.
  if (!APPLE_AVAILABLE && !GOOGLE_AVAILABLE) return null;

  const handleApple = async () => {
    if (!AppleAuth) return;
    const Apple = AppleAuth as {
      signInAsync: (opts: { requestedScopes: number[] }) => Promise<{ identityToken: string | null }>;
      AppleAuthenticationScope: { FULL_NAME: number; EMAIL: number };
      AppleAuthenticationButtonType: { SIGN_IN: unknown };
      AppleAuthenticationButtonStyle: { WHITE: unknown; BLACK: unknown };
      AppleAuthenticationButton: React.ComponentType<{
        buttonType: unknown;
        buttonStyle: unknown;
        cornerRadius: number;
        style: object;
        onPress: () => void;
      }>;
    };

    try {
      setBusy('apple');
      setError(null);
      const credential = await Apple.signInAsync({
        requestedScopes: [
          Apple.AppleAuthenticationScope.FULL_NAME,
          Apple.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (credential.identityToken) {
        await loginWithOAuth('apple', credential.identityToken);
      } else {
        setError('Apple did not return a token. Please try again.');
      }
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code !== 'ERR_REQUEST_CANCELED') {
        setError('Apple sign-in failed. Please try again.');
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ marginTop: spacing.s2 }}>
      {/* "or" divider */}
      <View style={styles.dividerRow}>
        <View style={[styles.line, { backgroundColor: c.borderDefault }]} />
        <Text
          style={{
            color: c.textTertiary,
            fontSize: fontSize.caption,
            marginHorizontal: spacing.s3,
          }}
        >
          or
        </Text>
        <View style={[styles.line, { backgroundColor: c.borderDefault }]} />
      </View>

      {/* Apple — iOS only, per App Store rule (must accompany Google on iOS). */}
      {APPLE_AVAILABLE && Platform.OS === 'ios'
        ? (() => {
            const Apple = AppleAuth as {
              AppleAuthenticationButton: React.ComponentType<{
                buttonType: unknown;
                buttonStyle: unknown;
                cornerRadius: number;
                style: object;
                onPress: () => void;
              }>;
              AppleAuthenticationButtonType: { SIGN_IN: unknown };
              AppleAuthenticationButtonStyle: { WHITE: unknown; BLACK: unknown };
            };
            return (
              <Apple.AppleAuthenticationButton
                buttonType={Apple.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={
                  isDarkColor(c.bgPrimary)
                    ? Apple.AppleAuthenticationButtonStyle.WHITE
                    : Apple.AppleAuthenticationButtonStyle.BLACK
                }
                cornerRadius={radius.md}
                style={styles.appleBtn}
                onPress={handleApple}
              />
            );
          })()
        : null}

      {/* Google */}
      {GOOGLE_AVAILABLE ? (
        <GoogleButton
          busy={busy}
          setBusy={setBusy}
          setError={setError}
          textColor={c.textPrimary}
          borderColor={c.borderDefault}
          bgColor={c.bgSecondary}
          fontWeightSemibold={fontWeight.semibold}
        />
      ) : null}

      {error ? (
        <Text
          style={{
            color: c.statusError,
            fontSize: fontSize.bodySm,
            textAlign: 'center',
            marginTop: spacing.s2,
          }}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.s4,
  },
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
