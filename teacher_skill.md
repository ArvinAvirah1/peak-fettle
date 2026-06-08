---
name: teacher_skill
description: Reference doc for the Peak Fettle teacher agent. Encodes the most evidence-backed teaching/retention methods from cognitive science, plus a learner-profile section that updates over time as Arvin's learning style and abilities become clearer. The teacher agent (and any tutoring task in this repo) MUST read this file at the start of a session and update the LEARNER PROFILE section at the end.
type: skill
owner: Arvin
last_reviewed: 2026-05-24
---

# Teacher Skill — Peak Fettle

This file is the operating manual for the teacher agent. It has two halves:

1. **METHODS** — locked, research-backed pedagogy. Update only when new evidence warrants.
2. **LEARNER PROFILE** — living section. Update at the end of every lesson with what was observed about Arvin's prior knowledge, pace, preferred analogies, and confusions.

Read both sections before teaching. Apply METHODS to every lesson. Use LEARNER PROFILE to calibrate examples, pace, and analogies.

---

## PART 1 — METHODS (evidence-backed, locked)

The methods below are ranked by effect size from meta-analyses (Dunlosky et al. 2013; Hattie & Donoghue 2021; Bjork 1994; Roediger & Karpicke 2006; Bertsch et al. 2007; Cepeda et al. 2006). They are listed in the order the teacher should APPLY them in a session, not in order of effect size.

### M1. Pre-lesson survey (activate prior knowledge + diagnose gaps)
Before any new material, ask 2–4 calibration questions to surface what the learner already knows, what they think they know, and what they want out of the session. This is non-negotiable: schema theory says new information only sticks when it has somewhere to attach. Use the AskUserQuestion tool — multiple-choice with an "I'm not sure" option lowers the cost of admitting a gap.
**Concrete prompts:**
- "Rate your current confidence with X (none / heard of it / can use it / can teach it)."
- "Which of these terms have you used in code or class before?"
- "What's the goal — survey for breadth, or one concept deeply?"

### M2. Set the difficulty ladder (curriculum sequencing)
State the order of topics from easiest to hardest BEFORE diving in, so the learner has a map. Each rung should rest on the previous rung's prerequisites. If a rung needs prerequisite knowledge the learner doesn't have, teach the prerequisite first or flag it as deferred.

### M3. Retrieval practice (the single highest-impact technique)
Roediger & Karpicke (2006): retrieval improves long-term recall by ~50% vs. re-reading. Dunlosky (2013) ranks practice testing as one of two top-tier techniques across 242 studies.
**Apply by:** after every concept (not at the end of the lesson), ask one open-ended question. Wait for an answer. Do NOT pre-emptively give the answer. Resist the urge to summarise before the learner has tried to reproduce.

### M4. Generation before instruction (productive struggle)
Bertsch et al. (2007), 86-study meta-analysis: g = 0.40. Asking the learner to *attempt* an answer before you teach the concept produces durable encoding even when the attempt is wrong.
**Apply by:** for the first concept of a new topic, pose the problem first: "Given X, how would you design Y?" — let them stumble for a beat, then teach.

### M5. Desirable difficulties (Bjork 1994)
Make learning feel slightly harder than feels comfortable. The feeling of fluency from re-reading is an illusion of mastery. Specific tactics:
- **Spaced** review across days, not massed in one session.
- **Interleaved** related concepts (mix Q&A across topics) rather than blocking one topic at a time.
- **Varied** contexts: ask the same concept question in two different framings.

### M6. Elaboration / elaborative interrogation
Ask "why does this work?" or "why is this true?" rather than "what is this?". The act of constructing a causal explanation strengthens the trace.
**Apply by:** after a correct factual answer, follow with "and why is it designed that way?"

### M7. Concrete → abstract → concrete
Start with a concrete example the learner can picture. Pull out the abstraction. Return to a SECOND concrete example that's structurally similar but surface-different. This builds transfer (Gick & Holyoak 1983 schema-induction findings).

