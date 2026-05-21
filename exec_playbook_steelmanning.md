# Peak Fettle — Exec Decision-Making Playbook

**Owner:** Exec team (CEO, CTO, and any future hires)
**Status:** Living document — append new lessons as they are learned
**Established:** 2026-04-30
**Trigger:** Any non-trivial purchasing, vendor, architectural, or strategic decision

---

## Purpose

This playbook codifies how Peak Fettle's exec team makes decisions when several plausible options compete and the wrong choice is expensive to undo. It exists because, as a one-person operation moving toward a small team, every avoidable mistake is paid for in personal time and personal capital. The playbook is not a checklist to perform theatrically — it is a discipline that, when followed honestly, surfaces information the operator did not realize they were missing.

Append to it whenever a decision teaches something the future team would benefit from knowing.

---

## Core methodology: steel-manning before deciding

The central practice is to construct the **strongest possible case for every option on the table** before recommending any one of them. The version of an option that gets refuted in your head while reading a comparison blog post is almost never the strongest version of that option. Refuting a weak version produces false confidence.

A steel-man is complete when the following three conditions are met. First, you can state, without sarcasm or hedging, why a thoughtful expert would pick this option. Second, you have identified the specific situation in which this option is the obviously correct answer — even if Peak Fettle is not in that situation. Third, you can describe what would have to be true about Peak Fettle for this option to win on its own merits.

Only after every option has been steel-manned in this way do you compare. The act of steel-manning frequently reveals that your preferred option's apparent advantages are weaker than you thought, or that an option you dismissed has a defensible case you had not considered.

---

## The process template

Every significant decision should produce a written memo with the following sections, in order. The order matters — writing the recommendation first and then back-filling the steel-mans corrupts the analysis.

The memo opens with **context and constraints**: the problem being solved, the constraints that bound the answer, and any assumption that, if changed, would force a re-decision. Naming load-bearing assumptions explicitly is critical, because the most common cause of a wrong decision is an unexamined assumption.

Then the memo lists **candidate options**, including at least one option the author initially considered weak. Excluding weak options at the framing stage hides them from scrutiny.

The memo then **steel-mans each option** in its own subsection, in the most charitable terms the author can construct. This section does not compare options to each other — that comes later. Each option gets its own fair hearing.

After steel-manning, the memo lists **honest weaknesses** for each option. Steel-manning without then naming the costs is salesmanship, not analysis. The weaknesses section is where the comparison begins to crystallize.

The memo then runs a **cost projection across realistic scale tiers** — not just the current state. Many decisions look identical at the MVP stage and diverge sharply at scale. Knowing where the divergence occurs tells you when to revisit the decision.

The memo presents a **decision matrix** with explicit weights, then a **recommendation** with explicit rationale. The rationale must reference the steel-mans and the weaknesses — it should be defensible to a reader who disagrees with the recommendation.

The memo closes with **open risks and revisit triggers**: specific conditions under which the decision should be re-opened. A decision without revisit triggers calcifies into a non-decision.

---

## Lessons learned

### Lesson 1 — Re-examine the load-bearing assumption before recommending

The original database memo recommended Supabase primarily because Postgres window functions made percentile rankings cheap and continuous. When the assumption was challenged — does percentile actually need to be real-time? — the answer was no, fitness data moves on a weekly timescale and a batch-computed CDF works fine. The recommendation survived, but for entirely different reasons (cost predictability, no lock-in, bundled features). The original rationale was load-bearing on an unexamined assumption.

The lesson: before a recommendation goes final, name the single assumption that, if false, would flip the answer. Then ask whether that assumption is actually true. If you cannot name such an assumption, you have not analyzed the decision deeply enough.

### Lesson 2 — Steel-manning surfaces options you would otherwise dismiss

The first pass of the database memo evaluated three options seriously. Steel-manning forced us to evaluate six, including options the author was ready to dismiss out of hand (self-hosted Postgres, Appwrite). Two of those rejected-on-instinct options turned out to have genuinely defensible cases — not winning cases, but cases worth understanding. The act of articulating why a "weak" option might still win clarifies why the chosen option actually wins.

