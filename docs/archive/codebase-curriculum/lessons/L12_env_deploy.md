# Lesson L12 — Config, secrets, environments, and deployment

> **Track:** 1 — Backend services · **Status:** ⭐ Reference lesson (fully worked)
> **Interactive app:** [`L12_env_deploy.html`](L12_env_deploy.html)
> **Estimated time:** ~45 min · **Prerequisite rungs:** L01–L11 (API, database, cron jobs)

## 0. Source of truth (read fresh before teaching — code drifts)
- `.env.example` (server, mobile) — template showing which vars are needed
- `server/.env.example` — full list: DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, JWT_SECRET, etc.
- `mobile/.env.example` — client-side: EXPO_PUBLIC_API_URL, EXPO_PUBLIC_POWERSYNC_URL (public only)
- `CLAUDE.md` § "Filesystem constraints" — why `rm` and `mv` fail on OneDrive, implications for git
- `.github/` workflows — CI/CD deployment pipeline (if present; confirm before referencing)
- `setup_local_llm.ps1`, `RUN_SETUP.bat` — local dev setup scripts (Windows environment)

## 1. Learning outcomes (Bloom-tagged)
By the end, Arvin can:
- **(L1)** List the three categories of environment variables: config (public), secrets (server-only), and credentials (dev tools).
- **(L2)** Explain why SUPABASE_SERVICE_ROLE_KEY must never appear in client code, and what RLS (row-level security) does.
- **(L3)** Construct a `.env` file for a new environment (dev, staging, prod) given a checklist.
- **(L4)** Analyze the blast radius of a leaked service-role key and design containment (where it can live, where it must never appear, detection strategy).
- **(L5)** Evaluate trade-offs: dev-local-LLM (no API keys, slow) vs. cloud LLM (keys required, fast). When would you use each?

## 2. Pre-lesson survey (M1) — ask LIVE via AskUserQuestion
- "Have you worked with `.env` files or secret management before?"
- "Do you know the difference between public and private env vars in a web/mobile context?"
- "If someone commits a database password to GitHub, what should you do?"
> Calibrate: if env files are brand-new, spend time on the three categories. If secret leaks are uncharted territory, emphasize the "blast radius" framing (not just "bad," but "what can an attacker do with this key?").

## 3. Spacing carry-over (M14)
From L11 (cron jobs): "Where do cron jobs get their DATABASE_URL? From the `.env` file or from a configuration service?"
> Today: the `.env` file is the source of truth; deployment must ensure it's available securely.

## 4. The difficulty ladder for THIS lesson (M2)
1. Three categories of env vars: public config, server secrets, and dev-only credentials.
2. Why client code can't see server secrets (example: service-role key).
3. `EXPO_PUBLIC_*` prefix in React Native / Expo (all such vars are bundled into the app).
4. `.env.example` as a template — what's required, what's optional, what's dev-only.
5. Environment separation: dev, staging, production (different URLs, different secret stores).
6. Secrets management: `.env.local` (git-ignored), CI/CD secrets (GitHub Actions, EAS), and vault services.
7. The service-role key blast radius: what an attacker can do with it (bypass RLS, delete users, export all data).
8. Local LLM setup (dev path using Ollama or similar) vs. cloud LLM (API key required).

## 5. Concept sequence

