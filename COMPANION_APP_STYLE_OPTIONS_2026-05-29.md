# Peak Fettle Mind — Exhaustive Style Options Compilation
*Design exploration for the companion app (TICKET-072 follow-on). 2026-05-29.*
*Grounded in the live token architecture: `mobile/src/theme/tokens.ts` (Primitive → Semantic → Component). Every named direction below is expressed as a drop-in `PrimitiveTokens` palette + optional shared-token overrides, so it slots straight into `ThemeContext` / `theme-factory`.*

> **This is an options menu, not a decision.** Pick one direction (or a mix of axes from §2) and I'll turn it into a real `theme.ts` + a clickable screen. Nothing here is built yet.

---

## 0. Design constraints that gate every option (from the pitch + safety rules)

Peak Fettle Mind is **light, evidence-based wellbeing — explicitly not clinical treatment**. Style must therefore obey:

- **Calm over energetic.** The fitness app is high-contrast, teal-on-near-black, bold — built to *energize*. Mind should *settle*. Lower contrast ceilings, softer accents, more whitespace, slower motion.
- **No alarm aesthetics.** Reserve saturated red strictly for genuine errors/crisis affordances — never for "you missed a day." Streaks here are gentle and forgiving (no guilt color language).
- **Accessibility floor.** WCAG AA (4.5:1 body text, 3:1 large text/UI). Mental-health users include people in low-energy/low-focus states — generous touch targets (≥48pt, already a token), high legibility, Reduce-Motion respected.
- **No dark patterns in the visual language.** No false urgency (pulsing red badges, countdown timers), no manipulative streak-loss dramatization, no infinite-scroll bait.
- **Crisis affordance is always legible.** Whatever the palette, the "Need help?" / 988 surface must hit AAA-level contrast and never be styled like a dismissible toast.

---

## 1. How a "style" maps to the shared system (so each option is implementable)

A style in this codebase = **one `PrimitiveTokens` object** (the only layer that changes per theme) plus optional overrides to the *shared* tokens (`spacing`, `radius`, `fontSize`, `fontWeight`, `motion`, `fontFamily`). The semantic builder (`buildSemanticTokens`) and component builder (`buildComponentTokens`) stay identical, so a new look is mostly a palette swap.

**The 12 hex slots you fill per palette:**
`navy950 / navy900 / navy800 / navy700 / navy600` (background + elevation scale — for **light** themes these become a *light* scale, lightest = `navy950` role) · `accent500 / 400 / 600` · `white` (= primary text, can be near-black on light themes) · `slate400 / slate600` (secondary/tertiary text) · `buttonText` (contrast color on the accent) · `success / warning / error`.

**Levers beyond color** (the axes in §2): corner radius, density/spacing, type family + weight ceiling, motion durations, icon weight, illustration style, texture/depth.

---

## 2. Style AXES (mix-and-match dimensions — the real "exhaustive" surface)

You can compose a style by choosing one value on each axis. The named directions in §3 are pre-composed presets, but any combination is valid.

### Axis A — Light / Dark / Adaptive
- **A1 Dark-first** (matches Peak Fettle today; cohesive, battery-friendly OLED, "evening wind-down" mood).
- **A2 Light-first** (the dominant convention for calm/wellness apps — Calm, Headspace lean light/airy; feels open, daytime, clinical-clean).
- **A3 Adaptive** (follows OS `userInterfaceStyle: automatic`, already set in app.json) — ship both, switch on system setting. **Recommended** for a wellbeing app used morning and night.
- **A4 Time-of-day adaptive** (warmer/dimmer in evening, brighter at morning) — novel, on-theme for sleep/mood, more build cost.

