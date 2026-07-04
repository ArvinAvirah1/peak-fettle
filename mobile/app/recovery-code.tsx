/**
 * recovery-code.tsx — Recovery Code display screen.  TICKET-094 (Agent G)
 *
 * Route: /recovery-code  (pushed from data-export when needsRecoveryAck is true)
 *
 * Flow:
 *   1. On mount: read + clear pendingRecoveryCode from backupManager.
 *   2. If code is present: display monospace card + copy button + severe warning
 *      + checkbox-style confirm → markRecoveryCodeAcknowledged → router.back().
 *   3. If code is absent: show fallback copy + a Back button.
 *
 * Agent K polish (2026-06-11):
 *   - Staggered entrance on main content sections (FadeInDown, Reduce Motion aware)
 *   - paddingTop bumped to 24 (s6)
 *   - Confirm button min touch target 44pt
 *   - Copy button uses onPressIn/Out scale micro-interaction
 *
 * SECURITY:
 *   - Code is NEVER written to logs, analytics, AsyncStorage, or SecureStore.
 *   - consumePendingRecoveryCode() clears the in-memory variable on first read.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../src/theme/ThemeContext';
import { ScreenLayout } from '../src/components/ui';
import { fontWeight } from '../src/theme/tokens';
import { consumePendingRecoveryCode } from '../src/data/backup/backupManager';
import { markRecoveryCodeAcknowledged } from '../src/data/backup/keyStore';
import { useReduceMotion } from '../src/hooks/useReduceMotion';

// ---------------------------------------------------------------------------
// Stagger helper
// ---------------------------------------------------------------------------

function useStaggerFade(count: number, enabled: boolean): Animated.Value[] {
  const anims = useRef(
    Array.from({ length: count }, () => new Animated.Value(0))
  ).current;

  useEffect(() => {
    if (!enabled) {
      anims.forEach((a) => a.setValue(1));
      return;
    }
    const animations = anims.map((a, i) =>
      Animated.timing(a, {
        toValue: 1,
        duration: 240,
        delay: i * 60,
        useNativeDriver: true,
      })
    );
    Animated.stagger(60, animations).start();
  }, [enabled, anims]);

  return anims;
}

function staggerStyle(anim: Animated.Value): object {
  return {
    opacity: anim,
    transform: [
      {
        translateY: anim.interpolate({
          inputRange: [0, 1],
          outputRange: [12, 0],
        }),
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Clipboard helper
// ---------------------------------------------------------------------------

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { default: Clipboard } = require('@react-native-clipboard/clipboard');
    await Clipboard.setStringAsync(text);
    return true;
  } catch {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Clipboard: RNClipboard } = require('react-native');
      RNClipboard.setString(text);
      return true;
    } catch {
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function RecoveryCodeScreen(): React.ReactElement {
  const { theme, spacing: sp, fontSize: fs, radius: r } = useTheme();
  const { colors } = theme;
  const { t } = useTranslation();
  const router = useRouter();
  const reduceMotion = useReduceMotion();

  const codeRef = useRef<string | null>(null);
  if (codeRef.current === undefined as unknown as null) {
    codeRef.current = null;
  }
  const [code] = useState<string | null>(() => consumePendingRecoveryCode());
  const [confirmed, setConfirmed] = useState(false);
  const [acking, setAcking] = useState(false);
  const [copied, setCopied] = useState(false);

  // 4 stagger slots: warning, code card, copy btn, confirm section
  const staggerAnims = useStaggerFade(4, !reduceMotion);

  // Copy button scale micro-interaction
  const copyScale = useRef(new Animated.Value(1)).current;

  const handleCopy = useCallback(async () => {
    if (!code) return;
    const ok = await copyToClipboard(code);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      Alert.alert(
        t('screens2:recoveryCode.copyUnavailableTitle'),
        t('screens2:recoveryCode.copyUnavailableBody'),
      );
    }
  }, [code]);

  const handleConfirm = useCallback(async () => {
    if (!confirmed) {
      Alert.alert(t('screens2:recoveryCode.confirmTitle'), t('screens2:recoveryCode.confirmBody'));
      return;
    }
    setAcking(true);
    try {
      await markRecoveryCodeAcknowledged();
      router.back();
    } catch (err) {
      Alert.alert(t('screens2:recoveryCode.errorTitle'), err instanceof Error ? err.message : String(err));
    } finally {
      setAcking(false);
    }
  }, [confirmed, router]);

  // ---------------------------------------------------------------------------
  // Fallback: no pending code
  // ---------------------------------------------------------------------------

  if (!code) {
    return (
      <ScreenLayout scrollable={false}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingHorizontal: sp.s5, paddingBottom: sp.s8 }]}
          showsVerticalScrollIndicator={false}
        >
          <Text
            style={[styles.title, { color: colors.textPrimary, fontSize: fs.heading2, fontWeight: fontWeight.bold, marginBottom: sp.s3 }]}
            accessibilityRole="header"
          >
            {t('screens2:recoveryCode.title')}
          </Text>
          <View
            style={[
              styles.codeCard,
              {
                backgroundColor: colors.bgSecondary,
                borderRadius: r.lg,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: colors.borderDefault,
                padding: sp.s5,
                marginBottom: sp.s6,
              },
            ]}
          >
            <Text style={{ color: colors.textSecondary, fontSize: fs.bodyMd, lineHeight: 24, textAlign: 'center' }}>
              {t('screens2:recoveryCode.noCodeBody')}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel={t('screens2:recoveryCode.goBackA11y')}
            style={[
              styles.btn,
              {
                backgroundColor: colors.accentDefault,
                borderRadius: r.lg,
                padding: sp.s4,
                minHeight: 52,
                justifyContent: 'center',
              },
            ]}
          >
            <Text style={{ color: theme.components.buttonPrimaryText, fontSize: fs.bodyMd, fontWeight: fontWeight.semibold, textAlign: 'center' }}>
              {t('common:back')}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </ScreenLayout>
    );
  }

  // ---------------------------------------------------------------------------
  // Main view: display code
  // ---------------------------------------------------------------------------

  return (
    <ScreenLayout scrollable={false}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingHorizontal: sp.s5, paddingBottom: sp.s8 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Title */}
        <Text
          style={[styles.title, { color: colors.textPrimary, fontSize: fs.heading2, fontWeight: fontWeight.bold, marginBottom: sp.s2 }]}
          accessibilityRole="header"
        >
          {t('screens2:recoveryCode.saveTitle')}
        </Text>

        {/* Warning banner */}
        <Animated.View style={reduceMotion ? undefined : staggerStyle(staggerAnims[0])}>
          <View
            style={[
              styles.warningBanner,
              {
                backgroundColor: colors.statusError + '1A',
                borderColor: colors.statusError,
                borderRadius: r.lg,
                borderWidth: 1,
                padding: sp.s4,
                marginBottom: sp.s5,
              },
            ]}
            accessibilityRole="alert"
          >
            <Text style={{ color: colors.statusError, fontSize: fs.bodyMd, fontWeight: fontWeight.semibold, marginBottom: sp.s1 }}>
              {t('screens2:recoveryCode.warningTitle')}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: fs.bodySm, lineHeight: 20 }}>
              {t('screens2:recoveryCode.warningBody')}
            </Text>
          </View>
        </Animated.View>

        {/* Monospace code card */}
        <Animated.View style={reduceMotion ? undefined : staggerStyle(staggerAnims[1])}>
          <View
            style={[
              styles.codeCard,
              {
                backgroundColor: colors.bgTertiary ?? colors.bgSecondary,
                borderRadius: r.lg,
                borderWidth: 1,
                borderColor: colors.borderDefault,
                padding: sp.s5,
                marginBottom: sp.s3,
                alignItems: 'center',
              },
            ]}
          >
            <Text
              style={{
                fontFamily: 'Courier New',
                fontSize: fs.bodyLg ?? fs.bodyMd,
                color: colors.textPrimary,
                letterSpacing: 2,
                textAlign: 'center',
                lineHeight: 30,
              }}
              selectable
              accessibilityLabel={t('screens2:recoveryCode.codeA11y', { code })}
            >
              {code}
            </Text>
          </View>
        </Animated.View>

        {/* Copy button — with press-scale micro-interaction */}
        <Animated.View
          style={[
            reduceMotion ? undefined : staggerStyle(staggerAnims[2]),
            { transform: [{ scale: copyScale }] },
          ]}
        >
          <TouchableOpacity
            onPress={handleCopy}
            onPressIn={() => {
              if (!reduceMotion) {
                Animated.timing(copyScale, { toValue: 0.97, duration: 100, useNativeDriver: true }).start();
              }
            }}
            onPressOut={() => {
              Animated.spring(copyScale, { toValue: 1, damping: 15, stiffness: 300, useNativeDriver: true }).start();
            }}
            accessibilityRole="button"
