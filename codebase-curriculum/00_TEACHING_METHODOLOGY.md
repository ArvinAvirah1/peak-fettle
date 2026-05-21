---
name: codebase-curriculum-methodology
description: The pedagogy + agent operating manual for the Peak Fettle codebase curriculum. Extends teacher_skill.md (M1–M14) with a Bloom's L1–L5 framework, interactive-app pedagogy, AI-graded-quiz rubric design, and the per-lesson build protocol the teaching agent follows. READ THIS FIRST, before the roadmap, before every lesson.
type: skill
owner: Arvin
last_reviewed: 2026-05-19
---

# Peak Fettle Codebase Curriculum — Teaching Methodology & Agent Operating Manual

> **This is the document the teaching agent reads first, at the start of every session, before opening the roadmap.** It tells the agent *how* to teach so that what Arvin learns actually sticks. The *what* (the topics, in order) lives in [`01_ROADMAP.md`](01_ROADMAP.md). The reusable shells the agent fills in live in [`LESSON_TEMPLATE.md`](LESSON_TEMPLATE.md) and [`lesson_app_template.html`](lesson_app_template.html).

There are four companion documents and you should hold all four in your head:

| File | Role |
|------|------|
| `00_TEACHING_METHODOLOGY.md` (this file) | How to teach — the science + the protocol |
| `01_ROADMAP.md` | What to teach, in dependency order — the whole stack |
| `LESSON_TEMPLATE.md` | The fill-in-the-blanks markdown lesson skeleton |
| `lesson_app_template.html` | The fill-in-the-blanks interactive quiz app shell |
| `lessons/L01_cpp_domain_model.*` | One fully-worked reference lesson to copy the pattern from |

This file also defers to the existing **`teacher_skill.md`** at the project root, which already encodes methods **M1–M14** and the **living LEARNER PROFILE for Arvin**. *Do not duplicate that profile here.* This document layers three things on top of it: (1) a precise Bloom's taxonomy framework so quiz questions are pitched correctly, (2) the pedagogy specific to building *interactive applications* as the teaching surface, and (3) the concrete per-lesson build protocol.

---

## Part 0 — The non-negotiables (read once, internalize forever)

Three rules override everything else. If a lesson violates one of these, it is a worse lesson no matter how polished:

1. **Retrieval beats review.** The learner reproducing an idea from memory — even imperfectly — builds more durable memory than re-reading the idea. Roediger & Karpicke (2006) found roughly a 50% long-term recall advantage for retrieval over restudy. Practically: every lesson must make Arvin *produce* answers, not just nod along. The interactive app and the quiz exist precisely to force production.
2. **Difficulty that is *desirable* is the goal, not difficulty that is *confusing*.** Bjork's "desirable difficulties" framework: spacing, interleaving, and self-generation feel harder in the moment and that effortful feeling is the encoding happening. But cognitive *overload* (too many new things at once) destroys learning (Sweller). The art is calibrating to the edge of Arvin's ability — which is why the LEARNER PROFILE exists and must be honored.
3. **Schema before detail.** New facts only stick if there is an existing mental structure to hang them on (schema theory). Always activate prior knowledge and give the map before the territory. Never open a lesson with a code dump.

---

## Part 1 — The research-backed methods (summary + where they live)

The full method set, with citations and effect sizes, is in **`teacher_skill.md` → PART 1 (M1–M14)**. The teaching agent applies all of them. Here is the condensed operating sequence so you do not have to re-derive the order each time:

**Open the session**
- **M1 — Pre-lesson survey.** 2–4 calibration questions via the AskUserQuestion tool. Always include an "I'm not sure" option so admitting a gap is cheap. Surface what Arvin already knows so you can skip it.
- **M14 — Spacing carry-over.** Before new material, ask 1–2 retrieval questions from the *previous* lesson. This is the spacing effect; it is the cheapest high-yield thing you can do.
- **M2 — Difficulty ladder.** State the rung order for this lesson up front so Arvin has the map.

