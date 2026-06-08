# Hero cinematic — drop your files here

The scroll-scrub hero (`src/components/ScrollHero.tsx`) picks the best asset it
finds, in this priority order:

| Priority | File(s) | Effect |
|----------|---------|--------|
| 1 (best) | `hero.mp4` | Video scrubbed frame-by-frame on scroll (re-encode all-intra for smooth scrubbing — see note) |
| 2 — **no video needed** | `hero-start.jpg` **and** `hero-end.jpg` | Scroll-driven **crossfade** between the two Nano Banana stills |
| 3 (fallback) | _none_ | Self-animating on-brand SVG placeholder |

> Smooth scrubbing requires the mp4 to be **all-intra** (every frame a keyframe).
> Re-encode with: `ffmpeg -i in.mp4 -an -c:v libx264 -g 1 -keyint_min 1 -sc_threshold 0 -crf 21 -movflags +faststart hero.mp4`.
> To also serve a smaller `hero.webm`, add a `<source>` back in `ScrollHero.tsx`.

So if you can't generate the video, just export the **two still images** (e.g.
"bar on the floor" and "lockout + data burst"), name them `hero-start.jpg` and
`hero-end.jpg`, drop them in this folder, and the hero crossfades between them as
you scroll — the same reveal, no video tool required.

## How to make the cinematic (per the workflow)

1. **Nano Banana 2 — start frame** (16:9, 2K, clean dark-navy `#06080F` or
   transparent background, nothing touching the edges):
   > Cinematic hero — a lifter at the explosive lockout (peak) of a heavy barbell
   > lift, dramatic rim lighting, glowing turquoise (#2DD4BF) energy accents,
   > deep navy background, premium athletic-brand aesthetic, clean composition.

2. **Nano Banana 2 — end / "exploded" frame** (reference the start image):
   > Same scene and camera — the lifter/barbell erupting into streams of glowing
   > turquoise data: rep counters, percentile bars, a strength score flying
   > outward. "Effort becoming data." Same lighting, clean navy background.

3. **Higgsfield / Kling** (start frame → end frame): Kling 3.0, 7s, no multi-shot,
   no enhance. Prompt:
   > Smooth cinematic transition — the peak lockout erupts into a cloud of glowing
   > turquoise data that streams outward and resolves into a clean UI.

4. Export, convert to `hero.mp4` (+ optional `hero.webm`), grab a `poster.jpg`
   from the first frame, and drop all three in this folder.

Theme note: this is a **strength / weightlifting** "peak" — peak physical
condition and the top of a lift — **not** a mountain.
