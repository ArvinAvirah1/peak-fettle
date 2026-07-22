# TICKET-096 — Custom-Character Avatar Profile

**Owner:** design (art direction) → dev-frontend (mobile)
**Date opened:** 2026-06-06
**Phase:** 2 — Profile / engagement
**Source:** Founder request 2026-06-06.

## ⛔ Hard gate (founder decision 2026-06-06)
The avatar art is **bespoke Peak Fettle art — fun, simple, funny.** **Do NOT implement any avatar code until the founder has chosen an art direction.** The first deliverable is **multiple concept iterations** (style boards + sample characters across a few visual directions) presented for selection. No build work until one is approved.

## Goal
Replace the profile image with a customizable cartoon character, with a large selection of: face/head structures, skin/colors, hairstyles, facial hair, eyes/brows/mouth, glasses, hats/headwear, and background.

## Scope — Phase 1 (now): concept iterations
Produce N distinct art-direction concepts (e.g. 3–5 styles) with a few sample characters each, for the founder to choose. Deliver as images for review. **Stop here until approved.**

## Scope — Phase 2 (post-approval): implementation
- A layered, parametric avatar system: each feature category is a swappable layer (SVG/sprite atlas) with many options per category.
- Customizer UI: per-category pickers + a "randomize" button + live preview.
- **Serialize the config, not a rendered image** — store the small option-set so it ships in the local-first backup (TICKET-094) and re-renders identically on any device.
- A default/placeholder avatar for new users.
- Consider reusing the existing `cosmetic_items` / `user_cosmetics` tables for option ownership/unlocks.

## Scope — out
3D or photo-based avatars; monetized cosmetics (possible later via cosmetic_items).

## Acceptance criteria (Phase 2)
1. Customizer covers every listed feature category with a generous option count.
2. Avatar config persists locally and survives backup → restore (TICKET-094) with an identical render.
3. Randomize always yields a valid combination; default avatar shown until customized.
4. Renders consistently across screens (profile, rankings, groups).

## Test plan (Phase 2)
Build a character → restart → restore from backup → identical; randomize 100× with no broken layers; render at all avatar sizes.

## Notes
Asset pipeline: layered SVG or a sprite atlas keyed by option id. Keep option ids stable for backup compatibility.