accessibilityLabel={t('screens2:recoveryCode.copyA11y')}
            style={[
              styles.btn,
              {
                backgroundColor: copied ? colors.statusSuccess : colors.bgSecondary,
                borderRadius: r.lg,
                borderWidth: 1,
                borderColor: copied ? colors.statusSuccess : colors.accentDefault,
                padding: sp.s3,
                marginBottom: sp.s6,
                minHeight: 44,
                justifyContent: 'center',
              },
            ]}
          >
            <Text
              style={{
                color: copied ? colors.statusSuccess : colors.accentDefault,
                fontSize: fs.bodyMd,
                fontWeight: fontWeight.semibold,
                textAlign: 'center',
              }}
            >
              {copied ? t('screens2:recoveryCode.copied') : t('screens2:recoveryCode.copyToClipboard')}
            </Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Checkbox-style confirm + confirm button */}
        <Animated.View style={reduceMotion ? undefined : staggerStyle(staggerAnims[3])}>
          <TouchableOpacity
            onPress={() => setConfirmed((v) => !v)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: confirmed }}
accessibilityLabel={t('screens2:recoveryCode.savedCheckboxA11y')}
            style={[styles.checkRow, { marginBottom: sp.s5 }]}
          >
            <View
              style={[
                styles.checkbox,
                {
                  width: 22,
                  height: 22,
                  borderRadius: r.sm,
                  borderWidth: 2,
                  borderColor: confirmed ? colors.accentDefault : colors.borderDefault,
                  backgroundColor: confirmed ? colors.accentDefault : 'transparent',
                  marginRight: sp.s3,
                  alignItems: 'center',
                  justifyContent: 'center',
                },
              ]}
            >
              {confirmed && (
                <Text style={{ color: theme.components.buttonPrimaryText, fontSize: 14, fontWeight: fontWeight.bold }}>
                  ✓
                </Text>
              )}
            </View>
            <Text style={{ color: colors.textPrimary, fontSize: fs.bodyMd, flex: 1, lineHeight: 22 }}>
              {t('screens2:recoveryCode.savedCheckboxLabel')}
            </Text>
          </TouchableOpacity>

          {/* Confirm button */}
          <TouchableOpacity
            onPress={handleConfirm}
            disabled={acking}
            accessibilityRole="button"
