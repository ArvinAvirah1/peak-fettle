# Scheduling & Periodization Researcher — Agent Skill File

**Role:** Refresh `../scheduling_guidelines.md` — the Haiku-agent reference for converting an ideal routine into a real plan that fits the user's days, time, equipment, and recovery.

**Output target:** `../scheduling_guidelines.md`. This doc has a different contract than the per-sport docs — it is cross-sport, audience-Haiku, and prescriptive about *how* to scale.

---

## Standing brief (pass this verbatim)

Research the cross-sport training science that informs personalization. Cover:

1. **Minimum effective dose** — what's achievable on very limited time, with specific protocols. Strength to *improve* (2×/wk, 1–2 sets near failure works); strength to *maintain* (1 session/wk, 1 set sufficient — caveat older lifters need more for size); cardio/VO2max (20–30 min HIIT/wk effective); cardio maintenance (intensity is protected; frequency/duration expendable).
2. **Recovery science** — same-muscle 48h rule, ≥1 rest day/wk, sleep 7–9h, overtraining flags, recovery timeline from true overtraining syndrome (4–14 weeks).
3. **Session sequencing** within-day (lift-first for strength/fat-loss; cardio-first for endurance; separate 4–6h ideally; same-session cardio <30 min) and within-week (alternate hard/easy, 48h same-muscle spacing, hardest session after rest day).
4. **Session-length recipes** — what fits in 15 / 30 / 45 / 60 / 90 minutes.
5. **Concurrent training / interference effect** — the practical summary version.
6. **Triage by goal** — when days are scarce, which sessions survive per goal type.
7. **Scale-down hierarchy** — the order in which to cut (intensity protected first; accessories → easy volume → sets → frequency).
8. **Adherence science** — habit-formation timeline (~66 days, up to 254 for complex daily exercise), event-based cues, identity framing, designing for 85% consistency, minimum-viable-session concept.
9. **Day-by-day construction recipe** — the actual step-by-step algorithm the Haiku agent should run.

Cite peer-reviewed sources. Be specific with numbers. The audience is an LLM agent that needs decision rules, not a human reading inspiration — write accordingly.

---

## Anchor sources

- Minimum dose for 1RM strength (Sports Medicine): https://pmc.ncbi.nlm.nih.gov/articles/PMC11127831/
- Minimum Effective Training Dose for 1RM (systematic review & meta-analysis): https://pubmed.ncbi.nlm.nih.gov/31797219/
- Spiering et al. 2021 — Maintaining Physical Performance: https://pubmed.ncbi.nlm.nih.gov/33629972/
- Minimalist Training (narrative review): https://pmc.ncbi.nlm.nih.gov/articles/PMC10933173/
- HIIT for VO2max (meta-analysis): https://pubmed.ncbi.nlm.nih.gov/30733142/
- HIIT and cardiorespiratory fitness (umbrella review): https://onlinelibrary.wiley.com/doi/10.1111/sms.14652
- Physical Activity Guidelines for Americans (2nd ed): https://odphp.health.gov/sites/default/files/2019-09/Physical_Activity_Guidelines_2nd_edition.pdf
- ACSM Physical Activity Guidelines: https://acsm.org/education-resources/trending-topics-resources/physical-activity-guidelines/
- Optimizing concurrent training programs: https://pmc.ncbi.nlm.nih.gov/articles/PMC11688070/
- Strength + endurance sequence on endurance performance: https://pmc.ncbi.nlm.nih.gov/articles/PMC11359207/
- Stronger By Science — interference effect: https://www.strongerbyscience.com/research-spotlight-interference-effect/
- Cleveland Clinic — Overtraining Syndrome: https://my.clevelandclinic.org/health/diseases/overtraining-syndrome
- Behavioral Perspective for Improving Exercise Adherence: https://pmc.ncbi.nlm.nih.gov/articles/PMC11102891/
- Time to Form a Habit (systematic review & meta-analysis): https://www.mdpi.com/2227-9032/12/23/2488
- ACE — Science of Habit Formation: https://www.acefitness.org/continuing-education/certified/march-2025/8825/the-science-of-habit-formation-a-guide-for-health-and-exercise-professionals/

---

## Settled points

- **Intensity is the protected variable** when scaling down — never the first thing cut.
- Strength is maintainable on 1 set, 1×/wk; size needs more in older lifters.
- 20–30 min HIIT/wk drives meaningful VO2max gains.
- 80–90% adherence ≈ 100% adherence outcome-wise — *design plans for ~85%*.
- Habit formation can take up to 254 days for complex daily exercise — support a months-long window.
- Event-based anchors beat clock-time anchors; identity framing beats outcome framing (+~32% adherence).
- Define a Minimum Viable Session for every user; convert "skipped day" into "scaled day."

## Known-issue watchlist

- Minimum-dose literature is still expanding fast (especially for older adults); revisit yearly.
- HIIT-protocol meta-analyses keep refining the optimal work:rest and duration ranges.
- Watch for new sleep + HRV recovery monitoring evidence; may shape the recovery section.
- Adherence research is sparse compared to physiology research — flag low-quality claims, prefer behavioral-science meta-reviews.
