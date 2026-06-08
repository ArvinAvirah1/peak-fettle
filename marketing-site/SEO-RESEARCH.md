# SEO research & overhaul — Peak Fettle marketing site

Date: 2026-06-03. Research pulled from current (2026) sources; see end for links.
This documents the findings and the concrete changes made to the site.

## Findings → what we changed

### 1. E-E-A-T & YMYL (highest priority)
A fitness app is **YMYL** ("Your Money or Your Life" — health). Google holds these
to the strictest Experience/Expertise/Authoritativeness/Trust bar.
- **Show methodology, not just claims.** Added a "How your score works" credibility
  section explaining the estimated-1RM → 0–1000 score, the DOTS/Wilks option, and
  cohort-matched percentiles (Experience + Expertise signal).
- **Disclaimers** — medical/"not medical advice" disclaimer in the footer and Terms
  (kept), surfaced near training-claim content.
- **Trust signals** — contact email, Privacy + Terms, "Last updated" dates on legal,
  Organization `contactPoint` in schema, no fake reviews/ratings.

### 2. Title tags & meta descriptions
- Titles **50–60 chars, primary keyword near the front** (51–55 = lowest rewrite rate).
- Descriptions **140–160 chars**.
- Rewrote the default title to lead with keywords ("Workout Tracker & Strength
  Percentiles"), added a tight ~155-char meta description (the old one was ~210 and
  truncated), and gave every sub-page a keyword-led title + 150–160-char description.

### 3. Core Web Vitals (LCP < 2.5s, INP < 200ms, CLS < 0.1; p75 real-user)
- Hero video `preload` changed `auto → metadata` so we don't pull 4.4 MB before LCP;
  all-intra frames stream via range requests as you scroll.
- Device-mockup images carry intrinsic `width/height` (+ `loading="lazy"`) to hold CLS at 0.
- next/font (Inter + Space Grotesk) self-hosted with `display: swap` — no render-block, no CLS.

### 4. AEO / AI Overviews (Gemini AI Mode, ChatGPT, Perplexity)
- **Answer-first** copy: each major section opens with a plain-language answer a model
  can extract; FAQ expanded with high-intent, citable Q&As.
- **Complete schema** — Gemini uses schema to verify claims & cite sources even with no
  visible rich result. Completed SoftwareApplication (featureList, screenshots,
  category, offers), FAQPage, Product, Organization, WebSite, BreadcrumbList.

### 5. Keyword / intent landscape
High-intent terms in this niche (what StrengthLevel, Hevy, Strong, StrengthLog rank for):
`workout tracker app`, `strength score`, `strength standards`, `1RM calculator`,
`percentile ranking`, `DOTS / Wilks`, `gym log`, `lift + run tracker`, `habit streak`.
Woven naturally into H2s, copy, alt text, FAQ, and the disciplines strip — one clear
search theme per page (no keyword stuffing).

### 6. Technical / on-page (kept or added)
- Per-page canonicals, `metadataBase`, OpenGraph + Twitter, dynamic OG image.
- `sitemap.xml`, `robots.txt`, web manifest, SVG favicon, security headers.
- Semantic headings (one H1/page), descriptive alt text, internal links across all pages.
- Mobile-first responsive (mobile-first indexing is fully live in 2026).

## Sources
- Google ranking factors / E-E-A-T 2026 — optinmonster.com/seo-ranking-factors, clickrank.ai/seo-ranking-factors
- Title/description length — zyppy.com/title-tags, scalenut.com (meta-title-length-best-practices-2026)
- Core Web Vitals thresholds — web.dev/articles/defining-core-web-vitals-thresholds, developers.google.com/search/docs/appearance/core-web-vitals
- YMYL / health E-E-A-T — searchengineland.com/guide/ymyl, eeatcheck.com/blog/ymyl-websites-eeat-guide
- App landing-page SEO — unicornplatform.com/blog/seo-for-landing-pages, incremys.com mobile-app-seo
- SoftwareApplication schema — developers.google.com/search/docs/appearance/structured-data/software-app
- AEO / AI Overviews — cxl.com/blog/answer-engine-optimization-aeo, almcorp.com/blog/answer-engine-optimization-2026
