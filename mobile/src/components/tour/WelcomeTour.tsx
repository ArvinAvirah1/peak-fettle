/**
 * WelcomeTour — TICKET-095
 *
 * A first-run, coach-mark guided tour that walks a new user through the core
 * features on the REAL screens (no mock screens): Home logging hub, building a
 * schedule, the stepper, Rankings, progress/Trends, and creating a routine.
 *
 * Design goals (per ticket):
 *   • Thin custom overlay — spotlight on an anchor + tooltip + Back/Next/Skip +
 *     step dots. NO heavy dependency; theme-tokened; works in both themes.
 *   • Skippable at any step, replayable from Settings.
 *   • Auto-runs ONCE on first launch after onboarding; "tour seen" persists in
 *     AsyncStorage.
 *   • Anchors are registered by the target screens via useTourAnchor(id). A step
 *     whose anchor isn't mounted/registered falls back to a centered tooltip —
 *     it is skipped gracefully and never blocks or crashes.
 *
 * Navigation between steps uses the imperative expo-router `router` so this can
 * live above the Stack and drive the underlying tabs as the user steps through.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useTheme } from '../../theme/ThemeContext';

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const TOUR_SEEN_KEY = '@peak_fettle/tour_seen';

// ---------------------------------------------------------------------------
// Tour script — ordered steps over the real screens.
// `route` is navigated (imperatively) before the step shows; `anchorId` is the
// element to spotlight (centered tooltip if it isn't registered/mounted).
// ---------------------------------------------------------------------------

export interface TourStep {
  key: string;
  route: string;
  anchorId?: string;
  title: string;
  body: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    key: 'home-hub',
    route: '/(tabs)',
    anchorId: 'home-start-workout',
    title: 'This is your logging hub',
    body: 'Home is where you train. Tap “Start workout” to begin a session and log your sets right here.',
  },
  {
    key: 'create-schedule',
    route: '/(tabs)/routines',
    anchorId: 'routines-create-schedule',
    title: 'Build your training split',
    body: 'From Routines, tap “Create schedule” to set up a weekly plan or a repeating cycle (e.g. Push → Pull → Legs).',
  },
  {
    key: 'stepper',
    route: '/(tabs)',
    anchorId: 'home-start-workout',
    title: 'Log with the stepper',
    body: 'Starting a workout opens the stepper — log each set’s weight and reps one tap at a time, with rest timers built in.',
  },
  {
    key: 'rankings',
    route: '/(tabs)/rankings',
    title: 'See where you rank',
    body: 'Your lifts are scored into percentiles and tiers against lifters like you. This is your Rankings tab.',
  },
  {
    key: 'trends',
    route: '/(tabs)/rankings',
    title: 'Track your progress',
    body: 'Tap any lift to open its progress graph and watch your trends climb over time.',
  },
  {
    key: 'create-routine',
    route: '/(tabs)/routines',
    anchorId: 'routines-new',
    title: 'Create a routine',
    body: 'Tap “＋ New” to build your own routine, then start it any time from here.',
  },
];

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

type MeasureFn = (cb: (x: number, y: number, w: number, h: number) => void) => void;

interface TourApi {
  isActive: boolean;
  startTour: () => void;
  maybeAutoStart: () => void;
  registerAnchor: (id: string, measure: MeasureFn) => () => void;
}

const TourContext = createContext<TourApi | null>(null);

export function useTour(): TourApi {
  const ctx = useContext(TourContext);
  if (!ctx) {
    // Defensive no-op so a screen that calls useTour() outside the provider
    // (e.g. in a test) never crashes.
    return {
      isActive: false,
      startTour: () => {},
      maybeAutoStart: () => {},
      registerAnchor: () => () => {},
    };
  }
  return ctx;
}

/**
 * Attach the returned ref to the element you want spotlighted, e.g.
 *   const { ref } = useTourAnchor('home-start-workout');
 *   <TouchableOpacity ref={ref} ...>
 * The element must be a host view that supports measureInWindow (View / Pressable
 * / TouchableOpacity all do).
 */
