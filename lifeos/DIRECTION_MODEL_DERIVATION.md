# Direction Model v1 — Derivation & Evidence Register

*TICKET-106. Companion to `src/engine/directionModel.v1.ts` (MODEL_VERSION
`direction-v1.0.0`). Every encoded rule cites its sources below with an
evidence grade. Rules below grade C do not ship (spec §TICKET-106).*

*Method note: this register was compiled from the established behavioral-science
literature (meta-analyses and canonical studies as of the Jan-2026 knowledge
cutoff). Citations are to primary sources; grades reflect the strength of the
evidence **for the encoded behavioral rule**, not for any clinical claim — this
product makes none (CONTENT_SAFETY.md §1). Founder/expert review of this
register is part of the TICKET-113 gate.*

**Grades:** A = meta-analysis/systematic review; B = strong RCT(s) or large
replicated studies; C = expert consensus / observational. Below C = excluded.

---

## Evidence register

| # | Finding encoded | Key sources | Grade |
|---|----------------|-------------|-------|
| R1 | **Implementation intentions** ("when situation X arises, I will do Y") roughly double goal attainment vs intention alone (meta-analytic d ≈ .65). Encoded as: every habit/stack carries a concrete time or event anchor; the engine never proposes an unanchored habit. | Gollwitzer (1999), *Am Psychol*; Gollwitzer & Sheeran (2006) meta-analysis, *Adv Exp Soc Psychol* | **A** |
| R2 | **Specific, realistic goals beat vague or overloaded ones.** Goal-setting theory: specific+challenging > "do your best"; overload kills follow-through. Encoded as: milestone ladders are concrete and countable; the time-budget constraint solver refuses to plan more than the user's stated hours; when budget < floor × domains, the engine plans fewer domains rather than thinner everything. | Locke & Latham (2002), *Am Psychol* (35-yr program); Sheeran & Webb (2016) intention–behavior gap review | **A** |
| R3 | **Habits form through repetition in a stable context; small actions sustain.** Median ~66 days to automaticity; missing a single day does not derail formation (basis for forgiving streaks). Encoded as: stacks anchor to stable cues; 'reduce' adjustment shrinks the action, never the cue; one-miss forgiveness in the streak engine. | Lally et al. (2010), *Eur J Soc Psychol*; Gardner et al. (2012) habit formation review | **B** |
| R4 | **Habit stacking / cue piggy-backing**: attaching a new behavior to an existing routine improves adherence (a practical application of R1/R3). Encoded as: the stack model itself (ordered habits on one anchor) and event anchors (after workout). | Derived from R1+R3 primary literature; popularized in Fogg (2019) *Tiny Habits*, Clear (2018) — encoded from the primary mechanisms, not the trade books | **B** |
| R5 | **Attention residue & context switching degrade performance; protected blocks help.** Encoded as: Deep Work Block stack (phone away, single written target, no inbox), weekday focus-session blocker during peak-attention hours by chronotype. | Leroy (2009), *Org Behav Hum Decis Process*; Mark et al. (2008) interruption studies; Newport (2016) synthesis (C-level for specifics) | **B** |
| R6 | **Spacing effect**: distributed practice beats massed practice across domains. Encoded as: daily short practice blocks rather than long rare sessions; milestone "practice {n} days in two weeks" pacing. | Cepeda et al. (2006) meta-analysis, *Psychol Bull* | **A** |
| R7 | **Retrieval practice**: self-testing beats re-reading for retention. Encoded as: "Self-test: recall 3 things" step closing the practice block. | Roediger & Karpicke (2006), *Psychol Sci*; Adesope et al. (2017) meta-analysis | **A** |
| R8 | **Structured, effortful practice on the hardest sub-skill drives expertise** (deliberate-practice framework; effect sizes debated but direction robust). Encoded as: "Practice the hard part first" step; milestone "define the first sub-skill to drill". | Ericsson et al. (1993), *Psychol Rev*; Macnamara et al. (2014) moderating meta-analysis (kept the rule modest) | **B** |
| R9 | **Sleep regularity & wind-down behaviors improve sleep quality** (consistent wake time, pre-sleep routine, screens out of bed). Encoded as: Wind-Down stack, "phone outside bedroom", consistent-wake-time milestone. Behavioral hygiene only — no clinical insomnia claims. | Irish et al. (2015) sleep-hygiene review, *Sleep Med Rev*; Harvey (2002) behavioral models | **B** |
| R10 | **Active-constructive responding** to others' good news strengthens relationships. Encoded as: "Respond to good news with real interest" step. | Gable et al. (2004), *J Pers Soc Psychol* | **B** |
| R11 | **Frequent small connection bids out-predict grand gestures** for relationship quality. Encoded as: daily tiny reach-out ritual, phones-down meal. | Gottman observational program (1999+) — observational; Epley & Schroeder (2014) social-connection RCTs | **C** (kept: behavioral, low-risk) |
| R12 | **Automation beats willpower for saving behavior** (Save More Tomorrow raised saving rates ~4× among participants). Encoded as: "set up/verify one automation" milestone, weekly check-in habit. **No instrument, product, or allocation advice — banned class (CONTENT_SAFETY.md §4.1).** | Thaler & Benartzi (2004), *J Polit Econ*; Madrian & Shea (2001) default effects | **A** |
| R13 | **Behavioral activation** — scheduling valued activities measurably improves mood/wellbeing; among the best-supported behavioral techniques. Encoded as: "one small valued activity" daily step. Framed as a wellbeing skill, never treatment. | Cuijpers et al. (2007) meta-analysis, *Clin Psychol Rev*; Ekers et al. (2014) meta-analysis, *PLoS ONE* | **A** |
| R14 | **Gratitude practice** shows consistent small-to-moderate wellbeing effects. Encoded as: one-line gratitude step with evidence framing ("what made it possible / your part in it"). | Emmons & McCullough (2003), *J Pers Soc Psychol*; Wood et al. (2010) review; Davis et al. (2016) meta-analysis (tempers effect size) | **B** |
| R15 | **Reducing cue exposure beats resisting in-the-moment**: friction/limits on habitual app triggers reduce use; people who rely on environmental restructuring out-self-control "willpower" users. Encoded as: daily-limit blocker suggestion for self-reported pain apps; escalating unlock friction (TICKET-104). | Duckworth et al. (2016) situational self-control, *Perspect Psychol Sci*; Hofmann et al. (2012) everyday temptation studies | **B** |
| R16 | **Mental contrasting + planning (WOOP)** improves goal pursuit vs positive fantasy alone. Encoded as: survey captures per-domain "what's in the way" (obstacle), surfaced beside the plan at weekly review. | Oettingen (2014) program of RCTs, *Eur Rev Soc Psychol* | **B** |

