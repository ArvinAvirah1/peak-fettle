/**
 * OAuthButtons — Sign in with Apple & Google for LifeOS.
 *
 * Ported from mobile/src/components/auth/OAuthButtons.tsx (TICKET-099) and
 * adapted to the LifeOS theme system. Obtains a provider id_token on-device
 * and hands it to AuthContext.loginWithOAuth, which verifies it server-side
 * (POST /auth/oauth — same shared-account endpoint as the fitness app) and
 * establishes the same session as email/password login.
 *
 * Bundle-safe: expo-apple-authentication and expo-auth-session are NOT
 * top-level imports — they are required lazily inside try/catch guards. If a
 * package is missing the component renders null with one console.warn; it
 * never crashes the bundle.
 *
 * Google is additionally gated on a per-platform client ID
 * (EXPO_PUBLIC_GOOGLE_LIFEOS_IOS_CLIENT_ID / _ANDROID_ / _WEB_). Until the
 * founder creates LifeOS client IDs in Google Cloud Console (bundle id
 * com.peakfettle.lifeos — the fitness app's IDs will NOT work) the Google
 * button is hidden. The server also returns 501 until APPLE_OAUTH_AUDIENCE /
 * GOOGLE_OAUTH_AUDIENCE include the LifeOS audiences; we surface that as a
 * friendly "not enabled yet" message rather than a generic failure.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import axios from 'axios';
import { useAuth } from '../../auth/AuthContext';
import { useTheme } from '../../theme/ThemeContext';
import { fontFamily, fontSize, radius, spacing } from '../../theme/tokens';

// ---------------------------------------------------------------------------
// Guarded dynamic requires — never import these at the top level.
// ---------------------------------------------------------------------------

function tryRequireApple(): null | Record<string, unknown> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-apple-authentication') as Record<string, unknown>;
  } catch {
    console.warn('[OAuthButtons] expo-apple-authentication not installed — Apple sign-in unavailable.');
    return null;
  }
}

function tryRequireGoogle(): null | Record<string, unknown> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-auth-session/providers/google') as Record<string, unknown>;
  } catch {
    console.warn('[OAuthButtons] expo-auth-session not installed — Google sign-in unavailable.');
    return null;
  }
}

function tryRequireWebBrowser(): null | Record<string, unknown> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-web-browser') as Record<string, unknown>;
  } catch {
    return null;
  }
}

const AppleAuth = tryRequireApple();
const Google = tryRequireGoogle();
const WebBrowser = tryRequireWebBrowser();

const APPLE_AVAILABLE = AppleAuth !== null;

// LifeOS-specific Google client IDs (separate OAuth clients from the fitness
// app — an iOS client ID is bound to ONE bundle identifier). Falls back to
// nothing, never to the fitness app's IDs.
const GOOGLE_CLIENT_ID_FOR_PLATFORM: string | undefined = Platform.select({
  ios: process.env.EXPO_PUBLIC_GOOGLE_LIFEOS_IOS_CLIENT_ID,
  android: process.env.EXPO_PUBLIC_GOOGLE_LIFEOS_ANDROID_CLIENT_ID,
  default: process.env.EXPO_PUBLIC_GOOGLE_LIFEOS_WEB_CLIENT_ID,
});
const GOOGLE_AVAILABLE = Google !== null && !!GOOGLE_CLIENT_ID_FOR_PLATFORM;
if (Google !== null && !GOOGLE_CLIENT_ID_FOR_PLATFORM) {
  console.warn(
    `[OAuthButtons] EXPO_PUBLIC_GOOGLE_LIFEOS_*_CLIENT_ID not set for ${Platform.OS} — Google sign-in hidden.`,
  );
}

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

/** Map an /auth/oauth failure to user-facing copy (501 = server not configured). */
function oauthErrorMessage(e: unknown, provider: 'Apple' | 'Google'): string {
  if (axios.isAxiosError(e) && e.response?.status === 501) {
    return `${provider} sign-in isn't enabled on the server yet. Use email and password for now.`;
  }
  return `${provider} sign-in didn't complete. Try again, or use email and password.`;
}

// ---------------------------------------------------------------------------
// Stable no-op stub for useIdTokenAuthRequest — used when the Google package
// is missing or unconfigured, so GoogleButton calls the SAME hook every render.
// ---------------------------------------------------------------------------

