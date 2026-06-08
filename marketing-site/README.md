# Peak Fettle — Marketing Site

Premium, animated, SEO-optimized marketing site for the Peak Fettle fitness app.
Built with **Next.js 14 (App Router)**, no UI framework — just CSS modules and a
hand-rolled scroll-scrub hero (no animation-library dependency).

## Pages
- `/` — home: scroll-scrub cinematic hero, screenshot showcase, features, fair-percentile spotlight, philosophy, pricing teaser, FAQ, download/notify CTA
- `/features` — deep dives + "how it works"
- `/pricing` — Free vs Pro
- `/about` — story + principles
- `/privacy`, `/terms` — legal (⚠️ template drafts; have counsel review)

## Develop
```bash
npm install
cp .env.example .env.local   # fill in values (see below)
npm run dev                  # http://localhost:3000
npm run build && npm start   # production build
```

## Environment variables
See `.env.example`. Public (`NEXT_PUBLIC_*`) are safe to expose; the `RESEND_*`
keys are server-only and power the `/api/waitlist` "get notified" form.

| Var | What it does |
|-----|--------------|
| `NEXT_PUBLIC_SITE_URL` | Canonical origin for SEO/OG/sitemap |
| `NEXT_PUBLIC_IOS_URL` / `NEXT_PUBLIC_ANDROID_URL` | Store links; blank → CTAs fall back to `#notify` |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` / `RESEND_WAITLIST_TO` | Email capture |

## Assets to drop in (graceful placeholders until then)
- **Hero cinematic** → `public/hero/` (`hero.mp4`, optional `hero.webm`, `poster.jpg`). See `public/hero/README.md` for the Nano Banana 2 / Higgsfield prompts. Until added, an on-brand animated SVG shows.
- **App screenshots** → `public/screens/` (`log.png`, `score.png`, `rank.png`, `streak.png`). Until added, on-brand SVG renderings of each screen show.

## SEO
Per-page metadata + canonicals, Organization / WebSite / SoftwareApplication /
FAQPage / Product / BreadcrumbList JSON-LD, dynamic Open Graph image
(`opengraph-image.tsx`), `sitemap.xml`, `robots.txt`, web manifest, SVG favicon.

## Deploy (Vercel)
Connect the GitHub repo in the Vercel dashboard with **Root Directory =
`marketing-site`**. Add the env vars above in Project → Settings → Environment
Variables. `vercel.json` sets the framework, caching, and security headers.
