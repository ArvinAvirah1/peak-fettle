/**
 * ToastProvider — non-blocking, token-driven toast overlay.
 *
 * Mounts once near the app root (see app/_layout.tsx). Registers itself with
 * feedback.ts's registerToastHandler so any module — including plain-TS data
 * layers that call safeWrite — can trigger a toast without importing React.
 *
 * Dependency-light on purpose: uses the core react-native Animated API (not
 * reanimated) so this file stays cheap to reason about (TICKET-148).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { fontFamily, fontSize, motion, radius, spacing } from '../theme/tokens';
import { Ionicons } from './Icon';
import { registerToastHandler, ToastKind, ToastOptions } from '../lib/feedback';

const DEFAULT_DURATION_MS = 3000;
const ERROR_DURATION_MS = 4000;

interface ActiveToast extends ToastOptions {
  kind: ToastKind;
  durationMs: number;
  // Monotonically-increasing id (not Date.now()/Math.random()) so each toast
  // is distinguishable for timer bookkeeping without touching the clock.
  id: number;
}

function iconForKind(kind: ToastKind): string {
  if (kind === 'success') return 'checkmark-circle';
  if (kind === 'error') return 'alert-circle';
  return 'information-circle';
}

export function ToastProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const { theme } = useTheme();
  const c = theme.colors;
  const insets = useSafeAreaInsets();

  const [toast, setToast] = useState<ActiveToast | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);

  const nextIdRef = useRef(0);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReduceMotion(enabled);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current != null) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const dismiss = useCallback(() => {
    clearHideTimer();
    if (reduceMotion) {
      setToast(null);
      return;
    }
    Animated.timing(anim, {
      toValue: 0,
      duration: motion.exitMs,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setToast(null);
    });
  }, [anim, clearHideTimer, reduceMotion]);

  const show = useCallback(
    (opts: ToastOptions) => {
      const kind: ToastKind = opts.kind ?? 'info';
      const durationMs = opts.durationMs ?? (kind === 'error' ? ERROR_DURATION_MS : DEFAULT_DURATION_MS);
      nextIdRef.current += 1;
      const next: ActiveToast = { ...opts, kind, durationMs, id: nextIdRef.current };

      clearHideTimer();
      setToast(next);

      AccessibilityInfo.announceForAccessibility(opts.message);

      if (reduceMotion) {
        anim.setValue(1);
      } else {
        anim.setValue(0);
        Animated.timing(anim, {
          toValue: 1,
          duration: motion.enterMs,
          useNativeDriver: true,
        }).start();
      }

      hideTimerRef.current = setTimeout(() => {
        dismiss();
      }, durationMs);
    },
    [anim, clearHideTimer, dismiss, reduceMotion],
  );

  useEffect(() => {
    registerToastHandler(show);
    return () => {
      registerToastHandler(null);
      clearHideTimer();
    };
  }, [show, clearHideTimer]);

  const iconColor =
    toast?.kind === 'success' ? c.statusSuccess : toast?.kind === 'error' ? c.statusError : c.accentDefault;

  return (
    <View style={{ flex: 1 }}>
      {children}
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          paddingTop: insets.top + spacing.s3,
          paddingHorizontal: spacing.s4,
          alignItems: 'center',
        }}
      >
        {toast ? (
          <Animated.View
            style={{
              opacity: anim,
              transform: [
                {
                  translateY: anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-16, 0],
                  }),
                },
              ],
              width: '100%',
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${toast.kind} notification: ${toast.message}. Double tap to dismiss.`}
              onPress={dismiss}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: c.bgElevated,
                borderColor: c.borderDefault,
                borderWidth: 1,
                borderRadius: radius.lg,
                paddingVertical: spacing.s3,
                paddingHorizontal: spacing.s4,
              }}
            >
              <Ionicons name={iconForKind(toast.kind)} size={20} color={iconColor} style={{ marginRight: spacing.s2 }} />
              <Text
                style={{
                  flex: 1,
                  color: c.textPrimary,
                  fontFamily: fontFamily.medium,
                  fontSize: fontSize.bodyMd,
                }}
              >
                {toast.message}
              </Text>
            </Pressable>
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}