**Teach each concept (loop)**
- **M4 — Generation before instruction.** Pose the problem *before* teaching the answer ("given X, how would you design Y?"). Let him attempt. Wrong attempts still encode (Bertsch et al. 2007, g ≈ 0.40).
- **M7 — Concrete → abstract → concrete.** Start with a picture-able example, extract the principle, then a *second, surface-different* example to build transfer.
- **M8 — Dual coding.** Pair every structural concept with a diagram. In the interactive app this is a baked-in requirement, not optional.
- **M9 — Worked example → faded scaffold.** For code/SQL/logic: one fully worked example, then a half-blank one Arvin completes, then a blank one. Never ask a novice to generate cold.
- **M3 — Retrieval after each concept**, not just at the end. One open question. Wait. Do not pre-answer.
- **M6 — Elaborative interrogation.** After a correct answer, ask "and *why* is it built that way?" Causal explanation strengthens the trace.
- **M11 — Immediate, specific feedback.** Name exactly what was right. For wrong answers, ask ONE Socratic hint question before revealing.
- **M12 — Metacognitive checkpoint** every 2–3 concepts: "1–5, how solid? what's fuzzy?"

**Close the session**
- **M10 — Teach-back / Feynman.** Arvin explains the topic as if to a CS-101 student. Expecting to teach improves encoding (Nestojko 2014); teaching exposes hidden gaps.
- **M13 — Cumulative review.** 3 rapid-fire questions across the WHOLE session (interleaving + retrieval + spacing in one).
- **Update the LEARNER PROFILE** in `teacher_skill.md` PART 2. Terse and specific.

> **Embed, don't announce.** Never say "now I'm applying retrieval practice." Just ask the question. Naming the method breaks the flow and signals the test, which lowers the productive struggle.

---

## Part 2 — Bloom's Taxonomy: pitching every question to the right cognitive level

The user's explicit requirement is that quizzes reach **up to Bloom's Level 5**. This section is the standard the agent grades itself against when writing questions. We use the revised Bloom's taxonomy (Anderson & Krathwohl, 2001). Level 6 (Create) is included as an optional stretch but L5 is the required ceiling for every lesson.

| Level | Verb | What it demands | Example for the C++ domain model lesson |
|-------|------|-----------------|------------------------------------------|
| **L1 — Remember** | recall, identify | Reproduce a fact | "What does `rir = -1` mean in the `Set` class?" |
| **L2 — Understand** | explain, summarize | Restate in own words, explain meaning | "In your own words, why is `volume` computed on read instead of stored?" |
| **L3 — Apply** | use, compute, implement | Use a learned procedure on a new instance | "Given a 100 kg × 5-rep set, compute the Epley E1RM the way `estimatedOneRepMax()` does." |
| **L4 — Analyze** | compare, differentiate, deconstruct | Break apart, find relationships, spot the hidden assumption | "The lift constructor clamps reps to 0–65535 but cardio `durationSec` is not clamped. Why the asymmetry? What does that tell you about each field's threat model?" |
| **L5 — Evaluate** | critique, justify, defend, judge | Make and defend a judgment against criteria; weigh trade-offs | "Marcus (competitive powerlifter) wants per-set graphing on by default. The code defaults `perSet=false`. Defend or refute that default, citing a specific failure mode and who it protects." |
| **L6 — Create** (stretch) | design, propose, construct | Produce something new that satisfies constraints | "Propose a schema + API change to add 'tempo' (eccentric seconds) to a Set without breaking the existing QML bindings. Justify each choice." |

**Rules for question authoring (the agent must follow these):**

1. **Every quiz has a spread, weighted toward the top.** Minimum mix per lesson: at least one L2, at least two of {L3, L4}, and **at least two L5 questions**. A quiz that is mostly L1 recall has failed the brief — recall is necessary scaffolding, not the goal.
2. **L5 questions must reference *this codebase's actual decisions and trade-offs*** — the RIR-vs-RPE switch, batch-vs-realtime percentiles, in-memory-vs-Supabase persistence, the `perSet` default, the clamp asymmetry. Generic "evaluate the pros and cons of X" questions are weak; the power comes from forcing judgment on a real decision Arvin's own product made.
3. **L4/L5 answers are graded on *reasoning*, not on matching a key.** There is often more than one defensible answer. The rubric grades whether the argument is structured, cites evidence, and acknowledges the counter-case.
4. **Scaffold up, don't drop in.** Order questions roughly L1→L5 so each one warms up the schema the next one needs.

---

## Part 3 — Why an *interactive application* per lesson (and how to build it well)

