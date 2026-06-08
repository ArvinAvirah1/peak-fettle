# Companion App — Naming Options
*TICKET-072 / Q7. 2026-05-29. Founder rejected "Peak Fettle Mind" — expanded options below.*

## Brand context that should drive the name
- **Peak Fettle** = the British idiom "in fine fettle" (in good condition/health) + "peak." The fitness app's identity is a **mountain/peak / ascent** metaphor (logos: double-peak, ridge, ascent-chevrons, sunrise-peak).
- The companion is the **calm, recover, find-your-bearings** counterpart to the **climb/push** app. The strongest names lean into *rest, ground, steadiness, shelter, orientation* — the things you do **between** and **around** the climb, not the climb itself.
- Decided positioning: **sibling** brand (related, not identical), light evidence-based wellbeing, **not** clinical.
- Constraint: avoid clinical/medical words ("therapy", "clinic", "rx"), avoid anything that could read as a treatment claim, easy to say, app-store-searchable, ideally a clean domain + bundle id.

---

## Strategy A — Keep the "Fettle" equity (umbrella or sub-brand)
Pros: instant brand link, one wordmark family, cheap. Cons: "Fettle X" can feel formulaic (which is why "Mind" fell flat).

- **Fettle Rest** ← *working-title placeholder in code* — calm, on-brand, clear counterpart to training.
- **Fettle Calm**
- **Fettle Ground / Grounded**
- **Fettle Quiet**
- **Fettle Within / Inner Fettle**
- **Fine Fettle** — leans fully into the idiom; warm, slightly playful, stands alone better than "Fettle Mind."
- **Fettle & Rest** / **Fettle + Rest**
- **Off-Fettle** (rejected — "off" reads negative)

*Umbrella rename option:* make **Fettle** the parent — fitness becomes **Fettle Move** (or keeps "Peak Fettle"), companion is **Fettle Rest/Calm**. One brand, two products. Biggest equity, biggest rename cost.

---

## Strategy B — Mountain / trail siblings (matches the peak metaphor)
Pros: visually + conceptually paired with the climbing brand; rich logo territory. Cons: needs the parent brand nearby to "get it."

- **Basecamp / Base Camp** — where climbers rest, recover, prepare. Perfect counterpart to "summit." ⚠️ *name collision with 37signals' Basecamp* — risky for trademark/search. Consider "Fettle Basecamp."
- **Cairn** ← **top pick.** A stack of stones that marks the path and reassures you're not lost. Calm, grounding, navigational, short, ownable, beautiful as a mark. Pairs gorgeously with a peak brand.
- **Trailhead** — the calm beginning; orientation.
- **Ridgeline** (a touch active) / **Saddle** (the restful low point between two peaks — nice, but obscure).
- **Switchback** — the slow, winding, patient way up (metaphor for steady progress) — clever but maybe too "effort."
- **Plateau** — ⚠️ negative connotation in fitness ("plateauing"); avoid.
- **Stillwater** — overlaps the chosen theme name; serene alpine lake. Strong, but double-duty with the theme could confuse.
- **Treeline** — the calm boundary; atmospheric.

---

## Strategy C — Standalone calm names (own identity, light brand tie via design only)
Pros: most emotional separation (matches "Cousin/Sibling" intent — a private off-duty space); broad domains. Cons: weaker explicit link to Peak Fettle (carry the tie via shared design system + "by Peak Fettle" endorsement).

**Steadiness / balance**
- **Even Keel** — calm, idiomatic, warm. Strong.
- **Ballast** — what keeps you steady; quietly nautical.
- **Plumb** / **Level** / **Poise** / **Steady**

**Shelter / home / warmth** (pairs especially well with the chosen *Warm Sand / Clay & Dusk* palette)
- **Hearth** ← strong with the warm palette — home, warmth, gathering, safety.
- **Haven** / **Harbor (Harbour)** / **Anchor** / **Lantern** — guidance + warmth.
- **Grove** / **Loam** / **Meadow** — restorative, natural.

**Light / time-of-day** (pairs with adaptive day/dusk theming)
- **Dusk** / **Daylight** / **Glimmer** / **Lull** / **Hush**

**Water / calm motion**
- **Eddy** / **Drift** / **Tide** / **Slack** (slack tide = the calm turning point) / **Lull**

**Pace / gentleness**
- **Amble** / **Saunter** / **Settle** / **Tend** (as in "tend to yourself" — pairs with the habit-garden mood metaphor) / **Ease**

**Short coined / soft**
- **Lumo** / **Mira** / **Calm­er** / **Solace** / **Respite**

---

## Domain / store reality check (do before locking)
For any finalist, verify: `.com`/`.app` domain, iOS App Store + Play name availability, and a clean bundle id. Flag collisions: **Basecamp** (37signals), **Haven/Harbor/Anchor/Calm** (Calm is a giant incumbent — avoid anything too close to "Calm"). **Cairn**, **Even Keel**, **Hearth**, **Ballast**, **Treeline** are comparatively clear but still need checking.

---

## Shortlist + recommendation
1. **Cairn** *(top pick)* — best of both worlds: clearly a sibling to a mountain brand, but stands alone, ownable, calming, gorgeous mark. "Cairn, by Peak Fettle."
2. **Even Keel** — warmest standalone; instantly communicates the benefit (steadiness).
3. **Hearth** — if you want to lean into the chosen Warm Sand / Clay & Dusk palette (home/warmth).
4. **Fine Fettle** — if you want to keep the Fettle equity but escape the flat "Fettle Mind."

**My pick: Cairn** (with "by Peak Fettle" endorsement). If you'd rather keep explicit brand equity, **Fine Fettle**.

---

## Decision needed
Reply with a name (from here or your own). Until then, code uses `PRODUCT_NAME = "Fettle Rest"` as a clearly-marked placeholder in `mind/src/config/product.ts` — swapping the final name is a one-line change, no rework.