### Concept 1: Three categories of env vars — knowing which is which
- **(M4) Generate first:** "You have three pieces of config: the API URL, the database password, and your API key for Claude. Which should be in the app bundle, which in the server, and which only on your laptop?"
- **The idea:** Environment variables fall into three buckets:
  1. **Public config** (safe in the app bundle):
     - `EXPO_PUBLIC_API_URL=https://api.peakfettle.com` — the server address. Users can see it (it's in network requests anyway).
     - `EXPO_PUBLIC_POWERSYNC_URL=https://instance.powersync.journeyapps.com` — the sync service. Public by design.
  2. **Server secrets** (must never leave the server):
     - `SUPABASE_SERVICE_ROLE_KEY=...` — can bypass all row-level security. If this leaks, an attacker can delete any user's data.
     - `JWT_SECRET=...` — used to sign login tokens. If leaked, attackers can forge tokens.
     - `ANTHROPIC_API_KEY=...` — costs money to use. If leaked, attackers can burn your LLM budget.
  3. **Dev-only credentials** (your laptop only, never committed):
     - `.env.local` — your personal database URL for local testing, Ollama API key for local LLM, etc.
- **Real code** (`server/.env.example`, lines 1–27):
  ```
  # Public (safe to expose)
  WEB_ORIGIN=http://localhost:5173

  # Server secrets (NEVER expose)
  SUPABASE_DB_URL=postgres://postgres:PASSWORD@HOST:5432/postgres
  SUPABASE_SERVICE_ROLE_KEY=replace-with-service-role-key-from-supabase-dashboard
  JWT_SECRET=replace-with-64-bytes-of-randomness
  ANTHROPIC_API_KEY=sk-ant-...

  # Dev-only
  # (not in .env.example; lives in .env.local, git-ignored)
  ```

  And mobile (`mobile/.env.example`, lines 1–13):
  ```
  # Public (bundled into the app)
  EXPO_PUBLIC_API_URL=http://localhost:3001
  EXPO_PUBLIC_POWERSYNC_URL=https://YOUR_INSTANCE.powersync.journeyapps.com

  # Dev-only; stored locally
  # (not usually needed on mobile — server handles secrets)
  ```
- **(M6) Elaboration:** the `EXPO_PUBLIC_*` prefix is **automatic bundling**. Expo sees `EXPO_PUBLIC_FOO=bar` in `.env` and inlines it into the JavaScript bundle at build time. This is convenient (no server call needed to read config), but it means **anything you put here is visible to users**. Never put secrets there, even if you think they're "hidden."
- **(M8) Diagram (in app):** two columns: "Client (React Native)" and "Server (Node.js)". Arrows show:
  - API_URL: client → server (to know where to call).
  - SERVICE_ROLE_KEY: server only (never touches client).
  - LLM_API_KEY: server only (server calls Claude on behalf of user, not the client directly).
- **(M3) Retrieval check:** "Why is EXPO_PUBLIC_API_URL safe to expose, but ANTHROPIC_API_KEY isn't?"

### Concept 2: The service-role key — blast radius and containment
- **(M4) Generate first:** "The Supabase service-role key can bypass all row-level security. If an attacker gets this key, what can they do?"
- **The idea:** The service-role key is the **master key** to your database. RLS (row-level security) is the firewall that prevents users from seeing each other's data. The service-role key is an exception — it ignores RLS. If leaked:
  1. **Read any user's data:** workout history, percentiles, constraints, health metrics, even deleted data (if not hard-deleted).
  2. **Write/delete any user's data:** modify someone's PRs to inflate their percentile, delete their account, insert fake workouts.
  3. **Enumerate users:** iterate through all UIDs to build a user list (not useful per se, but enables targeted attacks).
  4. **Cost attacks:** if the key is misused, your Supabase bill spikes.
  
  **Containment:** the key must be:
  - **Never in client code:** it's a server-only secret.
  - **Never in git history:** use `.env` + `.gitignore` to ensure it's never committed.
  - **Only in server environment:** injected at deploy time (GitHub Secrets, EAS Secrets, etc.).
  - **Short-lived where possible:** some platforms (like EAS) offer per-build secrets that expire after the build.
  - **Monitored for leaks:** watch GitHub for accidentally-committed secrets (pre-commit hooks, automated scanning).
  
- **Real code** (`server/.env.example`, lines 10–13):
  ```
  # Supabase service role key — from Project Settings → API → service_role secret.
  # NEVER expose this to the client. Server-side only.
  # Required for: auth.admin.deleteUser() (TICKET-030) and any privileged admin ops.
  SUPABASE_SERVICE_ROLE_KEY=replace-with-service-role-key-from-supabase-dashboard
  ```

  And how it's used (safe pattern) in `lib/supabaseAdmin.js`:
  ```javascript
  const { createClient } = require('@supabase/supabase-js');
  const supabaseAdmin = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY  // Read from env, never hardcoded
  );
  ```

  And how it's NOT used (dangerous):
  ```javascript
  // ❌ WRONG — never do this
  const supabaseAdmin = createClient(url, 'sk-...' /* hardcoded key in source */);

  // ❌ WRONG — never push this to git
  // .env file committed to git with the key visible in history
  ```
- **(M9 faded):** "An engineer accidentally commits `.env` to GitHub. In 10 minutes, GitHub detects the secret and emails the org. You have 10 minutes to revoke the key. What steps?" → seed for Q5 capstone.
- **(M3) Retrieval check:** "Why can't the service-role key be stored in the mobile app's `.env` file?"

### Concept 3: Environment separation — dev, staging, production
- **(M7) Concrete:** "Your app has three environments: dev (your laptop), staging (test server), production (real users). Each has a different database URL and secret store. How do you prevent deploying staging code to prod?"
- **The idea:** Environments are **isolated copies** of your system:
  - **Dev:** your local laptop, `localhost:4000`, local Postgres, `.env.local` with test API keys.
  - **Staging:** a test server (Vercel, Heroku, EAS, etc.), staging Supabase database, real API keys but tied to a test account.
  - **Production:** the live app, prod Supabase, real users, real money.
  
  The challenge: **ensure that staging code never overwrites prod.** Solutions:
  1. **Branch-based deployment:** `main` → prod, `develop` → staging, `feature/*` → dev. CI/CD enforces this.
  2. **Env var validation:** at startup, your server reads the current env and refuses to start if mismatched (e.g., if prod code tries to run with staging DB URL).
  3. **Secrets isolation:** prod secrets are stored in a prod vault; CI/CD never gives them to staging builds.
- **Real code** (`server/.env.example` repeated for each environment):
  ```
  # Staging .env
  SUPABASE_DB_URL=postgres://...staging...
  SUPABASE_URL=https://staging-project.supabase.co
  
  # Prod .env
  SUPABASE_DB_URL=postgres://...prod...
  SUPABASE_URL=https://prod-project.supabase.co
  ```

  And validation (defensive, not shown in code but good practice):
  ```javascript
  // At server startup
  if (process.env.NODE_ENV === 'production' && !process.env.SUPABASE_DB_URL.includes('prod')) {
      throw new Error('Prod env detected but non-prod DB URL — refuse to start!');
  }
  ```
- **(M6) Elaboration:** staging is **not optional** — it's where you catch bugs before prod. If you skip staging and deploy straight to prod, expect data corruption, user-visible errors, and emergency reverts at 3 AM.
- **(M8) Diagram (in app):** three columns (dev, staging, prod), each with its own DB, secrets store, and code path. Arrows showing: dev → staging (on PR merge) → prod (on release tag).

### Concept 4: Secrets management — from `.env.local` to CI/CD to vault services
- **(M7) Concrete:** "You're running cron jobs on a server. Where does the server get its DATABASE_URL and ANTHROPIC_API_KEY?"
- **The idea:** Secrets must be:
  1. **Never in the repository:** `.env` files are git-ignored.
  2. **Available at runtime:** injected by the deployment process.
  3. **Audited:** logs show when they were accessed (good practices only; some setups skip this).
  
  Three strategies, in increasing order of complexity:
  
  **A. Dev: `.env.local` (git-ignored file)**
  - You manually create `.env.local` on your laptop with your personal API keys.
  - The server reads it at startup: `require('dotenv').config();`
  - Pros: simple, no setup.
  - Cons: easy to leak (if you `git add .` without checking gitignore), manual on each dev laptop.
  
  **B. CI/CD: GitHub Actions / EAS secrets**
  - You add secrets to GitHub (repo settings → Secrets).
  - The workflow file references them: `DATABASE_URL: ${{ secrets.DATABASE_URL }}`
  - At build time, GitHub injects them as env vars.
  - Pros: encrypted, revisionable (see who added/changed each secret), per-repo.
  - Cons: requires GitHub account access, not portable to other CI systems.
  
  **C. Vault services (Doppler, HashiCorp Vault, AWS Secrets Manager)**
  - Centralized secret store, encrypted at rest, audited access.
  - Your CI/CD pipeline fetches secrets from the vault at build time.
  - Pros: audit trail, rotatable secrets, shareable across teams.
  - Cons: added infrastructure, additional monthly cost.
  
- **Real code** (`cron/percentile.js`, line 33):
  ```javascript
  require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
  const { pool } = require('../db');
  ```
  This reads `.env` at startup. In prod, the `.env` file is injected by the deployment process (e.g., GitHub Actions injects `DATABASE_URL` as an env var, which dotenv then reads).

  Alternatively (more secure):
  ```javascript
  // Don't use .env file in prod — read directly from process.env
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) throw new Error('DATABASE_URL not set');
  ```
- **(M3) Retrieval check:** "If you check your `.env.local` file (with your API keys) into git by accident, what's the first thing you should do?"

### Concept 5: Local LLM development — the Ollama path
- **(M7) Concrete:** "You're building LLM-powered features (like plan generation). You don't want to burn API quota during development. What's the alternative to calling Claude Haiku?"
- **The idea:** **Ollama** (or similar local LLM services) runs an open-source LLM on your laptop. You call it via the same API as a cloud provider, but it's free and offline.
  - **Haiku in prod:** $0.025 per plan, cloud-hosted, high quality.
  - **Llama 2 / Mistral locally:** free (compute on your laptop), lower quality, but enough for testing.
  
  The **local path** (from `setup_local_llm.ps1`):
  ```powershell
  # 1. Download Ollama from ollama.ai
  # 2. Run: ollama pull mistral (or llama2)
  # 3. Start the server: ollama serve
  # 4. In your app:
  #    - Set ANTHROPIC_API_KEY to http://localhost:11434/v1 (Ollama compatibility mode)
  #    - Or use the Ollama client library directly
  # 5. Call Claude SDK pointing to localhost
  ```

  The code change (minimal):
  ```javascript
  // Dev
  const anthropic = new Anthropic({
      apiKey: 'dummy-key-for-local-llm',  // Ollama ignores this
      baseURL: 'http://localhost:11434/v1',  // Point to Ollama
  });

  // Prod
  const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,  // Real key
      // baseURL defaults to api.anthropic.com
  });
  ```
- **(M6) Elaboration:** local LLMs are **slower and lower quality** than cloud LLMs. Mistral on a modern laptop takes ~3 seconds to generate a plan (vs. 1 second for Haiku). But they're great for:
  - Testing prompt engineering (iterate on system/user message).
  - Catching JSON parsing bugs without burning API quota.
  - Teaching: running LLM integration code without secrets.
- **(M9 faded):** "If you set up Ollama locally, you can develop offline. But how do you test plan generation when you don't have Haiku's output quality?" → seed for Q5 capstone.

### Concept 6: Deployment pipeline — how code and secrets get from your laptop to production
- **(M7) Concrete:** "You merge a PR to `main`. How does it get to the live app? Who manages the secrets? What if the deployment fails halfway?"
- **The idea:** A typical deployment pipeline:
  1. **Developer:** pushes code to `main` branch.
  2. **GitHub:** detects the push, triggers a workflow.
  3. **CI/CD (GitHub Actions):** runs tests, lints, builds the app.
  4. **Secrets injection:** GitHub fetches prod secrets and injects them as env vars into the build.
  5. **Build artifact:** a Docker container (or compiled binary) with the secrets baked in.
  6. **Deploy:** push the container to a registry (Docker Hub, ECR, etc.), then deploy to the server (Vercel, EAS, Kubernetes, etc.).
  7. **Health check:** the server starts up, reads the `.env` (or env vars injected by the platform), connects to the database.
  8. **Rollback:** if health check fails, revert to the previous version (with the old secrets still available).
  
  The key insight: **secrets are injected at deploy time, not stored in the code.**
- **Real code** (example GitHub Actions workflow, conceptual):
  ```yaml
  name: Deploy to production
  on:
    push:
      branches: [main]
  
  jobs:
    deploy:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v2
        - name: Build
          env:
            ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
            DATABASE_URL: ${{ secrets.DATABASE_URL }}
          run: npm run build
        - name: Deploy
          env:
            DEPLOY_KEY: ${{ secrets.DEPLOY_KEY }}
          run: |
            # Push to server, restart cron jobs, etc.
            scp -i $DEPLOY_KEY dist/ prod-server:/app/
            ssh -i $DEPLOY_KEY prod-server systemctl restart app
  ```
- **(M6) Elaboration:** if the build fails (e.g., bad code), the workflow stops and doesn't deploy. If the deploy fails (e.g., server won't start), you can revert to the previous version — which has the old secrets in the env. This is why secrets aren't hardcoded; they're always external.
- **(M3) Retrieval check:** "Why must secrets be injected at deploy time and not at build time?"

