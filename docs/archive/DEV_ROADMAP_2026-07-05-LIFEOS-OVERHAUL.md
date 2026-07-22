# DEV ROADMAP 2026-07-05 — LIFEOS DESIGN + QoL OVERHAUL (TICKET-147…174)

Full design + QoL overhaul of `lifeos/`, driven by competitive research (screen-time blockers, habit/routine apps, mood/goals/review apps, 2026 iOS QoL bar). Founder decisions locked 2026-07-05: **Evolve Summit** (keep palette/fonts/design contract — no visual-language rework), **Parity + select exceeds**, **Strict invariants** (local-first, no runtime AI, no new personal-data server surface beyond Q33 partner summary, Productivity-not-Mental-Health).

## 🚦 STATUS (live — update after every wave; a fresh session resumes from here)

```
BASELINE  HEAD 614af3e · parse sweep 81 files/0 fail · tests 307/307 (25+207+16+18+30+11)
WAVE 1  foundations        TICKET-147..151  ✅ LANDED (commit 0933c08; sweep 85/0, tests 353 green incl. new migrations-v3 43)
WAVE 2A teams A+B          TICKET-152..161  ✅ LANDED (commit 7d33d8b; sweep 93/0, tests 383 incl. streaks 60; partial qty days='skip'; Today momentum must use streakSummaryForHabit/todayLogRows/activePauses; /mood-history route needs no _layout reg)
WAVE 2B teams C+D          TICKET-162..170  ✅ LANDED (commit 1ecf7d5; sweep 103/0, tests 383; PRO_PRICE_LABEL needs founder's real price string; MaybeNotificationPrime 2nd mount on Today = Wave-4 item)
WAVE 3  native widgets     TICKET-171..172  ✅ LANDED (commit f5aba60; sweep 104/0 incl modules, tests 383; Swift verified syntactically only — EAS rebuild required; Wave-4 must wire consumePendingRelock in _layout PendingUnlockWatcher + snooze LA start in unlock.tsx useSnooze)
WAVE 4  revision + gate    TICKET-173..174  ✅ COMPLETE — RUN COMPLETE (sweep 105/0, tests 383/383, contract clean)
RESUME → nothing; run complete. FOUNDER ACTIONS: (1) git push origin main from your machine (sandbox cannot push); (2) set real price string in lifeos/src/config/pricing.ts PRO_PRICE_LABEL before App Store review; (3) EAS rebuild + install — Swift work (widget check-off flip, LA relock intent) is syntactically verified only; watch first build for dual App Intents metadata registration of RelockFocusIntent (hoist to shared file if it complains); (4) on-device: test widget tap check-off (iOS 17+), island relock during snooze, momentum ring, swipe check-off, weekly review flow.
```

⚠️ MOUNT RULES (confirmed active 2026-07-05, root cause = ftruncate ignored): NEW files via Write tool = safe. GROWING an existing file via Edit/Write = truncates at old EOF; SHRINKING = stale tail bytes. So: modify existing files via bash only (fresh /tmp heredoc + `cat tmp > target`, or python3 replace-patch), then verify `wc -c` + single-file babel parse. rm/mv/unlink blocked. Commit via plumbing (temp GIT_INDEX_FILE + commit-tree + printf sha > .git/refs/heads/main); `tmp_obj_*` unlink warnings are benign. Diff only against explicit HEAD.

**CONTINUE PROTOCOL (for a resumed session):** read this STATUS block; the next line with ⏳/🔴 is the resume point. Before resuming: run the §Verification quick-commands to confirm the tree is green; then launch the wave exactly as specified in §Waves. Each wave = operator agent(s) (model fable) spawning sonnet subagents with the file-ownership below. Commit after each wave (checkpoint), update this block via bash rewrite. Never edit `lifeos/plugins/withFamilyControls.js` (load-bearing FC target-registry patch). Max 2 operators concurrently (sandbox shell is effectively single-slot). npm install on the mount is impossible — no new npm deps in any ticket.

## Wave-1 APIs (frozen — Wave 2+ must import these, never reimplement)