type IdTokenHook = (opts: Record<string, unknown>) => [
  unknown,
  { type?: string; params?: { id_token?: string } } | null,
  () => Promise<void>,
];

function useIdTokenAuthRequestStub(): [null, null, () => Promise<void>] {
  return [null, null, async () => {}];
}

const resolvedUseIdTokenAuthRequest: IdTokenHook | typeof useIdTokenAuthRequestStub =
  Google && GOOGLE_CLIENT_ID_FOR_PLATFORM &&
  typeof (Google as { useIdTokenAuthRequest?: unknown }).useIdTokenAuthRequest === 'function'
    ? (Google as { useIdTokenAuthRequest: IdTokenHook }).useIdTokenAuthRequest
    : useIdTokenAuthRequestStub;

// ---------------------------------------------------------------------------
// GoogleButton
// ---------------------------------------------------------------------------

interface GoogleButtonProps {
  busy: null | 'apple' | 'google';
  setBusy: (v: null | 'apple' | 'google') => void;
  setError: (msg: string | null) => void;
}

function GoogleButton({ busy, setBusy, setError }: GoogleButtonProps): React.ReactElement | null {
  const { loginWithOAuth } = useAuth();
  const { theme } = useTheme();
  const c = theme.colors;

  const [request, response, promptAsync] = resolvedUseIdTokenAuthRequest({
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_LIFEOS_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_LIFEOS_ANDROID_CLIENT_ID,
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_LIFEOS_WEB_CLIENT_ID,
  });

  // Consume each auth response EXACTLY ONCE (mobile Bug 3, 2026-06-30): the
  // hook retains its last response; a remount would otherwise re-fire
  // loginWithOAuth with the same stale success payload.
  const handledResponseRef = useRef<unknown>(null);

  useEffect(() => {
    if (!response) return;
    if (handledResponseRef.current === response) return;
    handledResponseRef.current = response;
    if (response.type === 'success') {
      const idToken = response.params?.id_token;
      if (idToken) {
        setBusy('google');
        setError(null);
        loginWithOAuth('google', idToken)
          .catch((e: unknown) => setError(oauthErrorMessage(e, 'Google')))
          .finally(() => setBusy(null));
      }
    } else if (response.type === 'error') {
      setError(oauthErrorMessage(null, 'Google'));
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
          borderColor: c.borderDefault,
          backgroundColor: c.bgSecondary,
          opacity: !request ? 0.5 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel="Continue with Google"
    >
      {busy === 'google' ? (
        <ActivityIndicator color={c.textPrimary} />
      ) : (
        <Text
          style={{
            color: c.textPrimary,
            fontFamily: fontFamily.semibold,
            fontSize: fontSize.bodyMd,
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
  const { theme } = useTheme();
  const c = theme.colors;

  const [busy, setBusy] = useState<null | 'apple' | 'google'>(null);
  const [error, setError] = useState<string | null>(null);

  if (!APPLE_AVAILABLE && !GOOGLE_AVAILABLE) return null;

  const handleApple = async (): Promise<void> => {
    if (!AppleAuth) return;
    const Apple = AppleAuth as {
      signInAsync: (opts: { requestedScopes: number[] }) => Promise<{ identityToken: string | null }>;
      AppleAuthenticationScope: { FULL_NAME: number; EMAIL: number };
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
        setError('Apple did not return a sign-in token. Try again.');
      }
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code !== 'ERR_REQUEST_CANCELED') {
        setError(oauthErrorMessage(e, 'Apple'));
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
            fontFamily: fontFamily.regular,
            fontSize: fontSize.caption,
            marginHorizontal: spacing.s3,
          }}
        >
          or
        </Text>
        <View style={[styles.line, { backgroundColor: c.borderDefault }]} />
      </View>

      {/* Apple — iOS only; App Store rule: must accompany any third-party sign-in. */}
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
                onPress={() => {
                  if (busy === null) void handleApple();
                }}
              />
            );
          })()
        : null}

      {/* Google — hidden until a LifeOS client ID is configured. */}
      <GoogleButton busy={busy} setBusy={setBusy} setError={setError} />

      {error ? (
        <Text
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={{
            color: c.statusError,
            fontFamily: fontFamily.regular,
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