## 6. Teach-back (M10)
"Explain to a junior engineer: Why can't you put the service-role key in `.env` and commit it to git? What's the flow from a dev's laptop to production for secrets? If an API key leaks, what's your 5-minute action plan?"
> Expect: first Q tests understanding of RLS and blast radius. Second Q should show the deployment pipeline shape. Third Q should surface the "revoke and rotate" mindset (not panic, but act).

## 7. Cumulative review (M13) — rapid-fire
1. List the three categories of env vars and give an example of each.
2. Why is `EXPO_PUBLIC_API_URL` safe to expose but `SUPABASE_SERVICE_ROLE_KEY` isn't?
3. What's the difference between dev, staging, and production environments? Why not skip staging and deploy straight to prod?

## 8. The graded quiz (Bloom L1–L5, AI-graded in the app)

| # | Bloom | Type | Prompt | Rubric | Model answer (reference) | Pts |
|---|-------|------|--------|--------|--------------------------|-----|
| q1 | L1 | mc | Which of the following is safe to commit to git? | Identifies public config only | `EXPO_PUBLIC_API_URL=https://api.peakfettle.com` (public config). NOT `.env` with secrets. | 8 |
| q2 | L2 | free | Explain why the Supabase service-role key must never appear in client code. What would an attacker do with it? | Names RLS bypass, data access, cost attacks. Shows understanding of the "master key" concept. | The service-role key bypasses row-level security (RLS) — it's the master key. An attacker can: (1) read any user's data (workouts, metrics, even deleted rows), (2) modify/delete any user's data, (3) enumerate all users. If the key is misused, your Supabase bill spikes. Keep it server-only so users can't access it. | 12 |
| q3 | L3 | free | You're setting up a new staging environment. Create a checklist of what goes in the staging `.env` file. Flag which items must come from your vault (GitHub Secrets, Doppler, etc.) vs. which can be hardcoded (they're not secret). | Separates secrets from non-secrets; shows understanding of staging isolation; lists specific vars | Secrets (from vault): ANTHROPIC_API_KEY, JWT_SECRET, SUPABASE_SERVICE_ROLE_KEY. Non-secrets (can be hardcoded): SUPABASE_URL (staging instance), WEB_ORIGIN (staging domain). Optional: DATABASE_URL (the connection string is sensitive, so treat as secret too). | 12 |
| q4 | L4 | free | An engineer accidentally commits `.env` with the service-role key to git. You have 10 minutes to minimize damage. What are your steps, and what can an attacker do between the commit and your revocation? | Shows prioritization: revoke first, then audit logs. Names window of vulnerability (10 minutes). Surfaces "rotate after revoking." | (1) **Immediately revoke the leaked key in Supabase (Project Settings → API)** — this invalidates all JWTs signed with the old key. (2) **Search GitHub history for other leaks** (that commit is public now; other keys might be in earlier commits). (3) **Generate a new key and update deployment secrets** (GitHub Secrets, EAS, vault). (4) **Audit logs:** check Supabase activity for unauthorized reads/writes in the 10-minute window. (5) **Notify the team** and rotate other secrets if uncertain. An attacker in that window could: export all user data, modify PRs, delete accounts — depends on how fast they acted. **Prevention:** pre-commit hooks (`git-secrets`, `detect-secrets`) catch the leak before push. | 20 |
| q5 | L5 | free | You're developing the AI plan generation feature locally (L10) but don't want to burn Anthropic API quota. Design a local LLM dev setup using Ollama. What are the tradeoffs vs. cloud LLM (Haiku)? When would you switch back to Haiku? | Proposes local Ollama setup, names the tradeoffs (speed, quality, offline), proposes a threshold for switching. | **Setup:** (1) Install Ollama (ollama.ai). (2) `ollama pull mistral` (fast, ~8B params). (3) Run `ollama serve` (localhost:11434). (4) In code: set `baseURL: 'http://localhost:11434/v1'` and use Mistral model instead of Haiku. Tradeoffs: local Mistral is slower (~3s vs. Haiku's 1s) and lower quality (generic reasoning, fewer edge-case handles). But it's free and offline. **When to switch back:** (1) Ready to QA with users — use Haiku for realistic quality. (2) Testing edge cases (undisclosed height, injury constraints) — Haiku handles these better. (3) Before shipping — Haiku is the "real" experience. Mistral is for rapid iteration and cost control. | 24 |
| q6 | L5 (opt) | free | Design a secret rotation strategy for the service-role key: (1) How often? (2) How do you roll over without downtime? (3) What monitoring would catch a leak? | Proposes rotation frequency (monthly, or on-demand after incident), describes zero-downtime strategy (issue new key, update all servers, revoke old key), proposes leak detection. | **(1) Rotation cadence:** monthly (or immediately if leaked). Longer intervals increase breach window; shorter intervals add operational burden. Monthly is standard. **(2) Zero-downtime rollover:** (a) Generate new key in Supabase. (b) Update vault (GitHub Secrets, Doppler, etc.). (c) Trigger a rolling deployment (update 1 server at a time, health-check between). (d) Once all servers are updated, revoke the old key. (e) Verify logs show no old-key access. **(3) Leak detection:** (a) **Pre-commit hooks** (`git-secrets`, `detect-secrets`) scan for patterns (e.g., `sk-` prefix for Anthropic keys). (b) **GitHub Secret scanning** (built-in, detects pushed secrets). (c) **Supabase activity audit logs** — alert on unusual patterns (many reads/writes from new IPs, deletions, etc.). (d) **Email alerts on key rotation** — if a key is rotated without a deployment, something is wrong. | 25 |

## 9. Custom interactive widget
**Secret blast radius simulator** — interactive diagram showing:
- The service-role key at the center.
- Concentric rings: "Server only," "Server at deploy time," "Never in client," "Never in git history."
- Toggle buttons: "Leak at dev stage" (caught by pre-commit), "Leak at GitHub" (caught by secret scanning), "Leak in prod" (worst case — audit logs and revoke).
- Shows time-to-detection and impact (data exposed, cost incurred, attacker window).

Lets Arvin *viscerally* understand why the key is sensitive and how each safeguard buys time.

## 10. End-of-session updates (agent)
- Grade quiz via the app's "Grade with Claude."
- Update `teacher_skill.md` PART 5: assessment of security thinking; whether the "blast radius" framing resonated; whether Arvin naturally thought of "audit logs after revocation" (good sign of operational maturity); whether env-var categories are crisp or still fuzzy.
- If L5 Q5 (local LLM setup) is weak, note this for follow-up — shows opportunity for a hands-on dev-environment session.
- If L5 Q6 (rotation + detection) shows strong thinking, highlight as "ready for infrastructure work."
- Offer to schedule L13 (data persistence & migrations) — secrets enable schema changes; can't migrate prod without the service-role key to sign the admin call.
- Optional: suggest running a "secret hygiene audit" on the Peak Fettle repo (search for leaked keys, check `.gitignore`, validate GitHub Secrets are set).

---

## Appendix: Quick reference — env var checklist

### For `.env.example` (server)
```
# Public config
WEB_ORIGIN=http://localhost:5173
PORT=4000

# Server secrets (from Supabase dashboard)
SUPABASE_DB_URL=postgres://...
SUPABASE_URL=https://...supabase.co
SUPABASE_SERVICE_ROLE_KEY=...

# Auth
JWT_SECRET=...

# LLM
ANTHROPIC_API_KEY=sk-ant-...

# Optional
SENTRY_DSN=
POSTHOG_KEY=
FCM_SERVER_KEY=...
```

### For `.env.example` (mobile)
```
# Public (bundled into app)
EXPO_PUBLIC_API_URL=http://localhost:3001
EXPO_PUBLIC_POWERSYNC_URL=https://...powersync.journeyapps.com
```

### For `.env.local` (dev laptop, never committed)
```
# Your personal dev secrets
SUPABASE_DB_URL=postgres://localhost:5432/dev_db
ANTHROPIC_API_KEY=sk-ant-YOUR-DEV-KEY
FCM_SERVER_KEY=...YOUR-DEV-KEY

# Local LLM (optional)
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL=mistral
```

### Deployment (GitHub Actions / EAS)
```yaml
env:
  # Injected by CI/CD from GitHub Secrets
  ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
  DATABASE_URL: ${{ secrets.DATABASE_URL }}
  SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SERVICE_ROLE_KEY }}
  JWT_SECRET: ${{ secrets.JWT_SECRET }}
```
