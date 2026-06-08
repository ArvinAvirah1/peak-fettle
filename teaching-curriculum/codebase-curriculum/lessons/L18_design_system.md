# Lesson L18 — The design system: tokens & theming

> **Track:** 3 — QML/Qt UI · **Status:** Core design infrastructure
> **Interactive app:** [`L18_design_system.html`](L18_design_system.html)
> **Estimated time:** ~40 min · **Prerequisite rungs:** L14 (QML intro), L16 (QML layouts)

## 0. Source of truth (read fresh before teaching — code drifts)
- `qml/Theme.qml` — the singleton theme object: color palette (lines 16–30), spacing scale (lines 32–40), radii (lines 42–45), typography (lines 47–52).
- `MyApp/constants/theme.ts` — React Native equivalent: `Brand` primitives, `Colors.light` and `Colors.dark` objects, `Fonts` platform-specific.
- Peak Fettle design spec (`peak_fettle_design_spec.docx` or project notes) — Phase E migration context, 470+ hex values replaced with tokens.
- `qml/components/*.qml` — example token usage: `PrimaryButton.qml`, `ThemedTextField.qml`, `SecondaryButton.qml`.
- Design system methodology: atomic design, token naming (color-role vs. semantic), light/dark mode switching.

## 1. Learning outcomes (Bloom-tagged)
By the end, Arvin can:
- **(L2)** Explain what a design token is, why it differs from inline hex, and what classes of bug a token layer prevents.
- **(L3)** Apply tokens correctly in a QML component (e.g., a button or text field), and implement light/dark mode by swapping color objects.
- **(L4)** Analyze the cost/benefit of the Phase E migration (470+ hex → tokens): what was the payoff, what was the overhead, and for which user (solo founder pre-launch) was it justified?
- **(L5)** Evaluate a design system choice: should buttons reference tokens directly, or should components expose semantic properties (e.g., `buttonColor: "primary"`) that map to tokens internally?

## 2. Pre-lesson survey (M1) — ask LIVE
- "Experience with design systems (Material Design, Tailwind, custom tokens): none / read about one / used one / built one?"
- "Have you maintained a codebase where colors were hardcoded hex, and had to change them? What was painful?"
- "Philosophy question: for a solo founder pre-launch, is a design system 'nice to have' or 'essential'?"
> Calibrate on design system familiarity and founder mindset (speed vs. polish).

## 3. Spacing carry-over (M14)
From L17 (charts):
- "Why does `Theme.turquoise` work in QML without importing anything?"
- "When you change a theme color, what has to happen for it to redraw everywhere?"

## 4. The difficulty ladder for THIS lesson
1. What a design token is; the difference between `#00C9B8` and `Theme.turquoise`.
2. Primitive vs. semantic tokens (Brand.turquoise vs. Colors.dark.accent).
3. Singleton registration in Qt/QML; why Theme doesn't need an import.
4. Light/dark mode switching: two color objects, one flag, reactive bindings.
5. The spacing & typography systems (4-pt grid, font sizes).
6. The Phase E migration: scope (470+ hex), strategy, payoff (which bugs prevented?).

## 5. Concept sequence

### Concept 1: Design tokens vs. inline hex — the single source of truth

- **(M4) Generate first:** "Your app has a navy-blue color used in 47 places. The designer says 'change it to a slightly lighter navy.' With inline hex, what have to you change? What could go wrong?"

- **(M7) Concrete hook:** Before tokens, Peak Fettle had scattered hex values:
  ```qml
  // ProgressGraphPage.qml
  Rectangle { color: "#0A1A33" }  // navy
  Text { color: "#00C9B8" }       // turquoise
  
  // SettingsPage.qml
  Rectangle { color: "#0A1A33" }  // same navy (copied)
  Button { color: "#00C9B8" }     // same turquoise (copy again)
  ```
  The designer says "adjust navy to `#0B1C36`". You have to find and change every instance. If you miss one, the UI becomes inconsistent — a page looks slightly off but you can't tell why.