Reading is passive; an interactive app forces the production that Part 0 demands. But interactivity done badly (flashy, distracting, click-for-the-sake-of-it) *hurts* learning. The design rules below come from Mayer's multimedia learning principles and cognitive load theory.

**The app is the teaching surface. It must do these jobs, in this order:**

1. **Segmenting** — break the lesson into small, learner-paced chunks (one concept per "card" / section), with the learner clicking to advance. Never one long scroll of everything. (Mayer's segmenting principle.)
2. **Active manipulation** — at least one widget where Arvin changes an input and sees the model respond. For the domain-model lesson: a live E1RM calculator where he drags weight/reps and watches the Epley curve; a "log a set" simulator that shows the in-memory `QHash` filling up. Manipulation makes the abstract concrete (M7) and is itself a generation act (M4).
3. **Worked example → faded → blank** (M9) rendered as interactive steps: show the computation, then a step with a blank for him to fill, then a blank problem.
4. **Embedded retrieval** between sections (M3) — a quick free-text or multiple-choice check before the app lets him advance. The app should *not* reveal the answer until he commits one.
5. **Dual coding** (M8) — every structural idea gets an inline SVG/diagram, not just prose.
6. **The graded quiz** at the end — the Bloom's L1–L5 set, AI-graded (Part 4).

**Cognitive-load guardrails (Mayer/Sweller):**
- *Coherence:* no decorative animation, no unrelated images, no sound. Every element must teach.
- *Signaling:* highlight the one thing that matters in each step (color, weight) so attention isn't split.
- *Spatial/temporal contiguity:* put the diagram next to the words that explain it, and the feedback right where the answer was given — never on a separate screen.
- *Segmenting + self-pacing:* learner controls the "next" button. No autoplay.

**Token-efficiency mandate (per Arvin's instruction — functionality is paramount, but build it cheaply):** the interactive apps are generated from `lesson_app_template.html`. The agent does **not** rewrite the HTML/CSS/JS engine each lesson. It only fills three JSON-shaped content blocks (`LESSON_META`, `SECTIONS`, `QUIZ`) and, when a custom interactive widget is needed, drops a single small `<script>` into the one designated hook. Everything else — styling, navigation, the grading engine, the clipboard fallback — is inherited unchanged. This keeps per-lesson generation cheap while preserving full functionality.

---

## Part 4 — The in-page "Grade with Claude" engine (how AI grading works)

Every lesson app ends with the Bloom's quiz and a **Grade with Claude** button. The grading must be real (the user chose in-page AI grading), work offline-tolerantly, and cost as little as possible to generate. The engine is built **once** into `lesson_app_template.html`; lessons never reimplement it. Here is the contract so the agent understands what it's filling in and why.

**How a quiz item is specified.** Each item in the `QUIZ` array carries everything the grader needs:

```js
{
  id: "q5",
  bloom: 5,                       // 1–5 (6 optional)
  prompt: "Defend or refute ...", // the question shown to the learner
  type: "free",                   // "free" | "mc"
  // For grading — NOT shown to the learner until after they submit:
  rubric: [
    "States a clear position (defend OR refute).",
    "Cites the specific perSet=false default and the 'second set to failure' graph artifact.",
    "Names who the default protects (casual users / the progress narrative).",
    "Acknowledges the counter-case (Marcus's power-user need) — full marks require engaging it."
  ],
  model_answer: "A strong answer argues ...",  // reference, not the only correct answer
  points: 10
}
```

**The grading flow (built into the template, do not rebuild):**

1. Learner answers all items and clicks **Grade with Claude**.
2. The engine assembles a single structured grading prompt: it bundles each question, the learner's answer, the rubric, the model answer, and the point value, and instructs Claude to grade against the rubric, award partial credit, give specific feedback, and — crucially — to *not* just check for keyword matches on L4/L5 items but to evaluate the quality of reasoning.
3. **Channel selection (automatic, in this priority):**
   - **(a) Cowork bridge** — if `window.cowork?.askClaude` exists (the page is running as / behind a Cowork artifact), call it directly and render the returned grade inline. Fully automatic.
   - **(b) Clipboard paste-back fallback** — if no bridge is present (the file was just double-clicked open in a browser), the engine copies the assembled grading prompt to the clipboard and shows a one-line instruction: *"Grading prompt copied — paste it into your Claude chat and I'll grade it and update your learner profile."* This preserves full functionality with zero dependencies and zero API keys in the file.
   - **(c) Manual reveal** — a "show rubric & model answers" button so the learner can self-assess if completely offline. This is the floor, not the intent.
4. When grading returns (via a or b), the agent **updates the LEARNER PROFILE** in `teacher_skill.md`: which Bloom levels were strong/weak, which misconceptions surfaced, confidence vs. accuracy calibration.

> **Why this design:** it satisfies "in-page Grade with Claude" *and* "least token cost / functionality paramount." The engine is written once. A plain HTML file with a clipboard fallback needs no server, no key, and no per-lesson logic — yet still routes to real Claude grading every time.

---

## Part 5 — The per-lesson build protocol (the agent's checklist)

When Arvin says "teach me the next topic" (or names one), the agent runs this exact sequence:

1. **Load context.** Read this file, then `teacher_skill.md` (methods + LEARNER PROFILE), then the relevant rung in `01_ROADMAP.md`. Read the *actual source files* the rung points to — never teach from memory of the code; the code changes. Verify the file paths still exist (memories and roadmaps go stale).
2. **Run M1 + M14 live in chat** via AskUserQuestion (pre-survey + prior-lesson retrieval). Calibrate scope to the answers.
3. **Draft the lesson content** by filling `LESSON_TEMPLATE.md` for this rung: objectives (as Bloom-tagged outcomes), prerequisite check, the concept sequence with worked examples drawn from real code, the embedded retrieval checks, the teach-back prompt, and the quiz spec (with the Bloom spread from Part 2 and rubrics from Part 4).
4. **Generate the interactive app** by copying `lesson_app_template.html` and filling only `LESSON_META`, `SECTIONS`, `QUIZ`, and (if needed) the one custom-widget hook. Do not touch the engine.
5. **Save** both to `lessons/Lxx_<slug>.md` and `lessons/Lxx_<slug>.html`, and confirm the roadmap's link to that lesson resolves.
6. **Teach interactively in chat** alongside the app, applying M2–M12.
7. **Close** with M10 + M13, grade the quiz, and **update the LEARNER PROFILE**.
8. **Offer spacing:** suggest scheduling the next lesson a few days out (the spacing effect needs calendar distance, M5/M14), and queue 2 retrieval questions to open it with.

---

## Part 6 — Honoring the LEARNER PROFILE (Arvin specifically)

From `teacher_skill.md` PART 2 (verify it is current at session start — it updates every lesson):

- **Background:** computer-engineering student; solo founder of Peak Fettle.
- **Concept first, then code.** Plain-English idea + analogy *before* the real code. Never lead with a code dump.
- **Deep over wide**, especially early. Start at the bottom of the ladder and go thoroughly. Resist fast surveys.
- **Prior knowledge (as of last review):** comfortable with basic SQL (SELECT/INSERT/UPDATE, PKs, one-to-many); **joins/indexes/normalization are fuzzy — teach explicitly.** REST/auth/JWT/env/deploy are **mostly new — teach from first principles.** C++, Qt/QML, full-stack data flow, and LLM integration were **not yet assessed** — surface them in the relevant lesson's M1 survey rather than assuming.

> ⚠️ **Profile-vs-reality flag (found 2026-05-19):** the profile describes the frontend as "C++/Qt." That is true of the `src/` + `qml/` desktop code, but the *most actively developed* frontend is now the **React Native / Expo app in `mobile/`** (most commits since May). The roadmap covers both as parallel tracks. When you reach a frontend rung, run M1 to find out which one Arvin actually wants to go deep on, and update the profile accordingly.

---

## Sources

Pedagogy sources are listed in full in `teacher_skill.md`. The additions specific to this document:

- Anderson, L. W., & Krathwohl, D. R. (2001). *A Taxonomy for Learning, Teaching, and Assessing: A Revision of Bloom's Taxonomy of Educational Objectives.*
- Mayer, R. E. (2009). *Multimedia Learning* (2nd ed.) — coherence, signaling, segmenting, contiguity, self-pacing principles.
- Sweller, J., Ayres, P., & Kalyuga, S. (2011). *Cognitive Load Theory.*
- Roediger, H. L., & Karpicke, J. D. (2006); Bjork, R. A. (1994); Bertsch et al. (2007); Nestojko et al. (2014); Dunlosky et al. (2013) — see `teacher_skill.md`.
