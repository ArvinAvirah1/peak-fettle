# Peak Fettle — Workout Research Subteam Skill File

**Created:** 2026-05-15
**Owner:** Workout Research Subteam (coordinator)
**Purpose:** Define the team of researcher agents that produce and refresh the per-sport training reference docs in `../`. Run these agents when the evidence base changes (e.g., a major guideline update), when a new sport is added to onboarding, or on a routine ~12–18-month refresh cadence.

---

## Subteam composition

| Agent file | Sport covered | Output |
|---|---|---|
| `powerlifting_researcher.md` | Powerlifting | `../powerlifting.md` |
| `weightlifting_researcher.md` | Olympic weightlifting | `../weightlifting.md` |
| `general_strength_researcher.md` | General-population strength | `../general_strength.md` |
| `running_researcher.md` | Distance running | `../running.md` |
| `cycling_researcher.md` | Road/indoor cycling | `../cycling.md` |
| `swimming_researcher.md` | Swimming | `../swimming.md` |
| `other_mixed_researcher.md` | Hybrid / concurrent training | `../other_mixed.md` |
| `scheduling_researcher.md` | Periodization & scheduling science (cross-sport) | `../scheduling_guidelines.md` |

The coordinator (this file) sets the shared output format, source-quality bar, and refresh protocol; each researcher carries its own brief and anchor-source list.

---

## Shared output contract — every per-sport doc must contain

1. **Sport overview** — what it optimizes, primary adaptations, key performance determinants.
2. **Programming by experience tier** — Beginner / Intermediate / Advanced, each with frequency, volume, intensity, rep schemes, periodization model, progression rule, deload guidance, realistic weekly time.
3. **Ideal exercises + equipment substitution ladders** — full commercial gym → home gym → minimal (DB/bands) → bodyweight / no equipment. Be explicit when substitution is *not* equivalent (most acute for weightlifting and swimming).
4. **Common mistakes by tier.**
5. **Key sources with URLs.**

The `scheduling_guidelines.md` doc has a different contract — see `scheduling_researcher.md`.

---

## Source-quality bar

Cite, in roughly this order of preference:
1. Peer-reviewed meta-analyses and systematic reviews (PubMed, PMC, Springer, Frontiers, MDPI).
2. Major guideline-issuing bodies (ACSM, NSCA, AHA, ODPHP, USA Swimming, USA Weightlifting, British Cycling).
3. Recognized evidence-based coaching authorities (Stronger By Science, Renaissance Periodization, Eric Helms, Greg Nuckols, Catalyst Athletics / Greg Everett, Jack Daniels, Stephen Seiler / FastTalk Labs, Joe Friel, TrainingPeaks, TrainerRoad).
4. Reputable practitioner publications when they synthesize the above (Barbell Medicine, BarBend, Marathon Handbook, U.S. Masters Swimming, Cleveland Clinic, HSS).

Avoid: influencer blogs without citations, single-study cherry-picking, brand marketing pages, generic listicles, AI-generated summaries without primary-source backing.

---

## Refresh protocol

1. **Trigger.** Routine cadence every 12–18 months, OR a major guideline update lands (e.g., the 2026 ACSM Resistance Training Guidelines), OR a new sport is added to onboarding.
2. **Spawn researchers in parallel.** Each researcher's skill file contains the standing brief and the anchor source list — run them with that brief unchanged unless updating scope.
3. **Diff before overwriting.** Read the existing doc; compare the new findings against current content; highlight what changed and why.
4. **Update sources.** New peer-reviewed evidence supplants older sources; do not delete the old citation unless its conclusion has been superseded.
5. **Audit the equipment ladders.** If new evidence shows an alternative is genuinely equivalent (or genuinely not), update the ladder language honestly.
6. **Bump the doc date.** Update the "Compiled:" line in the per-sport doc.
7. **Memory update.** If a finding is broadly load-bearing for the Haiku agent's behavior, also surface it in Peak Fettle's main memory (e.g., a feedback or project memory).

---

## Cross-sport invariants the team has settled on (do not re-derive each refresh)

These hold across every sport in the library and should be preserved across refreshes unless directly contradicted by new evidence:

- Tier is defined by recovery capacity, not calendar time.
- Periodization shape: Beginner = linear progression → Intermediate = undulating with scheduled deloads → Advanced = block periodization with tapers. Only specifics differ by sport.
- Endurance sports share the ~80/20 intensity distribution; the dominant amateur error everywhere is the "moderate-intensity rut."
- Equipment substitution is not uniform: barbell strength has clean ladders; Olympic lifts and swim technique do not — flag this asymmetry.
- When scaling down, **protect intensity first.** Cut accessories → easy volume → sets → frequency.
- Design for ~85% adherence, not 100%; every plan needs a defined Minimum Viable Session.

---

## Per-sport researcher index

See the individual agent skill files in this folder for each sport's standing brief, anchor sources, and known-issue notes.