- **The idea:** A design token is a *named variable* for a design decision. Instead of repeating `#0A1A33`, you define `Theme.navyDeep` once, and everywhere uses that name. Changes are atomic — one edit, one redraw everywhere.
  - **Inline hex:** "What color is it?" → "Read the hex value." Scattered, fragile, no semantics.
  - **Token:** "What color is it?" → "It's `Theme.navyDeep`." One source, semantic name, auditable.

- **Real code** (`qml/Theme.qml`, lines 16–23):
  ```qml
  pragma Singleton
  import QtQuick

  QtObject {
      // ----- Core palette -----
      readonly property color black:        "#06080F"   // near-pure black bg
      readonly property color navyDeep:     "#0A1A33"   // primary dark blue
      readonly property color navyMid:      "#122E5C"   // card / panel surface
      readonly property color navyLine:     "#1E3A66"   // subtle borders
      readonly property color turquoise:    "#2DD4BF"   // primary accent
  ```
  And usage in a component:
  ```qml
  // ProgressGraphPage.qml, line 30
  background: Rectangle { color: Theme.black }
  
  // line 168
  contentItem: Text {
      color: Theme.turquoise
  ```

- **(M6) Elaboration:** Tokens aren't just a code organization trick. They're a *semantic layer* — `Theme.navyDeep` says "this is the dark background," not just "this pixel value." When the designer changes navy because the app is getting a rebrand, you don't change 47 hex values — you change `Theme.navyDeep` once, and the entire app updates in one build. For a solo founder, that's the difference between "I can iterate on design in hours" and "I need a designer and developer to coordinate on 47 files."

- **(M3) Retrieval check:** "If you inline hex everywhere, what's the signal that a color is inconsistent?"

### Concept 2: Primitive vs. semantic tokens

- **The idea:** There are two layers of tokens:
  1. **Primitive:** Named hex values with no context. `Brand.navyDeep = "#0A1A33"`. These are the atoms.
  2. **Semantic:** Roles that reference primitives. `Colors.dark.background = Brand.navyDeep`. "In dark mode, backgrounds use navy-deep." This layer says *what role the color plays*, not just what it is.

- **(M7) Concrete hook:** You're building a light mode. What color should text be in light mode? You *could* say `Colors.light.text = "#000000"` (black). But a more thoughtful choice is `Colors.light.text = Brand.lightText = "#0D2137"` (a slightly lighter dark navy, easier on the eyes than pure black on light backgrounds). The semantic layer captures this design intent: "text in light mode is navy-ish, not true black."

- **Real code** (`MyApp/constants/theme.ts`, lines 35–62):
  ```typescript
  const tintColorLight = Brand.skyBlue;
  const tintColorDark  = Brand.turquoise;

  export const Colors = {
    light: {
      text:            Brand.lightText,      // "#0D2137"
      background:      Brand.lightBg,        // "#F0F5FA"
      surface:         Brand.lightSurface,   // "#E2EAF2"
      tint:            tintColorLight,       // Brand.skyBlue
      accent:          Brand.turquoise,
      icon:            Brand.lightMuted,
      tabIconDefault:  Brand.slateMid,
      tabIconSelected: tintColorLight,
      tabBar:          '#FFFFFF',
      header:          Brand.navyMid,
    },
    dark: {
      text:            Brand.offWhite,       // "#E2ECF4"
      background:      Brand.navyDeep,      // "#09151F"
      surface:         Brand.navyMid,       // "#0D2137"
      tint:            tintColorDark,       // Brand.turquoise
      accent:          Brand.turquoise,
      icon:            Brand.slateLight,
      tabIconDefault:  Brand.slateMid,
      tabIconSelected: tintColorDark,
      tabBar:          Brand.navyMid,
      header:          Brand.navyLight,
    },
  };
  ```

- **(M6) Elaboration:** This two-layer structure is the foundation of light/dark mode. You define *one* set of semantic tokens per theme (light and dark), and the same app code uses `Colors.text`, which resolves to either `Brand.lightText` (light mode) or `Brand.offWhite` (dark mode) depending on a theme flag. No component has to know about the theme — the Colors object handles it.