- `src/lib/haptics.ts`: `haptic.success()/warning()/error()/selection()/impact('light'|'medium'|'heavy')`, `setHapticsEnabled(on)`, `isHapticsEnabled()`. Only permitted expo-haptics import site.
- `src/lib/feedback.ts`: `showToast({message, kind?: 'info'|'success'|'error', durationMs?})`; `safeWrite<T>(fn, {errorMessage?, context?}): Promise<T|undefined>` — wrap EVERY localDb write.
- `src/components/motion.tsx`: `PressableScale`, `FadeSlideIn({index})`, `SpringReorder`, `Celebration({run, onDone?, particleCount<=199})`, `springs.press/gentle/bouncy`. All reduce-motion-aware.
- Schema v3 (SCHEMA_VERSION=3): `lo_habits.habit_type('boolean'|'quantity'|'timer') / target_value / target_unit / weekly_quota`; `lo_habit_logs.value / note` (UNIQUE(habit_id,date) retained — quantity accumulates by updating the day row's value); `lo_goals.metric_type('milestone'|'numeric'|'habit_linked') / metric_target / metric_current`; `lo_mood_checkins` no longer UNIQUE(date) (multi/day legal); `lo_habit_pauses(id, habit_id, start_date, end_date NULL=open, reason)` in BACKUP_TABLES.

## Invariants every ticket must respect

1. Local-first: all new data on-device SQLite (`lifeos/src/db/`); zero new REST calls.
2. No runtime AI; no AI copy in UX. No clinical/mental-health claims (Productivity positioning).
3. Design contract V3 (`lifeos/LIFEOS_DESIGN_CONTRACT_V3.md`): token-driven only, no raw hex in screens, no emoji-as-icon, 44pt targets, AA contrast. Overhaul evolves *within* Summit.
4. Forgiving/non-punitive philosophy: no punitive streak mechanics, no guilt mechanics, no leaderboards.
5. `FAMILY_CONTROLS_ENABLED=false` stays false; FC-dependent work ships behind the existing flag and must degrade gracefully when off.
6. Tests stay green; parse sweep stays 0-fail; migrations are additive + tested.

## Research digest (what the market says)

**Parity bar (table-stakes across categories):** swipe/gesture check-off; quantity + timer habit types; flexible x-per-week scheduling; skip/vacation without streak loss; heatmap/calendar history; per-entry notes; fast (≤2-tap) unlimited mood check-ins with factor tags; Live Activity/Dynamic Island for sessions; interactive widgets (App Intents); legible "time reclaimed"-style dashboard number; spring-physics motion + haptics as baseline polish; transparent paywall (Apple now rejects toggle/dark patterns); empty states + fast time-to-value onboarding.

**Chosen exceeds (whitespace/complaint-driven):** (a) weekly review as a first-class celebratory ritual — only Sunsama does this at all (T160); (b) weekly-quota habits — "read 4× some days, 0 others" unsupported almost everywhere (T154); (c) visible streak-protection/pause — #1 abandonment complaint is hard-reset streaks (T156); (d) friction *menu* — one sec's varied interventions beat single fixed friction (T162); (e) no-AI/local-first stated as a trust feature (copy in T167/T168).

**Deliberate CUTS (documented, not ticketed):** pet/RPG gamification & leaderboards (off-positioning), NFC/hardware unlock, full Watch app, app-wide Shortcuts/App Intents (defer; native), audio/voice stack player (new deps), Control Center tiles (defer), cross-device sync (invariant), AI anything (invariant), PIN-gated protection-revocation (needs FC entitlement live).

## Effort × Utility (S<150 LOC · M 150–400 · L 400+/engine+tests; U1–5)

| # | Ticket | E | U | Note |
|---|--------|---|---|------|
|147| Haptics engine | S | 5 | cheapest whole-app feel upgrade |
|148| Feedback/toast + safeWrite | M | 5 | kills silent DB-write failures (only 7 catch blocks in repo) |
|149| Motion kit | M | 4 | shared spring/celebration primitives |
|150| Summit depth pass | M | 4 | ui.tsx/tokens/tab bar; wires 147+149 into primitives |
|151| Schema v3 | M | 5 | unblocks 153/154/156/157/158/161 |
|152| Gesture check-off | M | 5 | top parity gap |
|153| Quantity/timer habits | L | 4 | parity |
|154| Weekly-quota cadence | M | 4 | EXCEED |
|155| Heatmap + habit stats | M | 4 | parity |
|156| Pause/vacation + protection UX | M | 5 | EXCEED, top complaint |
|157| Check-off note | S | 3 | parity |
|158| Mood 2.0 (multi/day, 2-tap) | M | 5 | UNIQUE(date) today = below parity |
|159| Year-in-pixels + insights | M | 4 | parity |
|160| Weekly review ritual 2.0 | M | 5 | EXCEED (whitespace) |
|161| Goal metrics + progress viz | L | 4 | parity |
|162| Friction library | M | 4 | one sec parity/EXCEED |
|163| Time-reclaimed dashboard | M | 4 | Opal pattern, FC-flag-safe |
|164| Today hero + momentum | M | 5 | single legible number pattern |
|165| Stack player 2.0 | M | 4 | vs Routinery/Fabulous |
|166| Onboarding TTV | M | 4 | defer permission priming |
|167| Paywall transparency | S | 3 | Apple 3.1.2 climate |
|168| You-hub redesign | M | 3 | |
|169| Empty states + a11y (D screens) | S | 4 | |
|170| Milestone celebrations | S | 4 | performant confetti + share hook |
|171| Interactive widget check-off | L | 4 | Swift/App Intents; EAS rebuild to verify |
|172| Live Activity polish (island relock) | M | 3 | ScreenZen pattern |
|173| Fable integration revision | M | 5 | cross-team consistency |
|174| Verification gate + commit | S | 5 | non-negotiable DoD |

## Waves + file ownership (disjoint — no two agents ever edit the same file)

**WAVE 1 — Operator F1. ✅ DONE.** T147 `src/lib/haptics.ts`; T148 `src/lib/feedback.ts` + `src/components/Toast.tsx` + `app/_layout.tsx` mount; T149 `src/components/motion.tsx`; T151 schema v3 (`src/db/*`, `__tests__/migrations-v3.test.js`, migrations-v2 test updated); T150 `src/theme/tokens.ts` + `src/components/ui.tsx` + `app/(tabs)/_layout.tsx`.

**WAVE 2A — Operators F2 (Team A) + F3 (Team B), concurrent.**
Team A Habits: T152–157. Owns `app/(tabs)/habits.tsx`, `app/habit-editor.tsx`, `src/data/habits.ts`, `src/engine/streaks.ts`, new `src/components/habits/*`, `__tests__/streaks.test.js`.
Team B Mood/Goals/Review: T158–161. Owns `app/mood-checkin.tsx`, `app/weekly-review.tsx`, `app/(tabs)/goals.tsx`, `app/goal-detail.tsx`, `src/data/{mood,goals,insights,reviews}.ts`, new `src/components/mood/*`, may ADD `app/mood-history.tsx` (new route file = safe Write; if root `_layout.tsx` registration is needed, note it for Wave 4 — do NOT edit `_layout.tsx`).
Every team also applies the **QoL checklist to its own files only**: adopt `haptics.ts` semantics, `motion.tsx` springs, `safeWrite`/toast on every DB write, `EmptyState` everywhere a list can be empty, a11y labels/roles on custom controls, 44pt targets, loading states on async surfaces.

**WAVE 2B — Operators F4 (Team C) + F5 (Team D), concurrent.**
Team C Focus/Today/Stacks: T162–165. Owns `app/(tabs)/focus.tsx`, `app/(tabs)/index.tsx`, `app/focus-editor.tsx`, `app/unlock.tsx`, `app/stack-player.tsx`, `src/components/BreathingGate.tsx`, new `src/components/focus/*`, `src/data/focus.ts`.
Team D Chrome/Journeys: T166–170. Owns `app/onboarding/*`, `app/index.tsx`, `app/upsell.tsx`, `app/(tabs)/you.tsx`, `app/(auth)/*`, `app/{exercises,exercise-player,affirmations,partner,data-handling,reminders,crisis-help,share-card,app-wellbeing}.tsx`.

**WAVE 3 — Operator F6, solo/sequential.** T171 widget App Intents check-off (`targets/widget/*` Swift + `src/services/widgetBridge.ts` write-back), T172 Live Activity island countdown + relock (`modules/live-activity/*` Swift visuals; JS API surface only where needed). DO NOT touch `plugins/withFamilyControls.js`; keep FC plugin ordering intact; expect EAS rebuild for on-device verification.

**WAVE 4 — final fable revision (T173) then gate (T174).** T173: cross-team audit — token/contract adherence (grep raw hex), haptic-semantic consistency, duplicate-component dedupe, dead code, copy tone (no AI/clinical language), then fixes. T174 DoD: `@babel/parser` sweep of `lifeos/app`+`lifeos/src` = 0 failures (parser at `mobile/node_modules/@babel/parser`); run all `lifeos/__tests__/*.test.js` green; commit. Founder pushes + EAS build (nothing reaches device without push + rebuild).

## Per-ticket acceptance criteria

- **T147**: `haptic.success()/warning()/selection()/impact()` wrapping expo-haptics; no-ops when system disabled; single import site semantics documented in file header. ✅
- **T148**: `<ToastProvider>` in `_layout.tsx`; `safeWrite(fn, {onErrorToast})` helper: catches, toasts non-blockingly, logs; zero behavior change when writes succeed. ✅
- **T149**: `PressableScale`, `FadeSlideIn`, `SpringReorder` helpers, `Celebration` (reanimated confetti, <200 particles, respects reduce-motion), motion tokens reused from `tokens.ts`. ✅
- **T150**: additive tokens only (elevation/gradient/hairline); PFButton press = scale+haptic; Card `elevated|outlined|gradient` variants; tab bar with active pill + icon spring; EmptyState gains `illustration` variants; **no palette changes**. ✅
- **T151**: migration runs on fresh + v2 DBs; mood rows preserved through table recreate; new test file covers both paths + CHECK constraints. ✅
- **T152**: swipe right completes (with haptic + spring), swipe left opens skip/rest sheet; long-press = quick actions (edit/pause/note); works with 153/154 types.
- **T153**: editor picks type; quantity logs accumulate toward `target_value` with stepper + unit; timer type = target duration with start/stop (foreground only, no background task); streak engine counts day done when target met; tests extended.
- **T154**: cadence `weekly:N`; habit row shows "n of N this week"; week window = user locale Monday; streak engine treats quota-met week correctly; tests extended.
- **T155**: habit detail sheet: 365-day heatmap (View-based, no new deps), completion %, current/best streak, per-month strip.
- **T156**: pause ranges suppress misses (engine + UI chip "paused"); protected/grace days render as degradation not break; copy is kind, never shaming.
- **T157**: optional note on any log via long-press sheet; shown in habit detail history.
- **T158**: multiple check-ins/day listed on Today sparkline day-tap; entry = 2 taps (mood → done), tags optional third tap; keeps ≤30s flow.
- **T159**: year-in-pixels grid on a mood-history surface; correlation cards get plain-language framing + minimum-sample guard (existing thresholds).
- **T160**: 4-step guided flow (celebrate wins → domain scan → carry-over picks → set 1–3 intentions) with progress dots, completion celebration (T149), review streak chip; ≤5 min.
- **T161**: numeric goals: target/current + quick "+X" update + progress bar + milestone list retained; goal-detail gets progress-over-time mini-chart (View-based).
- **T162**: intervention picker per focus rule: breathing (existing), typed-intention, hold-the-dot (press-and-hold 10s), reflection prompt; `unlock.tsx` renders selected; escalation/snooze budget unchanged.
- **T163**: Focus tab hero = single legible number (time reclaimed today) + blocks-held + hourly bar strip; renders informative zero-state when FC flag off.
- **T164**: Today leads with a momentum ring/number (habits done ÷ due, streak-weighted); card order: hero → next stack → mood → review nudge → proposals → milestones; affirmation card moves below fold.
- **T165**: step progress ring + per-step haptic + auto-advance countdown + "minimize" floating pill on Today that resumes player; Live Activity start/stop via existing JS module API only.
- **T166**: notification permission asked only after first completed check-in/stack (contextual prime screen), not during survey; survey gains progress indicator + per-step skip where non-essential; plan-reveal polish.
- **T167**: upsell shows price + renewal terms + Restore Purchases visibly; adds "Your data stays on this device" trust block; no toggles/urgency timers.
- **T168**: you.tsx grouped sections (Profile/streak summary header → Features → Data & Privacy → Support); every row 44pt with chevron + icon; local-first trust copy.
- **T169**: every D-owned screen has EmptyState w/ single CTA, a11y labels on custom controls, loading states on async (partner/backup/entitlement).
- **T170**: 7/30/66/100/365 milestones fire Celebration + offer share-card; never blocks interaction; reduce-motion = static badge.
- **T171**: widget checklist rows check off via App Intent writing through App Group → app reconciles on next open; falls back to deep-link open on <iOS 17.
- **T172**: island shows unlock countdown + one-tap relock during snooze; lock-screen Live Activity mirrors; JS API unchanged or additive.
- **T173/174**: see Wave 4 above.

## Verification quick-commands

```bash
cd "…/Peak Fettle/lifeos"
node -e "const p=require('../mobile/node_modules/@babel/parser');const fs=require('fs'),path=require('path');let n=0,bad=[];function w(d){for(const f of fs.readdirSync(d)){const fp=path.join(d,f);const s=fs.statSync(fp);if(s.isDirectory())w(fp);else if(/\.(ts|tsx)$/.test(f)){n++;try{p.parse(fs.readFileSync(fp,'utf8'),{sourceType:'module',plugins:['jsx','typescript']})}catch(e){bad.push(fp+': '+e.message)}}}}w('app');w('src');console.log(n+' files, '+bad.length+' fail');bad.forEach(b=>console.log(b))"
for t in __tests__/*.test.js; do echo "== $t"; node "$t" 2>&1 | tail -1; done
grep -rn "#[0-9a-fA-F]\{6\}" app/ && echo "HEX VIOLATION" || echo "contract clean"
```