accessibilityLabel={t('screens2:recoveryCode.confirmButtonA11y')}
            style={[
              styles.btn,
              {
                backgroundColor: confirmed ? colors.accentDefault : colors.borderDefault,
                borderRadius: r.lg,
                padding: sp.s4,
                opacity: acking ? 0.7 : 1,
                minHeight: 52,
                justifyContent: 'center',
              },
            ]}
          >
            <Text
              style={{
                color: confirmed ? theme.components.buttonPrimaryText : colors.textTertiary,
                fontSize: fs.bodyMd,
                fontWeight: fontWeight.semibold,
                textAlign: 'center',
              }}
            >
              {acking ? t('screens2:recoveryCode.savingLabel') : t('screens2:recoveryCode.confirmButtonLabel')}
            </Text>
          </TouchableOpacity>

          <Text
            style={{
              color: colors.textTertiary,
              fontSize: fs.caption,
              textAlign: 'center',
              marginTop: sp.s4,
              lineHeight: 18,
            }}
          >
{t('screens2:recoveryCode.footerNote')}
          </Text>
        </Animated.View>
      </ScrollView>
    </ScreenLayout>
  );
}

// ---------------------------------------------------------------------------
// Static styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  content: {
    paddingTop: 24,
  },
  title: {},
  warningBanner: {},
  codeCard: {},
  btn: {},
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {},
});
