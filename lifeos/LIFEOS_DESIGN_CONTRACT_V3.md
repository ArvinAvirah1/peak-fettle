# LifeOS v3 — Design Contract for the new screens

*Created 2026-06-20 (ui-ux-pro-max pass). Governs every screen/widget added in TICKET-119…125.
The point of this file: new surfaces must look like the app that already exists — `consistency`
is the top design rule here. Do **not** invent a new palette, font, or component primitive.*

## 1. Single source of visual truth
- **Theme:** `lifeos/src/theme/tokens.ts` — "Summit" palette (deep slate-indigo surfaces, sunrise-amber
  accent). Dark + light designed together; AA contrast already met. **Use `useTheme().colors` semantic
  tokens only — no raw hex in screens.**
- **Spacing/type/radius/motion:** import from `tokens.ts` (`spacing` 4/8pt, `radius`, `fontSize`,
  `fontFamily` = Outfit, `iconSize`, `motion`, `HIT_TARGET = 44`).
- **Icons:** `Ionicons` from `lifeos/src/components/Icon` only. **No emoji as icons** (skill rule).

## 2. Reuse these primitives verbatim (`lifeos/src/components/ui.tsx`)
| Primitive | Use for |
|---|---|
| `ScreenLayout` | page wrapper (safe-area, scroll, 16pt gutter) — every new screen |
| `Card` | grouped sections; pass `onPress` for tappable cards (pressed = opacity, no layout shift) |
| `SectionTitle` | uppercase section headers |
| `PFButton` | actions — variants `primary | secondary | ghost | destructive`; `icon`, `loading`, `disabled` |
| `PFInput` | text fields — has `label`, `error`, `helper` (use for partner label, custom affirmations) |
| `EmptyState` | feature-OFF / no-data states (default-OFF features must explain, never silently blank) |

**Settings-row pattern** (copy from `app/(tabs)/you.tsx` `linkRow`): icon + label + `chevron-forward`,
`minHeight: HIT_TARGET+4`, pressed opacity 0.7, `accessibilityRole="button"`.
**Segmented control pattern** (copy from `you.tsx` theme picker): flex row of bordered `Pressable`s;
selected = `accentMuted` bg + `accentDefault` border + `accessibilityState={{selected}}`.

## 3. Feature-toggle screen (TICKET-119) shape
- A new `SectionTitle`"Features" block of `Card`s in the You tab (or `you/features.tsx`), one row per
  `OPTIONAL_FEATURES` entry: label + `description` caption + a `Switch`.
- `Switch`: native RN `Switch`, `trackColor={{true: accentDefault}}`, `accessibilityState={{checked}}`,
  ≥44pt row. Bound to `useFeatureFlags().flags[key]` → `setFlag(key, on)`.
- All four default **OFF**. Toggling OFF hides that feature's entry points app-wide.

## 4. Copy & interaction guardrails (CONTENT_SAFETY + forgiving design — binding)
- **Never shaming, never coercive.** Milestone/affirmation/score copy is celebratory or neutral, never
  loss-framed ("don't break your streak!" is banned). Forgiving-streak language only.
- **No money stakes, no clinical/therapeutic claims, no "mental-health app" framing** anywhere.
- Color is never the only signal (ring/score always shows a numeral + label — `color-not-only`).
- Respect `prefers-reduced-motion` on every celebration/share animation; micro-interactions 150–300ms,
  exit ~65% of enter (`motion` tokens already encode this).
- Touch targets ≥44pt; tappable elements give pressed feedback; destructive actions sit apart.
- Dynamic Type: prefer wrapping over truncation; tabular-nums (`fontVariant: ['tabular-nums']`) for all
  counts/streaks/timers.

## 5. Per-feature visual notes
- **Share cards (120):** off-screen `Card`-styled view → `react-native-view-shot`; include the
  "Peak Fettle LifeOS" wordmark; our trade dress only (no competitor visual refs). Affordance is
  dismissable, never a flow-blocking modal.
- **Partner (121):** `PFInput` for partner label; show the *exact* summary string in a `Card` preview
  before first send; pause/revoke as a `destructive`-tinted row.
- **App wellbeing score (122):** Energizing/Neutral/Draining as a 3-way segmented control per app row;
  weekly score shown with numeral + label + correlation-not-causation caption.
- **Affirmations (123):** today's line on Today tab as a quiet `Card` (flag-gated); list with per-line
  enable `Switch` + `PFInput` to add user lines; gentle identity-anchored tone ("I am someone who…").
- **Reminder-time UIs (124):** time pickers per type; show the ≤2/day + quiet-hours rule inline as
  `helper`/caption so the cap is legible, not a silent failure.

## 6. Widgets (116–118)
- Colors come from the payload `theme` block (mirrors Summit tokens) so widgets match the active in-app
  theme. Every widget view gets an `accessibilityLabel`; ring/score never color-only; verify Dynamic
  Type doesn't truncate; 44pt+ interactive areas (117 check-off).
