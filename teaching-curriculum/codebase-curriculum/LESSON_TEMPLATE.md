---
name: lesson-template
description: Fill-in-the-blanks markdown lesson skeleton for the Peak Fettle codebase curriculum. The teaching agent copies this to lessons/Lxx_<slug>.md and replaces every {{PLACEHOLDER}}. Pairs with lesson_app_template.html. Read 00_TEACHING_METHODOLOGY.md before filling this in.
type: skill
owner: Arvin
---

# 📋 HOW TO USE THIS TEMPLATE (delete this whole block in the filled lesson)

1. Read [`00_TEACHING_METHODOLOGY.md`](00_TEACHING_METHODOLOGY.md) and `teacher_skill.md` (methods + LEARNER PROFILE) first.
2. Copy this file to `lessons/Lxx_<slug>.md` and `lesson_app_template.html` to `lessons/Lxx_<slug>.html`.
3. Replace every `{{PLACEHOLDER}}`. Delete guidance blocks marked `>📝`.
4. The `.md` is the **agent's teaching script + the source of truth for content**. The `.html` is the **interactive surface the learner uses** — its `SECTIONS`/`QUIZ` arrays are filled from the same content you write here, so write the content here first, then port it.
5. Honor the Bloom spread (methodology Part 2): ≥1 L2, ≥2 of {L3,L4}, **≥2 L5**. Every L5 must hinge on a real Peak Fettle decision.
6. Ground every example in **real source files** — read them fresh, cite file + symbol. Never invent code.

---

# Lesson {{L##}} — {{Lesson Title}}

> **Track:** {{Track # — name}} · **Status on roadmap:** {{rung status}}
> **Interactive app:** [`lessons/L##_<slug>.html`](L##_<slug>.html)
> **Estimated time:** {{25–45 min}} · **Prerequisite rungs:** {{e.g. L01, L02}}

## 0. Source of truth (agent: read these before teaching — they drift)
{{List the exact files + symbols this lesson is built from, e.g. `src/set.h` (class `Set`, `volume()`), `src/WorkoutTracker.cpp` (`progressSeries`). Verify each path still exists.}}

## 1. Learning outcomes (Bloom-tagged)
By the end, Arvin can:
- **(L2)** {{explain ...}}
- **(L3)** {{apply/compute ...}}
- **(L4)** {{analyze/compare ...}}
- **(L5)** {{evaluate/defend ...}}
>📝 Outcomes must mirror the quiz. If an outcome isn't tested, cut it or test it.

## 2. Pre-lesson survey (M1) — ask LIVE via AskUserQuestion, don't put answers here
>📝 2–4 calibration questions, each with an "I'm not sure" option. Example prompts:
- {{"Rate your confidence with X: none / heard of it / can use it / can teach it"}}
- {{"Which of these have you used before: ___?"}}
- {{"Goal today — breadth survey or one concept deep?"}}

## 3. Spacing carry-over (M14) — ask LIVE before new material
>📝 1–2 retrieval questions from the previous lesson. List them so the agent has them ready:
- {{prev-lesson Q1}}
- {{prev-lesson Q2}}

## 4. The difficulty ladder for THIS lesson (M2) — state up front
1. {{rung}}
2. {{rung}}
3. {{rung}}
>📝 Easiest → hardest. Each rests on the one before.

## 5. Concept sequence
>📝 Repeat this block per concept. Apply M4→M7→M8→M9→M3→M6→M11. Concept-first, then code (Arvin's stated preference).

### Concept {{n}}: {{name}}
- **(M4) Generate first:** pose the problem before teaching → *"{{given X, how would you design Y?}}"*
- **(M7) Concrete hook:** {{a picture-able first example}}
- **The idea (plain English + analogy):** {{explanation. Use an analogy; log good ones into the LEARNER PROFILE.}}
- **(M8) Diagram:** {{ASCII/inline-SVG of the structure — this becomes a diagram in the app}}
- **Now the real code:** {{the actual snippet from the source files, with file + line context}}
- **(M9) Worked → faded → blank:** {{the fully worked example; then the half-blank version; then the blank one}}
- **(M3) Retrieval check:** *"{{one open question — wait for the answer, don't pre-reveal}}"*
- **(M6) Elaboration:** *"...and why is it built that way?"*
- **(M12) Checkpoint (every 2–3 concepts):** *"1–5, how solid? what's fuzzy?"*

## 6. Teach-back (M10)
>📝 Prompt: *"Explain {{this lesson's core idea}} to a CS-101 student in ~5 sentences, as if they've never seen this codebase."*

## 7. Cumulative review (M13) — 3 rapid-fire, span the whole lesson
1. {{Q across concept 1}}
2. {{Q across concept 2}}
3. {{Q across concept 3 / synthesis}}

## 8. The graded quiz (Bloom L1–L5, AI-graded in the app)
>📝 This is the spec that becomes the `QUIZ` array in the HTML. Each item needs: id, bloom, type ("free"|"mc"), prompt, rubric[], model_answer, points. Honor the spread.

| # | Bloom | Type | Prompt | Rubric (grading criteria) | Model answer (reference) | Pts |
|---|-------|------|--------|---------------------------|--------------------------|-----|
| q1 | L2 | free | {{...}} | {{criteria}} | {{...}} | 10 |
| q2 | L3 | free | {{compute ...}} | {{must show the procedure}} | {{...}} | 10 |
| q3 | L4 | free | {{compare/analyze ...}} | {{must surface the hidden trade-off}} | {{...}} | 15 |
| q4 | L5 | free | {{defend/critique a real PF decision}} | {{position + evidence + counter-case}} | {{...}} | 20 |
| q5 | L5 | free | {{evaluate a real PF decision}} | {{position + evidence + counter-case}} | {{...}} | 20 |
| q6 | L6 (opt) | free | {{design/propose ...}} | {{satisfies stated constraints, justified}} | {{...}} | 15 |

>📝 L4/L5/L6 are graded on *reasoning quality*, not key-matching. Rubrics must say so.

## 9. Custom interactive widget (optional)
>📝 If this lesson needs a live manipulable widget (e.g., an E1RM calculator), describe it here and implement it in the ONE `<script id="custom-widget">` hook in the HTML. Keep it small. If none, write "none".
{{description or "none"}}

## 10. End-of-session updates (agent does these, doesn't write here)
- Grade the quiz via the app's "Grade with Claude" (methodology Part 4).
- Update `teacher_skill.md` PART 2 LEARNER PROFILE: Bloom levels strong/weak, misconceptions surfaced, analogies that landed, confidence-vs-accuracy.
- Offer to schedule the next rung a few days out (spacing) and queue its 2 carry-over questions.