The lesson: a decision memo with fewer than four candidates is suspicious. If the author claims only three options exist, they are probably filtering before analyzing.

### Lesson 3 — Distinguish near-term from long-term in every comparison

At MVP scale, almost every database, every LLM, and every marketing channel costs roughly the same — somewhere between zero and a hundred dollars a month. The differences emerge at scale. A decision optimized purely for MVP economics will pick the wrong option for the company that succeeds. A decision optimized for hypothetical scale will pick the wrong option for the company that has not yet found product-market fit.

The lesson: every comparison should be evaluated at three time horizons — pre-launch (0–500 users), early traction (500–5,000 users), and growth (5,000–50,000 users). The right answer often differs across horizons, which means the right strategy is sometimes "start with X, migrate to Y at trigger Z."

### Lesson 4 — Lock-in and exit optionality are real costs, even when invisible on the invoice

Cheaper options frequently come with hidden switching costs that compound over the life of the product. Firebase's per-operation pricing looks attractive at MVP scale, but the data model is proprietary; migrating off it later is a re-platforming event. Supabase's Postgres core is more expensive in raw monthly cost, but `pg_dump` is the entire exit plan. The optionality has independent value, especially for a small product whose primary defensibility against funded competitors is the ability to pivot quickly.

The lesson: when comparing vendors, explicitly price the cost of leaving. If the answer is "we cannot leave," that is a cost — quantify it as risk-adjusted future revenue at risk, not zero.

### Lesson 5 — A decision matrix is an aid, not an oracle

Decision matrices with weighted scores feel objective but are not. The weights are values judgments, the scores are guesses calibrated to defend a conclusion the author already reached, and a small change to either flips the answer. Use the matrix to make tradeoffs visible, not to manufacture certainty. If the top two options are within 10% of each other on a 100-point matrix, the matrix is telling you the decision is genuinely close — not that the higher-scoring option is correct.

The lesson: when two options score within 10% of each other, the decision should turn on a deliberate values judgment ("we care more about predictability than time-to-market") rather than on the matrix arithmetic.

### Lesson 6 — Beware feature lists masquerading as differentiators

Vendor comparison pages list features. Most of those features are irrelevant to the actual product. A feature is a differentiator only if Peak Fettle will use it, and use it in a way the alternative cannot replicate cheaply. Firebase has Crashlytics; Supabase does not. This is only a differentiator if the time-cost of integrating Sentry exceeds the time-cost of working around Firestore's other limitations. Often the answer is no.

The lesson: when a vendor lists a feature that sounds like an advantage, ask "would I pay for this feature standalone?" If no, it is not a real advantage — it is a bundle the vendor is using to anchor higher pricing.

---

## Anti-patterns to avoid

The most common failure mode is **post-hoc rationalization**: writing the recommendation first and back-filling the steel-mans to support it. The discipline only works if the steel-manning is honest, and the honest test is whether the analysis ever changes the author's initial instinct. If your conclusions never move, you are performing the methodology rather than using it.

The second failure mode is **analysis paralysis**: steel-manning so many options that the decision never gets made. Time has cost. For a one-person operation, a 90%-correct decision made in a week is almost always better than a 95%-correct decision made in a month. Cap the analysis at a defined effort budget.

The third failure mode is **treating the matrix as the answer**. The matrix surfaces tradeoffs; the values judgment is yours. Do not hide behind arithmetic to avoid taking a position.

The fourth failure mode is **never revisiting decisions**. A revisit trigger that is never checked is no different from a calcified decision. Schedule the trigger checks; do not just write them down.

---

## Future learnings

This section is the living portion of the playbook. As the team makes decisions, append the lessons that generalize beyond the specific decision. A good entry includes the situation, the lesson, and the principle the team will apply going forward.

### Template for new entries

```
### Lesson N — [one-line title]

[Two or three sentences of context: what decision, what was at stake, what surprised us.]

The lesson: [one sentence stating the principle, in a form that is portable to future decisions.]
```

### Entries

(none yet — this section will grow as the team learns)