export function useTourAnchor(id: string): { ref: React.RefObject<any> } {
  const ref = useRef<any>(null);
  const { registerAnchor } = useTour();
  useEffect(() => {
    const measure: MeasureFn = (cb) => {
      const node = ref.current;
      if (node && typeof node.measureInWindow === 'function') {
        node.measureInWindow(cb);
      } else {
        cb(0, 0, 0, 0);
      }
    };
    const unregister = registerAnchor(id, measure);
    return unregister;
  }, [id, registerAnchor]);
  return { ref };
}

// ---------------------------------------------------------------------------
// Provider + overlay
// ---------------------------------------------------------------------------

interface Rect { x: number; y: number; width: number; height: number; }

export function TourProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const { theme, fontSize, fontWeight, spacing, radius } = useTheme();
  const c = theme.colors;

  const anchors = useRef<Map<string, MeasureFn>>(new Map());
  const autoStartTried = useRef(false);

  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  const registerAnchor = useCallback((id: string, measure: MeasureFn) => {
    anchors.current.set(id, measure);
    return () => {
      // Only delete if still pointing at this registration.
      if (anchors.current.get(id) === measure) anchors.current.delete(id);
    };
  }, []);

  // Resolve a step: navigate to its route, then measure its anchor (if any).
  const resolveStep = useCallback((index: number) => {
    const step = TOUR_STEPS[index];
    if (!step) return;
    setRect(null);
    try {
      if (step.route) router.navigate(step.route as never);
    } catch {
      // Navigation is best-effort; a bad route must not break the tour.
    }
    // Give the target screen a beat to mount/focus and lay out before measuring.
    const t = setTimeout(() => {
      const measure = step.anchorId ? anchors.current.get(step.anchorId) : undefined;
      if (!measure) {
        setRect(null); // graceful: centered tooltip
        return;
      }
      measure((x, y, w, h) => {
        if (
          typeof x === 'number' && typeof y === 'number' &&
          w > 0 && h > 0 && Number.isFinite(x) && Number.isFinite(y)
        ) {
          setRect({ x, y, width: w, height: h });
        } else {
          setRect(null); // anchor not laid out → centered
        }
      });
    }, 380);
    return () => clearTimeout(t);
  }, []);

  const startTour = useCallback(() => {
    setStepIndex(0);
    setActive(true);
    resolveStep(0);
  }, [resolveStep]);

  const finish = useCallback(() => {
    setActive(false);
    setRect(null);
    AsyncStorage.setItem(TOUR_SEEN_KEY, 'true').catch(() => {});
  }, []);

  const goNext = useCallback(() => {
    setStepIndex((i) => {
      const next = i + 1;
      if (next >= TOUR_STEPS.length) {
        finish();
        return i;
      }
      resolveStep(next);
      return next;
    });
  }, [finish, resolveStep]);

  const goBack = useCallback(() => {
    setStepIndex((i) => {
      const prev = Math.max(0, i - 1);
      if (prev !== i) resolveStep(prev);
      return prev;
    });
  }, [resolveStep]);

  const maybeAutoStart = useCallback(() => {
    if (autoStartTried.current || active) return;
    autoStartTried.current = true;
    AsyncStorage.getItem(TOUR_SEEN_KEY)
      .then((seen) => {
        if (!seen) startTour();
      })
      .catch(() => {});
  }, [active, startTour]);

  const api = useMemo<TourApi>(
    () => ({ isActive: active, startTour, maybeAutoStart, registerAnchor }),
    [active, startTour, maybeAutoStart, registerAnchor],
  );

  const step = TOUR_STEPS[stepIndex];
  const { width: screenW, height: screenH } = Dimensions.get('window');
  const PAD = 8;
  const TOOLTIP_W = Math.min(screenW - 32, 360);

  // Tooltip vertical placement: below the anchor if there's room, else above.
  let tooltipTop = screenH / 2 - 90; // centered default
  if (rect) {
    const below = rect.y + rect.height + 12;
    const wouldOverflow = below + 200 > screenH;
    tooltipTop = wouldOverflow ? Math.max(40, rect.y - 200) : below;
  }

  return (
    <TourContext.Provider value={api}>
      {children}
      <Modal visible={active && !!step} transparent animationType="fade" onRequestClose={finish} statusBarTranslucent>
        <View style={StyleSheet.absoluteFill}>
          {/* Dim layer — spotlight cutout when an anchor rect is known, else full dim. */}
          {rect ? (
            <>
              <View style={[styles.dim, { top: 0, left: 0, right: 0, height: Math.max(0, rect.y - PAD) }]} />
              <View style={[styles.dim, { top: Math.max(0, rect.y - PAD), left: 0, width: Math.max(0, rect.x - PAD), height: rect.height + PAD * 2 }]} />
              <View style={[styles.dim, { top: Math.max(0, rect.y - PAD), left: rect.x + rect.width + PAD, right: 0, height: rect.height + PAD * 2 }]} />
              <View style={[styles.dim, { top: rect.y + rect.height + PAD, left: 0, right: 0, bottom: 0 }]} />
              {/* Highlight ring */}
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  top: rect.y - PAD,
                  left: rect.x - PAD,
                  width: rect.width + PAD * 2,
                  height: rect.height + PAD * 2,
                  borderRadius: radius.md,
                  borderWidth: 2,
                  borderColor: c.accentDefault,
                }}
              />
            </>
          ) : (
            <View style={[styles.dim, StyleSheet.absoluteFillObject]} />
          )}

          {/* Tooltip card */}
          {step ? (
            <View
              style={[
                styles.tooltip,
                {
                  width: TOOLTIP_W,
                  left: (screenW - TOOLTIP_W) / 2,
                  top: tooltipTop,
                  backgroundColor: c.bgSecondary,
                  borderColor: c.borderDefault,
                  borderRadius: radius.lg,
                  padding: spacing.s4,
                },
              ]}
            >
              <Text style={{ fontSize: fontSize.bodyLg, fontWeight: fontWeight.bold, color: c.textPrimary, marginBottom: spacing.s2 }}>
                {step.title}
              </Text>
              <Text style={{ fontSize: fontSize.bodySm, color: c.textSecondary, lineHeight: 20, marginBottom: spacing.s3 }}>
                {step.body}
              </Text>

              {/* Step dots */}
              <View style={styles.dotsRow}>
                {TOUR_STEPS.map((s, i) => (
                  <View
                    key={s.key}
                    style={[
                      styles.dot,
                      {
                        backgroundColor: i === stepIndex ? c.accentDefault : c.borderDefault,
                        width: i === stepIndex ? 18 : 6,
                      },
                    ]}
                  />
                ))}
              </View>

              {/* Controls */}
              <View style={styles.controlsRow}>
                <TouchableOpacity onPress={finish} accessibilityRole="button" accessibilityLabel="Skip tour" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={{ fontSize: fontSize.bodySm, color: c.textTertiary }}>Skip</Text>
                </TouchableOpacity>
                <View style={styles.controlsRight}>
                  {stepIndex > 0 ? (
                    <TouchableOpacity
                      onPress={goBack}
                      style={[styles.btnGhost, { borderColor: c.borderDefault, borderRadius: radius.md }]}
                      accessibilityRole="button"
                      accessibilityLabel="Previous step"
                    >
                      <Text style={{ fontSize: fontSize.bodySm, color: c.textSecondary, fontWeight: fontWeight.medium }}>Back</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    onPress={goNext}
                    style={[styles.btnPrimary, { backgroundColor: c.accentDefault, borderRadius: radius.md }]}
                    accessibilityRole="button"
                    accessibilityLabel={stepIndex === TOUR_STEPS.length - 1 ? 'Finish tour' : 'Next step'}
                  >
                    <Text style={{ fontSize: fontSize.bodySm, color: theme.components.buttonPrimaryText, fontWeight: fontWeight.bold }}>
                      {stepIndex === TOUR_STEPS.length - 1 ? 'Done' : 'Next'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ) : null}
        </View>
      </Modal>
    </TourContext.Provider>
  );
}

const styles = StyleSheet.create({
  dim: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.62)' },
  tooltip: { position: 'absolute', borderWidth: 1 },
  dotsRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 14 },
  dot: { height: 6, borderRadius: 3 },
  controlsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  controlsRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnGhost: { borderWidth: 1, paddingHorizontal: 16, paddingVertical: 9 },
  btnPrimary: { paddingHorizontal: 20, paddingVertical: 9 },
});
