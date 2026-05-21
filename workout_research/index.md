# Peak Fettle — Workout Research Library

**Created:** 2026-05-15
**Owner:** Workout Research Subteam
**Purpose:** Canonical, evidence-based training reference for every primary sport offered in Peak Fettle onboarding. Each per-sport doc models the *ideal* routine for that discipline across three experience tiers, plus equipment substitutions down to no equipment at all. The Haiku routine-generation agent reads these docs to build personalized plans.

---

## How this library is meant to be used

The seven per-sport docs describe the **"perfect" routine** — what an athlete would do with unlimited time, full equipment, and good recovery. They are the *source of truth* for exercise selection, programming variables, and periodization logic.

The **`scheduling_guidelines.md`** doc is the bridge between that ideal and reality. It tells the Haiku agent how to scale the ideal routine down to fit a real user's available days, session length, equipment, and recovery capacity *without losing the core training stimulus*. **The Haiku agent should always read the relevant sport doc AND `scheduling_guidelines.md` together** — never one without the other.

The `agents/` folder holds the reusable researcher-agent skill files so this whole library can be regenerated or refreshed later as the evidence base evolves.

---

## Files

| File | What it covers |
|---|---|
| `powerlifting.md` | Maximal strength in squat / bench / deadlift. Linear → undulating → block periodization. |
| `weightlifting.md` | Olympic lifting — snatch, clean & jerk. Power + technical skill; highest practice frequency of any discipline. |
| `general_strength.md` | General-population "get strong and fit." The correct default for users with no competitive goal. |
| `running.md` | Distance running. Daniels 5-zone model, 80/20 polarized distribution, 10% volume rule. |
| `cycling.md` | Road/indoor cycling. Coggan 7-zone power model, FTP, low-impact high-volume tolerance. |
| `swimming.md` | Swimming. Technique-led programming (biomechanics explain ~90% of performance), CSS pacing, dryland support. |
| `other_mixed.md` | Hybrid / concurrent training. Managing the interference effect; strength + conditioning together. |
| `scheduling_guidelines.md` | **Haiku agent reference.** Minimum effective dose, session triage, sequencing, recovery, scale-down hierarchy. |

---

## Cross-library principles (true for every sport)

1. **Tier is defined by recovery capacity, not calendar time.** A user graduates from beginner to intermediate when they can no longer progress session-to-session — not after an arbitrary number of months.
2. **The shape of periodization is the same everywhere.** Beginner = simple linear progression. Intermediate = undulating (weekly/daily) with scheduled deloads. Advanced = block periodization with tapers. Only the specifics differ by sport.
3. **Endurance sports share an 80/20 rule.** Roughly 80% of training volume easy/low-intensity, 20% moderate-to-hard. The dominant amateur mistake across running, cycling, and swimming is training the easy days too hard and the hard days too easy.
4. **Equipment substitution is not uniform across sports.** Barbell strength movements have clean dumbbell/bodyweight analogs. The Olympic lifts essentially require a barbell + bumpers — off-equipment work trains *attributes* but not the competition skill. Swimming has the same problem on land. Flag these asymmetries when substituting.
5. **Protect intensity/effort when scaling down.** Volume and accessory work are expendable; the core high-effort stimulus is not. See `scheduling_guidelines.md`.
6. **The best routine is the one the user actually does.** Design for ~85% adherence, not 100%. Every plan needs a defined "minimum viable session" fallback.

---

## Maintenance

This library was compiled May 2026 from peer-reviewed literature, meta-analyses, and recognized coaching authorities (Stronger By Science, Renaissance Periodization, Catalyst Athletics, Jack Daniels, Stephen Seiler, USA Swimming, NSCA, ACSM). To refresh it, run the researcher agents in `agents/` — each carries its own brief and anchor-source list. Recommended refresh cadence: every 12–18 months, or sooner if a major guideline update lands (e.g., the 2026 ACSM Resistance Training Guidelines).