- **(M3) Retrieval check:** "If you're in light mode and you reference `Colors.text`, what value do you get, and why?"

### Concept 3: The spacing scale — the 4-point grid

- **The idea:** Not just colors; the entire design system is token-based. Spacing follows a 4-point grid: every margin, padding, and gap is a multiple of 4 pixels. This rhythm creates visual coherence and prevents "random" spacing scattered across the codebase.

- **Real code** (`qml/Theme.qml`, lines 32–40):
  ```qml
  // ----- Spacing scale (4-pt grid) -----
  readonly property int s1:  4
  readonly property int s2:  8
  readonly property int s3:  12
  readonly property int s4:  16
  readonly property int s5:  24
  readonly property int s6:  32
  readonly property int s7:  48
  readonly property int s8:  64
  ```
  Usage in ProgressGraphPage.qml (line 160):
  ```qml
  anchors.leftMargin:  Theme.s4    // 16 px
  anchors.rightMargin: Theme.s4
  spacing: Theme.s3                // 12 px
  ```

- **(M6) Elaboration:** This rhythm is *not* arbitrary. In Material Design and similar systems, a 4-point or 8-point grid is standard. Why? Because it creates a visual rhythm that feels intentional — spacing isn't "16 here, 13 there" but "s4 here, s3 there" — and it's cheap to adjust the entire app (change `s4: 16` to `s4: 18` and everything reflows). For a solo founder iterating, this scales-with-the-designer paradigm is powerful.

- **(M3) Retrieval check:** "If a component uses `spacing: 12`, which spacing token is that, and would it look out of place next to `spacing: 13`?"

### Concept 4: Typography tokens and font scaling

- **The idea:** Like spacing, typography is token-based: defined sizes and families, not scattered `font.pixelSize: 14` scattered in code.

- **Real code** (`qml/Theme.qml`, lines 47–52):
  ```qml
  // ----- Typography sizes (logical pt) -----
  readonly property int fontDisplay: 36
  readonly property int fontH1:      26
  readonly property int fontH2:      20
  readonly property int fontBody:    15
  readonly property int fontSmall:   12
  ```
  Usage in ProgressGraphPage.qml (lines 179–180):
  ```qml
  font.pixelSize: Theme.fontH2
  font.bold: true
  ```

- **(M6) Elaboration:** Logical sizes (pt) vs. pixels (px) matter on different platforms. Qt uses `pixelSize`, which is physical pixels, but conceptually these are "point-like" sizes: h1 = 26 for headlines, body = 15 for body text. When the designer says "make all h1s slightly bigger," you change one line: `fontH1: 28`, and every page reflows.

- **(M3) Retrieval check:** "Which token would you use for a set list label: fontBody or fontSmall?"

### Concept 5: Light/dark mode switching

- **(M4) Generate first:** "How do you implement dark mode in a 200-file app without duplicating every color reference?"

- **The idea:** Once you have two semantic color objects (`Colors.light` and `Colors.dark`), switching modes is trivial: a theme flag, and bindings automatically use the right object. No component cares about the flag — they just reference `Colors` properties.

- **Real code** (conceptual architecture):
  ```qml
  // Global theme flag (not shown in the current files, but implied)
  ThemeManager {
      property bool isDarkMode: true
      
      property var currentColors: isDarkMode ? darkColors : lightColors
  }
  
  // In a component:
  Text {
      color: ThemeManager.currentColors.text
  }
  ```
  The React Native equivalent (`MyApp/constants/theme.ts`) has two separate `Colors` objects; the mobile app would have a theme context that selects one at startup and on toggle.

- **(M6) Elaboration:** Peak Fettle doesn't *currently* have a light-mode toggle (it ships with dark as the default). But the token structure makes adding one trivial — just add a flag and change which `Colors` object is in scope. Without tokens, light mode would require a second pass over every file to identify hardcoded colors and swap them.

- **(M3) Retrieval check:** "If you change the theme flag to light mode, how does a Text widget automatically recolor without being re-written?"

