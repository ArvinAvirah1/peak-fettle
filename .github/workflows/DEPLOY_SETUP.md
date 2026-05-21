# CI / Deploy Setup — Peak Fettle

One-time steps to wire up the GitHub Actions CI and Vercel deployment.

## 1. Backend CI

No secrets needed for the backend job — it uses a dummy `JWT_SECRET` for tests.
If you want to override it, add `CI_JWT_SECRET` to GitHub Secrets.

## 2. Marketing site — Vercel deploy

### Step A — Link the project to Vercel

From inside `marketing-site/`:

```bash
cd marketing-site
npx vercel login
npx vercel link
```

This creates `.vercel/project.json` locally. You'll need the values from it:

```json
{ "orgId": "...", "projectId": "..." }
```

### Step B — Set GitHub Secrets

Go to **GitHub → Settings → Secrets and variables → Actions** and add:

| Secret name         | Value                                   |
|---------------------|-----------------------------------------|
| `VERCEL_TOKEN`      | From vercel.com → Account → Tokens      |
| `VERCEL_ORG_ID`     | `orgId` from `.vercel/project.json`     |
| `VERCEL_PROJECT_ID` | `projectId` from `.vercel/project.json` |

### Step C — Set Vercel environment variables

In the Vercel dashboard (Settings → Environment Variables) add:

| Variable              | Environment  | Value                              |
|-----------------------|--------------|------------------------------------|
| `RESEND_API_KEY`      | Production   | From resend.com → API Keys         |
| `RESEND_FROM_EMAIL`   | Production   | e.g. `Peak Fettle <noreply@peakfettle.com>` |
| `RESEND_WAITLIST_TO`  | Production   | Your notification inbox            |

These are injected at runtime by Vercel — they never go into the CI workflow.

### Step D — Custom domain

In Vercel dashboard → Domains, add `peakfettle.com` and follow the DNS instructions.
Update the `url:` field in `.github/workflows/ci.yml` once it resolves.

## 3. What the CI does on each push

| Event                 | backend job | marketing job | deploy job |
|-----------------------|-------------|---------------|------------|
| PR to `main`          | ✅ runs      | ✅ runs       | ❌ skipped |
| Push to `develop`     | ✅ runs      | ✅ runs       | ❌ skipped |
| Push to `main`        | ✅ runs      | ✅ runs       | ✅ runs    |