### Axis B — Color temperature & palette system
- **B1 Cool calm** — blues, teals, soft cyans (trust, serenity; closest to Peak Fettle's teal so it reads as a sibling).
- **B2 Warm calm** — sand, terracotta, clay, dusty rose (grounding, human, "hygge").
- **B3 Green/nature** — sage, eucalyptus, moss (restoration, growth; overlaps Peak Fettle "Forest").
- **B4 Muted lavender/violet** — soft purple, periwinkle (mindfulness, sleep; overlaps "Midnight").
- **B5 Neutral/greyscale + single accent** — near-monochrome with one calming accent (maximally calm, minimal).
- **B6 Earthy multi-tone** — a small warm-neutral family + 2 desaturated accents (editorial, mature).
- **B7 Pastel duotone** — two soft pastels (approachable, younger skew — use cautiously, can read juvenile).

### Axis C — Saturation & contrast strategy
- **C1 Desaturated/muted** (every hue pulled toward grey — the calmest; recommended).
- **C2 Soft-vivid** (gentle but present accents).
- **C3 High-contrast accessible** (for low-vision users; offer as an a11y theme regardless of default).

### Axis D — Typography
- **D1 Keep Outfit** (geometric sans; already bundled, free, brand-consistent with Peak Fettle).
- **D2 Humanist sans** (e.g. Inter, Source Sans, Figtree) — warmer, more neutral than geometric; excellent legibility.
- **D3 Serif headings + sans body** (e.g. Lora/Fraunces headings) — editorial, calming, "journal" feel; strong differentiator from the fitness app.
- **D4 Rounded sans** (e.g. Nunito, Quicksand, Varela Round) — soft, friendly, low-stakes.
- **D5 Soft-mono accents** (a monospace for timestamps/numbers only) — quiet precision.
- Weight ceiling: cap at **SemiBold (600)** for a calmer voice (Peak Fettle uses Bold 700 freely).

### Axis E — Shape & corner language
- **E1 Soft (radius 12–20)** — current `lg:16`; friendly.
- **E2 Pill-forward (`radius.full` for CTAs, chips)** — gentle, modern.
- **E3 Squircle / superellipse** — premium, iOS-native feel (continuous corners).
- **E4 Sharp (radius 4–6)** — editorial/clinical; less "appy," more "publication." Use sparingly for calm.
- **E5 Organic blobs** — illustration-level rounded shapes behind cards (very soft; risk of looking dated).

### Axis F — Spacing & density
- **F1 Airy** (bump base margins from 16→20/24, more `s8`/`s12` between sections) — **recommended**; whitespace is calming.
- **F2 Standard** (reuse Peak Fettle spacing exactly).
- **F3 Compact** (data-dense — wrong for Mind; listed for completeness).

### Axis G — Motion philosophy
- **G1 Slow & breathing** (durations 1.3–1.6× Peak Fettle's; ease-in-out; a literal "breathing" pacing) — on-theme.
- **G2 Standard** (reuse `motion` tokens).
- **G3 Minimal/none** (near-static; respects low-stimulation preference) — pair with a prominent Reduce-Motion-style toggle.
- Signature micro-interaction candidates: a breathing-orb expand/contract, a gentle check "settle," mood-color crossfades.

### Axis H — Iconography
- **H1 Thin line (1.5px)** — calm, airy (vs Peak Fettle's filled/duotone Ionicons).
- **H2 Rounded line** — friendly.
- **H3 Duotone soft-fill** — warmth without heaviness.
- **H4 Hand-drawn** — distinctive, human (consistency cost).
- Keep the existing `Icon.tsx` `<Text>`-glyph approach (no runtime font load — IOS-26 fix) but swap the glyph set.

### Axis I — Illustration & imagery
- **I1 Abstract gradients/auras** (no people; mood via color fields).
- **I2 Soft figurative illustration** (Headspace-style characters) — warm but expensive/branding-heavy.
- **I3 Nature photography** (skies, water, foliage; calming but heavy assets + licensing).
- **I4 Geometric/line motifs** (subtle, cheap, scalable).
- **I5 Generative/organic patterns** (per-user mood gradients — ties to mood data).
- **I6 No imagery** (typography + color only; fastest, most minimal).

### Axis J — Texture & depth
- **J1 Flat** (current).
- **J2 Soft elevation** (gentle shadows/blur; "floating cards").
- **J3 Glassmorphism** (translucent layers — premium, can hurt contrast/perf; test on device).
- **J4 Subtle grain/noise** (warmth, reduces banding on gradients).
- **J5 Soft gradients** (background washes; very on-theme for calm).
- **J6 Neumorphism** (avoid — poor contrast/accessibility).

### Axis K — Mood-tracking visual language (Mind-specific data viz)
- **K1 Color-as-mood** (each mood maps to a hue; trends render as color gradients over time).
- **K2 Soft line/area charts** (rounded, low-grid, pastel fills).
- **K3 Dot/heatmap calendar** (GitHub-style but gentle palette).
- **K4 Abstract "garden/weather"** (mood as growing plant / sky state — metaphor, not numbers; very non-clinical).
- **K5 Minimal numerals + sparkline** (quiet, factual).

### Axis L — Sound & haptics
- **L1 Silent + soft haptics** (recommended default; gentle tap confirmations).
- **L2 Ambient audio option** (breathing cues, optional soundscapes — content/licensing scope).
- **L3 None** (fully silent).

---

## 3. NAMED, PRE-COMPOSED STYLE DIRECTIONS (the catalog)

Each is a complete preset: a `PrimitiveTokens` palette (hex), plus the axis choices that define it. Palettes are written **light-first or dark-first** as noted; for light themes, the `navyXXX` slots hold a light→deeper scale and `white` holds the near-black text color (the semantic builder maps `bgPrimary=navy950`, `textPrimary=white`, so we just invert the values — the architecture doesn't change).

> Contrast note: all body-text pairings below are targeted at WCAG AA; exact ratios get locked when we build the real theme (the existing themes carry per-token AA annotations — we'll do the same).

---

### Family 1 — Cool & Serene (reads as Peak Fettle's calmer sibling)

#### 1A. "Still Water" — light, cool, desaturated *(recommended default)*
- **Axes:** A2 light · B1 cool · C1 muted · D2 Inter or D1 Outfit · E1/E2 soft+pill · F1 airy · G1 breathing · H1 thin line · I1 auras · J5 soft gradients.
- **Palette (light-first):**
  - `navy950:#F7FAFC` (app bg) · `navy900:#EDF3F6` (cards) · `navy800:#E1EAEF` (inputs) · `navy700:#D2DEE5` (elevated/borders) · `navy600:#B8CAD4`
  - `accent500:#5B9AA6` (muted teal) · `accent400:#7FB3BD` · `accent600:#48808B`
  - `white:#1B2A30` (= primary text, near-black teal-grey) · `slate400:#5A6B72` · `slate600:#78878D`
  - `buttonText:#FFFFFF` · `success:#5FA46F` · `warning:#D9A441` · `error:#C2564B` (desaturated, non-alarming)
- **Mood:** spa-calm, daylight, trustworthy. Closest sibling to Peak Fettle's teal without copying it.

#### 1B. "Deep Calm" — dark, cool (the dark twin of 1A; pairs with Peak Fettle Deep Ocean)
- **Axes:** A1 dark · B1 cool · C1 muted · G1 breathing · J5 gradients.
- **Palette (dark-first):**
  - `navy950:#0C1418` · `navy900:#111C22` · `navy800:#16252C` · `navy700:#1D3038` · `navy600:#234049`
  - `accent500:#5FB3B8` (soft aqua) · `accent400:#7FC7CB` · `accent600:#469499`
  - `white:#E8F0F2` · `slate400:#9DB0B6` · `slate600:#76888E`
  - `buttonText:#08161A` · `success:#56B36B` · `warning:#D6A martin`→`#D6A martin` use `#D6A24A` · `error:#D06A60`
- **Mood:** evening wind-down, meditative. Ship 1A/1B as the adaptive light/dark pair (Axis A3).

---

### Family 2 — Warm & Grounding (human, "hygge", most differentiated from fitness app)

#### 2A. "Warm Sand" — light, warm neutral
- **Axes:** A2 light · B2 warm · C1 muted · D3 serif headings + sans body · E1 soft · F1 airy · I4 line motifs · J4 grain.
- **Palette (light-first):**
  - `navy950:#FAF6F1` · `navy900:#F2EAE0` · `navy800:#E9DDCE` · `navy700:#DCCBB6` · `navy600:#C9B299`
  - `accent500:#C2745A` (terracotta) · `accent400:#D38E76` · `accent600:#A55C45`
  - `white:#2C2420` (warm near-black) · `slate400:#6E6258` · `slate600:#8A7C70`
  - `buttonText:#FFF8F2` · `success:#7B9A5F` · `warning:#CC9A3F` · `error:#BF5E4E`
- **Mood:** journal, ceramic, cozy. The serif headings make it feel like a wellbeing *book*, not a fitness tracker.

#### 2B. "Clay & Dusk" — dark, warm
- **Axes:** A1 dark · B2 warm · pairs with Peak Fettle "Ember" as a calmer cousin.
- **Palette (dark-first):**
  - `navy950:#141009` · `navy900:#1D170F` · `navy800:#261E14` · `navy700:#33271A` · `navy600:#46341F`
  - `accent500:#D98E6A` (soft clay) · `accent400:#E6A684` · `accent600:#BD7250`
  - `white:#F0E7DD` · `slate400:#B09C8A` · `slate600:#897668`
  - `buttonText:#1A130C` · `success:#86A45E` · `warning:#D6A martin`→`#D6A24A` · `error:#CC6B57`
- **Mood:** candlelit, grounding, late-evening reflection.

---

### Family 3 — Nature / Restorative

#### 3A. "Sage" — light, green, botanical
- **Axes:** A2 light · B3 green · C1 muted · D4 rounded sans · E1 soft · I5 generative plant motifs · K4 garden mood-viz.
- **Palette (light-first):**
  - `navy950:#F5F8F3` · `navy900:#E9F0E6` · `navy800:#DCE7D7` · `navy700:#C9D8C2` · `navy600:#AEC4A4`
  - `accent500:#6E9E78` (sage) · `accent400:#8FB897` · `accent600:#557E5E`
  - `white:#1F2A21` · `slate400:#5C6B5F` · `slate600:#79877B`
  - `buttonText:#FFFFFF` · `success:#5FA46F` · `warning:#CFA24A` · `error:#C2564B`
- **Mood:** growth, restoration, "tend to yourself." Pairs naturally with the habit-garden mood metaphor (K4).

#### 3B. "Forest Night" — dark, green (calmer Peak Fettle "Forest")
- **Palette (dark-first):**
  - `navy950:#0A120C` · `navy900:#101B13` · `navy800:#16241A` · `navy700:#1E3124` · `navy600:#284332`
  - `accent500:#6FB07E` · `accent400:#8FC79C` · `accent600:#4F8C61`
  - `white:#E6EFE8` · `slate400:#9DB0A2` · `slate600:#76887B` · `buttonText:#08130C`
  - `success:#5FA46F` · `warning:#CFA24A` · `error:#C8665A`

---

### Family 4 — Mindful Lavender / Sleep

#### 4A. "Twilight Lavender" — adaptive, violet
- **Axes:** A4 time-of-day (light lavender by day, deep indigo by night) · B4 lavender · C1 muted · G1 breathing · I1 auras · J5 gradients.
- **Light palette:** `navy950:#F8F6FC` · `navy900:#EFEAF7` · `navy800:#E4DCF1` · `navy700:#D3C7E8` · `navy600:#B9A8DA` · `accent500:#8A78C4` · `accent400:#A493D6` · `accent600:#6E5DA8` · `white:#241F33` · `slate400:#615A75` · `slate600:#7E7691` · `buttonText:#FFFFFF`.
- **Mood:** sleep, meditation, evening calm. Strong for a sleep/mood feature set. Sibling to Peak Fettle "Midnight."

---

### Family 5 — Minimal / Editorial

#### 5A. "Paper" — light, near-monochrome + one accent *(maximally calm)*
- **Axes:** A2 light · B5 greyscale+accent · C1 muted · D3 serif headings · E4 sharp-ish (radius 8) · F1 airy · I6 no imagery · J1 flat.
- **Palette (light-first):**
  - `navy950:#FCFCFB` · `navy900:#F4F4F2` · `navy800:#EAEAE7` · `navy700:#DCDCD8` · `navy600:#C3C3BD`
  - `accent500:#6A8CA4` (one soft slate-blue) · `accent400:#88A4B8` · `accent600:#527189`
  - `white:#222220` · `slate400:#5E5E59` · `slate600:#7C7C76` · `buttonText:#FFFFFF`
  - `success:#5E9468` · `warning:#C49A45` · `error:#B85B4E`
- **Mood:** Kinfolk/Notion-calm. Cheapest to build (no illustration), ages well, ultra-legible. **Strong fast-to-MVP choice.**

#### 5B. "Ink" — dark, near-monochrome (calmer Peak Fettle "Monochrome")
- **Palette (dark-first):** `navy950:#0C0C0D` · `navy900:#151517` · `navy800:#1F1F22` · `navy700:#2B2B2F` · `navy600:#3A3A40` · `accent500:#9FB2C2` · `accent400:#B8C7D4` · `accent600:#7E94A6` · `white:#EDEDEF` · `slate400:#9A9AA0` · `slate600:#74747A` · `buttonText:#0C0C0D`.

---

### Family 6 — Soft & Approachable (younger / lower-stakes)

#### 6A. "Cloud" — light, pastel duotone, rounded
- **Axes:** A2 light · B7 pastel duotone · C2 soft-vivid · D4 rounded sans (Nunito) · E2 pill-forward · H2 rounded line · I2 soft figurative.
- **Palette (light-first):** `navy950:#FBFAFF` · `navy900:#F1F0FB` · `navy800:#E6E6F7` · `navy700:#D6D7F0` · `navy600:#BCBEE6` · `accent500:#7C9CF0` (soft blue) + secondary `#F4A9C0` (soft rose via `accentSecondary`) · `accent400:#9DB6F4` · `accent600:#5E80E0` · `white:#2A2A3A` · `slate400:#646480` · `buttonText:#FFFFFF`.
- **Mood:** friendly, gentle, Headspace-adjacent. **Caution:** can skew juvenile; keep type restrained to avoid "toy" feel.

---

### Family 7 — Premium / Atmospheric

#### 7A. "Aurora" — dark, gradient-rich, glass
- **Axes:** A1 dark · B mix (teal→violet aura) · C2 soft-vivid · J3 glass + J5 gradients · I1 auras · G1 breathing.
- **Palette (dark-first):** base `navy950:#0A0D16` · `navy900:#0F1320` · `navy800:#15192B` · `navy700:#1D2238` · `navy600:#2A3050`; gradient accent pair `accent500:#5FB3B8`→ secondary `#8A78C4` (rendered as a LinearGradient on CTAs/headers, already have `expo-linear-gradient`). `white:#E9ECF5` · `slate400:#9AA2B8` · `buttonText:#0A0D16`.
- **Mood:** high-end, immersive, "calm-tech." Highest build cost (gradients, glass, perf testing on device — mind the iOS-26 lessons).

---

### Family 8 — Accessibility-first (ship regardless of default)

#### 8A. "Clear" — high-contrast accessible theme
- **Axes:** C3 high-contrast · D2 humanist at larger base sizes · G3 minimal motion · J1 flat · E1 soft.
- **Palette (light):** `navy950:#FFFFFF` · `navy900:#F2F2F2` · `navy800:#E6E6E6` · `navy700:#CFCFCF` · `navy600:#B0B0B0` · `accent500:#1F6F78` (AA on white at all text sizes) · `accent400:#2A8A94` · `accent600:#155159` · `white:#111111` · `slate400:#3A3A3A` (note: darker than usual to guarantee AA) · `slate600:#555555` · `buttonText:#FFFFFF` · `error:#B00020` (this theme MAY use a true alarm-red because contrast/clarity outranks calm for low-vision users).
- **Mood:** not a "look," a duty. Offer in settings as "High contrast," like an a11y companion to the chosen aesthetic.

---

## 4. Cross-app relationship strategy (how Mind looks next to Peak Fettle)

Choose the intended *family resemblance* — this is as important as the palette:

- **Twin** — share Outfit, the teal accent, dark-first; Mind is just "calmer Peak Fettle." Lowest cost, strongest "two apps, one brand." → directions **1A/1B, 5B**.
- **Sibling (recommended)** — same token architecture and component shapes, but a distinct calmer palette + softer type/motion so it *feels* like its own space while obviously related. → **1A + 2A + 5A** shortlist.
- **Cousin** — deliberately different (light-first, serif, warm) to signal "this is your private, off-duty space, not your training dashboard." Strongest emotional separation; more design work. → **2A, 5A, 4A**.

Recommended logo/brand tie-in: keep the "Fettle" wordmark, add a **Mind** lockup; reuse `BrandLogo` patterns. If you ever rename to umbrella "Fettle" (pitch Q-A), Body/Mind share a mark with different accent tints — the token system already makes that a one-palette swap.

---

## 5. Recommended shortlist + next step

If I had to cut the menu to three to prototype:
1. **"Still Water" (1A)** + dark twin **"Deep Calm" (1B)** as an adaptive pair — sibling to Peak Fettle, safest, on-theme. *Top pick.*
2. **"Warm Sand" (2A)** — if you want Mind to feel emotionally *separate* and human (serif + warm).
3. **"Paper" (5A)** — if speed-to-MVP and timelessness matter most (no illustration budget).

Every option ships with **"Clear" (8A)** available as the accessibility theme.

**How we'd build the chosen one:** run `anthropic-skills:theme-factory` / `frontend-design` to generate the real `mind/src/theme/tokens.ts` from the selected palette, render 2–3 key screens (mood check-in, habits home, an exercise player) as a clickable preview, and iterate before any feature work — exactly the TICKET-073/074 sequence (safety scaffolding + foundation first).

---

## 6. Open style questions (route to OPEN_QUESTIONS_FOR_FOUNDER.md if you want to lock them now)
- **SQ-1 Relationship:** Twin, Sibling, or Cousin to Peak Fettle? (Drives everything.)
- **SQ-2 Light vs dark default:** Adaptive recommended — confirm.
- **SQ-3 Illustration budget:** none / line-motif / full figurative? (Big cost + branding lever.)
- **SQ-4 Type:** keep Outfit (free, bundled) or invest in a serif/humanist pairing?
- **SQ-5 Mood-viz metaphor:** numbers/charts (K2/K5) vs garden/weather metaphor (K4)?