### Concept 6: Phase E migration — 470+ hex values to tokens

- **(M4) Generate first:** "Your codebase has 470+ scattered hex colors. You're about to iterate design heavily. Do you tokenize, or ship as-is and refactor later?"

- **The idea:** Phase E (pre-launch phase) made a strategic choice: migrate 470+ hex values to the token layer. This was *not* feature work — it was infra. But it enabled the design iteration that followed (dark/light testing, color refinement) without multiplying merge conflicts.

- **Cost:** Weeks of mechanical refactoring. Every hex found and linked to a token. Testing to ensure no color changed during the rewrite. Potentially broke some things (missed a hex, or misnamed a token).

- **Payoff:** After migration, the designer could say "make navyDeep 5% lighter" and Arvin could change one line and ship. Without it, every color tweak requires hunting 470+ files. For a solo founder 2–4 weeks from launch, the choice was clear: invest the time in infrastructure so design iteration doesn't become a bottleneck.

- **Real code** (from Phase E notes): the migration process:
  ```
  Before:
    #0A1A33 appears in ProgressGraphPage.qml, SettingsPage.qml, 
    PrimaryButton.qml, SetTrackerPage.qml, ... (47 places)
  
  After:
    Theme.navyDeep = "#0A1A33"  // defined once
    ProgressGraphPage uses Theme.navyDeep
    SettingsPage uses Theme.navyDeep
    ... (atomic change now)
  ```

- **(M6) Elaboration:** This migration is a classic founder trade-off. Speed vs. maintainability. Without tokens, Arvin ships faster (no refactoring week). With tokens, he iterates faster *after* shipping (one-line changes instead of 47-file hunts). For a pre-launch app with uncertain design, the latter is rational. For a stable codebase in maintenance mode, tokens might be overkill.

- **(M3) Retrieval check:** "If the Phase E migration took 5 days of work, what's the minimum number of design-iteration cycles needed to break even?"

### Concept 7: Component design — tokens vs. semantic properties

- **(M4) Generate first:** "You're building a reusable button. Do you hardcode `color: Theme.primary`, or do you expose a `buttonType: "primary"` property that maps to tokens internally?"

- **The idea:** There's a third layer of abstraction: components. A `PrimaryButton` *could* reference tokens directly:
  ```qml
  // Option A: tokens in components
  Rectangle {
      color: Theme.turquoise
      Text { color: Theme.textOnAccent }
  }
  ```
  Or it could expose a semantic property:
  ```qml
  // Option B: semantic properties
  Rectangle {
      property string buttonType: "primary"  // or "secondary"
      color: buttonType === "primary" ? Theme.turquoise : Theme.navyDeep
      Text { color: buttonType === "primary" ? Theme.textOnAccent : Theme.text }
  }
  ```
  Peak Fettle uses option A (tokens directly in components, minimal abstraction). This is simpler for a small codebase and lets designers change `Theme` without touching components.

- **Real code** (`qml/components/PrimaryButton.qml`):
  ```qml
  Button {
      contentItem: Text {
          text: parent.text
          color: parent.checked ? Theme.textOnAccent : Theme.textPrimary
          // ...
      }
      background: Rectangle {
          color: parent.checked ? Theme.turquoise : Theme.navyDeep
          // ...
      }
  }
  ```

- **(M6) Elaboration:** Option A (tokens directly) is the "happy path" for early-stage apps: fewer layers, easier to onboard. Option B (semantic properties) scales better when you have 50 component variations and need to change "primary" systematically across all of them. Peak Fettle chose simplicity; as it grows, adding a component-property layer would be a future refactor.

- **(M3) Retrieval check:** "If you wanted every button in the app to use a new color, would you change PrimaryButton.qml or Theme.qml?"

## 6. Teach-back (M10)
"Explain to a product designer in ~5 sentences: What's a design token, why did Peak Fettle migrate 470+ hex values, what did that enable, and what's the cost/benefit for a solo founder pre-launch?"

