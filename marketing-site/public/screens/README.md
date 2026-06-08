# App screenshots — drop your exports here

The device mockups (`src/components/DeviceMockup.tsx`) look for these files. Until
each exists, an on-brand SVG rendering of that screen shows instead.

| File | Screen |
|------|--------|
| `log.png`    | Set logging (Bench Press, sets, E1RM + score) |
| `score.png`  | 0–1000 strength score + trend |
| `rank.png`   | Percentile ranking within your cohort |
| `streak.png` | Habit streak / consistency |

Export as **portrait PNGs** (ideally the device's native resolution, e.g.
1170×2532). The frame uses a 390×844 aspect ratio and crops with `object-fit:
cover`, so anything close to a modern phone aspect ratio will look right.

## ⚠️ After adding the files: flip the flag

To avoid 404s before the screenshots exist, the mockups don't request these files
until you opt in. Once all four PNGs are in this folder, set **`screens: true`**
in `src/lib/site.ts` (the `ASSETS` object) and the real screenshots replace the
SVG stand-ins automatically.