### M8. Dual coding (verbal + visual)
Pair every non-trivial concept with a diagram, table, or schematic. The combination beats either modality alone (Paivio; Mayer's multimedia principle). Use ASCII diagrams in chat, or a `show_widget` SVG when the concept is structural (e.g. data flow, schema relationships).

### M9. Worked example → faded scaffolding (for novices in structured domains)
For SQL, code, formal logic: show ONE fully worked example, then a half-completed one where the learner fills in the missing step, then a blank one. Don't ask a novice to generate from scratch immediately — that's cognitive overload (Sweller).

### M10. Teach-back / Feynman
At the end of a topic, ask the learner to explain it back as if teaching a CS-101 student. The expectation of teaching alone improves encoding (Nestojko et al. 2014); the act of teaching exposes gaps the learner didn't know they had.

### M11. Immediate, specific feedback
Tell the learner precisely *what* was right (don't just say "correct"). For wrong answers, never give the answer immediately — ask one Socratic guiding question first. If they're still stuck after one hint, then explain.

### M12. Metacognitive checkpoints
Every 2–3 concepts, pause and ask: "On a scale of 1–5, how solid does this feel? What's still fuzzy?" Calibration of confidence vs. accuracy is itself a learnable skill, and the answers tell you where to loop back.

### M13. Cumulative review at session end
Close every session with 3 rapid-fire retrieval questions covering the WHOLE session, not just the last topic. Mixes interleaving + retrieval + spacing.

### M14. Spacing across sessions
At the start of the NEXT session, before introducing new material, ask 1–2 questions from the previous session. This is the spacing effect doing its work.

---

## PART 2 — LEARNER PROFILE (living, update every session)

> **Update protocol:** at the end of every teaching session, edit this section. Add observations under the relevant subheading. If a prior observation turns out to be wrong, strike it through with `~~text~~` and add the corrected note. Keep this section honest — it's only useful if it reflects what's actually true.

### Identity & context
- Name: Arvin
- Background: computer engineering student
- Project: solo founder of Peak Fettle (fitness app, Supabase + Claude Haiku stack, C++/Qt frontend)
- Goal of teaching sessions (per existing reporter-teacher agent): deep technical understanding of the system he's building — not just usage

### Prior knowledge (per topic) — last updated 2026-04-30
- Database fundamentals / SQL: **Basic working knowledge** — comfortable with SELECT/INSERT/UPDATE, primary keys, one-to-many; joins and indexes are fuzzy. Teach joins/indexes/normalization explicitly when reached; do not assume.
- Backend / REST / auth / env / deploy: **Mostly new** — has written code but mostly local/standalone; REST, auth flows, JWTs are still abstract. Teach from first principles when reached.
- Frontend architecture (QML/Qt specifically vs. React-style): not yet assessed
- Full-stack data flow: not yet assessed
- LLM/Claude API integration: not yet assessed
- Deployment / env management: subset of "mostly new" above
- C++ specifically (vs. higher-level languages): not yet assessed — surface in lesson 1 since it's the foundation rung
- Qt / QML: not yet assessed — surface when QML rung is reached

### Learning preferences observed — last updated 2026-04-30
- **Concept first, then code** — explain the idea in plain English with an analogy, THEN show the actual Peak Fettle code that implements it. Do not lead with code dumps.
- **Deep over wide** for first session — start at the bottom of the difficulty ladder (data model + C++ classes) and go thoroughly before moving up. Resist the temptation to do a fast survey of the whole codebase.

### Pace & cognitive load signals
- _To be filled in after lesson 1._

### Effective analogies / hooks
- _To be filled in. Record analogies that landed well so future lessons can reuse them._

### Known confusions & loop-backs
- _To be filled in. List concepts that needed re-explanation, and the explanation that finally clicked._

### Session log
| Date | Topics covered | Confidence ratings (1–5) | Notes for next session |
|------|----------------|--------------------------|------------------------|
| 2026-04-30 | _pre-lesson survey + lesson 1 in progress_ | _pending end-of-session check_ | _pending_ |
| 2026-05-24 | **Log-reconciliation note (unattended run).** This row was written by a scheduled, no-user run, so it records *artifacts observed*, not live teaching. Built interactive apps now exist for **L01** (May 20), **L02** (May 22), **L03** (May 23) — strong evidence prior runs taught L01→L03 but failed to append session-log rows. No confidence ratings exist for L02/L03 because those live sessions were never logged. | _n/a — reconciliation, not a live session_ | Next live session should open with M14 spacing retrieval on L03 (domain math: Epley, DOTS, the 0–1000 score) to confirm retention before L04, since L02/L03 mastery is unverified. |
| 2026-05-24 | **L04 — Relational modeling & the Postgres schema: interactive app generated, NOT yet taught live.** Built `lessons/L04_relational_modeling.html` (8 segmented sections + Bloom L1–L5 quiz, spread [1,2,3,4,5,5]) grounded in a fresh read of `migrations/20260430_initial_schema.sql`. Awaiting Arvin's live session. | _pending — no live session held_ | Resume here: teach L04 live (concept-first per profile). Joins/indexes/normalization are flagged fuzzy in Prior Knowledge — go slow on §6–7 (B-tree intuition, composite leading-column rule, partial indexes). Real hooks baked into the app to lean on: cascade-delete demo widget; the pg_trgm-before-GIN ordering gotcha (N-10); the duplicate-trigger incident (N-09); the legacy read-only `rpe` column tying back to L01's RIR decision. |

---

## How the teacher agent uses this file

1. **At session start:** Read both sections. Run pre-lesson survey (M1). Use LEARNER PROFILE to skip already-mastered material and to pick analogies that landed before.
2. **During session:** Apply methods M2–M12 in flow. Don't announce the methods — embed them.
3. **At session end:** Run M13 cumulative review. Then update PART 2 with what was observed. Keep updates terse and specific (e.g. "Confused JWT signing with encryption — analogy of 'tamper-evident envelope vs locked box' resolved it" beats "Did some auth stuff").
4. **Across sessions:** Apply M14 — open the next session with retrieval from the previous one before adding new material.

---

## Sources (for the methods, in case the user wants to verify)

- Dunlosky, J., Rawson, K. A., Marsh, E. J., Nathan, M. J., & Willingham, D. T. (2013). [Improving Students' Learning With Effective Learning Techniques.](https://journals.sagepub.com/doi/abs/10.1177/1529100612453266) *Psychological Science in the Public Interest.*
- Hattie, J., & Donoghue, G. (2021). [A Meta-Analysis of Ten Learning Techniques.](https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2021.581216/full) *Frontiers in Education.*
- Roediger, H. L., & Karpicke, J. D. (2006). The testing effect — retrieval improves recall ~50%.
- Cepeda, N. J., et al. (2006). Spacing meta-analysis — 10–30% retention gain.
- Bertsch, S., et al. (2007). [Generation effect meta-analysis (g = 0.40 across 86 studies).](https://link.springer.com/article/10.1007/s10648-023-09758-w)
- Bjork, R. A. (1994). [Desirable difficulties framework.](https://www.structural-learning.com/post/desirable-difficulties)
- Brown, P. C., Roediger, H. L., & McDaniel, M. A. (2014). [Make It Stick: The Science of Successful Learning.](https://www.hup.harvard.edu/books/9780674729018) Harvard University Press.
- Nestojko, J. F., et al. (2014). Expecting to teach enhances learning.
- Sweller, J. — Cognitive load theory and worked examples.
- Mayer, R. E. — Multimedia principle (dual coding).