## 7. Cumulative review (M13) — rapid-fire
1. What's the difference between a primitive token (Brand.navyDeep) and a semantic token (Colors.dark.background)?
2. In the 4-point spacing grid, which token is 12 pixels?
3. How would you add light-mode support to an app with a complete token system? (One sentence.)

## 8. The graded quiz (Bloom L1–L5)

| # | Bloom | Type | Prompt | Rubric | Model answer | Pts |
|---|-------|------|--------|--------|--------------|-----|
| q1 | L1 | free | Define "design token" and give one example from Peak Fettle. | Correct definition (named variable for design decision); real example | A design token is a named variable for a design decision (e.g., `Theme.turquoise = "#2DD4BF"`). Instead of scattering the hex value, you define it once and reference the name everywhere. | 10 |
| q2 | L2 | free | Explain the single source of truth principle: why is storing a color once (Theme.turquoise) safer than repeating the hex in 47 components? | Identifies drift risk; names the consistency hazard | If the color is repeated inline, you have to change it in 47 places. Miss one, and that component looks inconsistent (you see slightly off colors but can't tell why). Storing it once means one edit → one redraw everywhere. | 12 |
| q3 | L3 | free | You're adding a new button variant. Write QML that uses tokens to set its background and text color. | Uses Theme.* correctly; shows token references, not inline hex | Rectangle { color: Theme.navyDeep; border.color: Theme.navyLine } Text { color: Theme.turquoise } — no hex values, only token names. | 12 |
| q4 | L4 | free | Analyze the Phase E migration (470+ hex → tokens). What was the cost, what did it enable, and for which founder profile (speed-focused or design-iterable) was it justified? | Clear cost (refactoring time); clear payoff (design iteration speed); contextualizes for founder profile; weighs trade-off | Cost: 5 days of mechanical refactoring. Payoff: one-line design changes instead of 47-file hunts, enabling fast iteration. For a pre-launch solo founder with uncertain design (Arvin), it's justified because iteration is the bottleneck. For a mature codebase, might be overkill. | 18 |
| q5 | L5 | free | The designer asks to darken every navy color by 10%. In a token system, what changes? Without tokens, what's the risk? Propose a strategy that lets you iterate safely without tokens. | With-tokens case: one edit, redraw everywhere. Without-tokens case: hunt 47 files, miss one → inconsistency. Proposes a grep-replace or refactor strategy that's still risky. | With tokens: change `navyDeep: "#0A1A33"` to `navyDeep: "#081C36"` — done. Without tokens: grep -r "#0A1A33", replace in all results (risky: might hit a different navy). Best strategy without tokens: add a temporary conversion layer, then refactor incrementally. Takeaway: tokens prevent this problem by design. | 22 |
| q6 | L5 | free | Design a light-mode toggle for Peak Fettle. Assuming Colors.light and Colors.dark are defined, how would you structure the code so *no component changes* when the user switches modes? | Proposes a theme flag / context; shows how components bind to it; demonstrates reactivity without per-component updates | Create a ThemeManager singleton with a `isDark: bool` property. Each component binds to `Colors.text` (which resolves to Colors.dark.text or Colors.light.text based on isDark). When isDark changes, all bindings update automatically — zero component changes. | 22 |

## 9. Custom interactive widget
**Design token explorer** — an interactive palette with:
- Swatch grid showing all colors in Theme.qml (navyDeep, turquoise, etc.)
- Slider to simulate "darken navy by X%"
- Live preview showing which components update
- Toggle between light/dark mode to show both color objects
- Hex value + semantic name for each swatch

Lets Arvin see what a color change ripples through and understand why tokens centralize design decisions.

## 10. End-of-session updates (agent)
- Grade quiz via the app's "Grade with Claude."
- Update `teacher_skill.md` PART 2: design system knowledge before/after; did the Phase E migration story feel relevant? Which Bloom levels held up? Understanding of tokens vs. semantic properties.
- Offer to schedule L19 (Qt object model) a few days out. Carry-over questions: "What's a Q_PROPERTY?" and "How does QML bind to C++ properties?"