## Rules considered and EXCLUDED

| Candidate | Why excluded |
|-----------|--------------|
| "21 days to form a habit" | Folklore; contradicted by R3 (median 66 days, wide range). |
| Money stakes / loss-framing commitment devices | Evidence exists (Halpern et al. 2015) but conflicts with CONTENT_SAFETY.md §3 (no punishment mechanics) — founder-banned (Q19). |
| Specific diet/macro/supplement protocols | Banned class §4.2; training/nutrition direction belongs to the fitness product. |
| Personality-typed plan branching (MBTI etc.) | Below grade C for prescriptive use. |
| Dopamine "detox" framing | Pop-science framing without direct evidence; the blocker feature stands on R15 without the neuro-claims. |

## How the engine maps evidence → output (rule trace)

| Engine behavior | Rules |
|-----------------|-------|
| Every habit/stack has a time/event anchor | R1, R4 |
| Time-budget solver; drop domains rather than over-prescribe | R2 |
| 30-min weekly floor; 'reduce' shrinks action not cue | R3 |
| Deep Work Block + weekday focus sessions at chronotype peak | R5 |
| Daily short practice + self-test + hard-part-first | R6, R7, R8 |
| Wind-down stack + wake-time milestone | R9 |
| Connection ritual steps | R10, R11 |
| Automation milestone + weekly money check-in (no advice) | R12 |
| Daily valued activity + gratitude steps | R13, R14 |
| Pain-app daily limit + escalating unlock friction | R15 |
| Survey "what's in the way" shown at review | R16 |
| Forgiving streaks (one-miss redemption) | R3 |

## Versioning

- `direction-v1.0.0` — initial encoding (2026-06-11). Any rule change bumps the
  minor version; any output-shape change bumps the major and requires new
  golden files (`__tests__/direction-model.test.js`).

## Review

- [ ] Founder skim + sign-off of this register (TICKET-106 DoD)
- [ ] Protocol template copy review (CONTENT_SAFETY.md §7)
