# Sign-in setup checklist — 2026-06-12

Complete, click-by-click instructions to finish Apple + Google sign-in (TICKET-099)
and recover from the login-screen boot crash. Total active work: ~45–60 min of
console clicking + one EAS build (~30 min) + TestFlight processing.

**Context:** the app on your phone crashes at boot because the login screen's
Google button was built without a Google client ID (`EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`
was never set). The code fix (hide the button when unconfigured) is already in the
working tree at `mobile/src/components/auth/OAuthButtons.tsx` — it just needs to be
committed, pushed, and rebuilt. Parts 1–5 below add the actual credentials so the
buttons work; Part 6 ships it all in ONE build.

> **Fastest-recovery alternative:** if you just want back into the app today, skip
> straight to Part 6 (commit + push + build) without doing Parts 1–5. You'll get a
> working app with email/password login and no OAuth buttons. You can do Parts 1–5
> later and rebuild again.

---

## Part 1 — Create the Google OAuth client IDs (~20 min)

You need two client IDs today (iOS + Web). Android comes later when you ship Android.

### 1a. Open Google Cloud Console and pick a project

1. Go to **https://console.cloud.google.com/** and sign in with the Google account
   that should permanently own Peak Fettle's credentials (aavirah23@gmail.com is fine;
   you can migrate to an org account later).
2. At the top-left, next to the "Google Cloud" logo, click the **project picker**
   dropdown. If you don't already have a Peak Fettle project, click **NEW PROJECT**
   (top-right of the picker dialog) → Project name: `Peak Fettle` → **CREATE**.
3. Wait for the notification bell to confirm creation, then **select the project**
   in the picker so everything below happens inside it.

### 1b. Configure the OAuth consent screen (required before any client IDs)

Google's UI recently renamed this; you'll see either "OAuth consent screen" under
**APIs & Services**, or a left-nav item called **Google Auth Platform**. Same thing.

1. Left hamburger menu → **APIs & Services** → **OAuth consent screen**
   (or **Google Auth Platform** → **Branding/Get started**).
2. If asked for User Type: choose **External** → **CREATE**.
3. App information:
   - App name: `Peak Fettle`
   - User support email: your email
   - Developer contact email: your email
   - Logo/links: optional, skip for now.
   Click **SAVE AND CONTINUE**.
4. Scopes page: **do not add anything** — sign-in only needs the default
   `openid` / `email` / `profile`, which require no review. **SAVE AND CONTINUE**.
5. Test users page: click **+ ADD USERS** and add **every Google account you'll
   test sign-in with** (at minimum aavirah23@gmail.com). **SAVE AND CONTINUE**.
   - ⚠️ While the app's Publishing status is **Testing**, ONLY these listed
     accounts can sign in. Anyone else gets `access_denied`.
6. When you're ready for real users (can be later): go back to the consent screen
   page and click **PUBLISH APP**. With only basic scopes there is no Google
   review — it takes effect immediately.

### 1c. Create the iOS client ID

1. **APIs & Services** → **Credentials** (left nav) → **+ CREATE CREDENTIALS**
   (top bar) → **OAuth client ID**.
2. Application type: **iOS**.
3. Name: `Peak Fettle iOS`.
4. Bundle ID: `com.peakfettle.app`  ← must match exactly (it's `ios.bundleIdentifier`
   in `mobile/app.json`).
5. App Store ID / Team ID: leave blank for now.
6. Click **CREATE**. A dialog shows two things — **copy both into a note**:
   - **Client ID** — looks like
     `1234567890-abc123def456.apps.googleusercontent.com`
   - **iOS URL scheme** — the reversed form, looks like
     `com.googleusercontent.apps.1234567890-abc123def456`
   (If you close the dialog, click the client's name in the Credentials list to
   see both again — the URL scheme is under "Additional information".)

### 1d. Create the Web client ID

1. **+ CREATE CREDENTIALS** → **OAuth client ID** again.
2. Application type: **Web application**.
3. Name: `Peak Fettle Web`.
4. Authorized JavaScript origins / redirect URIs: **leave empty** — the native app
   doesn't use them; this client only serves as the `webClientId` fallback.
5. **CREATE** → copy the **Client ID**.

### 1e. (Later — Android) 

When you ship Android: **+ CREATE CREDENTIALS** → OAuth client ID → **Android** →
package name `com.peakfettle.app` + the SHA-1 fingerprint from
`cd mobile && eas credentials -p android` (Keystore section). Not needed today.

---

## Part 2 — Put the client IDs into the build config (~5 min)

`EXPO_PUBLIC_*` variables are baked into the JS bundle **at build time**. They must
exist in the environment of every EAS build profile you actually install.

### 2a. `mobile/eas.json`

Replace the `build` section so each profile carries the Google vars (paste your real
IDs over the placeholders — keep the quotes):

```json
"build": {
  "development": {
    "developmentClient": true,
    "distribution": "internal",
    "env": {
      "EXPO_PUBLIC_API_URL": "http://localhost:3001",
      "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID": "PASTE-IOS-CLIENT-ID.apps.googleusercontent.com",
      "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID": "PASTE-WEB-CLIENT-ID.apps.googleusercontent.com"
    }
  },
  "preview": {
    "distribution": "internal",
    "env": {
      "EXPO_PUBLIC_API_URL": "https://peak-fettle-production.up.railway.app",
      "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID": "PASTE-IOS-CLIENT-ID.apps.googleusercontent.com",
      "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID": "PASTE-WEB-CLIENT-ID.apps.googleusercontent.com"
    }
  },
  "production": {
    "autoIncrement": true,
    "env": {
      "EXPO_PUBLIC_API_URL": "https://peak-fettle-production.up.railway.app",
      "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID": "PASTE-IOS-CLIENT-ID.apps.googleusercontent.com",
      "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID": "PASTE-WEB-CLIENT-ID.apps.googleusercontent.com"
    }
  }
}
```

(`EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` gets added the same way when Android ships.)

### 2b. `mobile/.env` (local dev only)

So the buttons also work in `npx expo start` dev sessions, append:

```
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=PASTE-IOS-CLIENT-ID.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=PASTE-WEB-CLIENT-ID.apps.googleusercontent.com
```

These are public identifiers, not secrets — safe in a client bundle and in eas.json.

---

## Part 3 — Register the Google redirect URL scheme in iOS (~2 min)

When Google sign-in finishes, the in-app browser hands control back to the app via a
custom URL scheme — specifically the **reversed iOS client ID** from step 1c. If iOS
doesn't know that scheme belongs to Peak Fettle, sign-in completes in the browser and
**never returns to the app** (it just hangs).

In `mobile/app.json`, change the `scheme` line (currently `"scheme": "peak-fettle"`)
to an array containing both schemes:

```json
"scheme": [
  "peak-fettle",
  "com.googleusercontent.apps.PASTE-THE-REST-OF-YOUR-IOS-CLIENT-ID"
],
```

Use the exact **iOS URL scheme** string Google showed you in step 1c. Keep
`peak-fettle` first — expo-router and deep links use it.

---

## Part 4 — Finish Apple sign-in config (~10 min)

The `expo-apple-authentication` package is installed, but the **config plugin and
entitlement are missing**, so the Apple button currently errors when pressed.

### 4a. `mobile/app.json` — two edits

1. Inside the `"ios"` object, add:
   ```json
   "usesAppleSignIn": true,
   ```
   (e.g. right under `"bundleIdentifier": "com.peakfettle.app",`)
2. In the `"plugins"` array, add `"expo-apple-authentication"` as a new entry
   (e.g. right after `"expo-web-browser"`).

These add the `com.apple.developer.applesignin` entitlement at prebuild.

### 4b. Apple Developer portal capability

The App ID `com.peakfettle.app` must have the **Sign In with Apple** capability.
EAS usually syncs this automatically during the next build (it compares your
entitlements with the App ID and updates it + regenerates the provisioning profile).
To verify or do it manually:

1. Go to **https://developer.apple.com/account** → **Certificates, Identifiers &
   Profiles** → **Identifiers**.
2. Click **com.peakfettle.app** (and also the widget id `com.peakfettle.app.widget`
   — the widget does NOT need the capability, only the main app).
3. In the Capabilities list, tick **Sign In with Apple** → **Save** → confirm.
4. If you changed it manually, the old provisioning profile is now invalid — that's
   fine; the next `eas build` regenerates it (answer "yes" if it asks).

No Apple **Services ID or private key** is needed: the native flow returns an
identity token that the server verifies against Apple's public keys; the audience
is just the bundle ID. (The old handoff note about a Services ID was for a web flow
we're not using.)

Note: testing Apple sign-in requires the phone to be **signed into iCloud**.

---

## Part 5 — Set the server env vars on Railway (~5 min)

`POST /auth/oauth` deliberately returns **501** until these exist
(`peak-fettle-agents/server/lib/oauthVerify.js`).

1. Go to **https://railway.app** → open the Peak Fettle project → click the
   **server service** (the one serving peak-fettle-production.up.railway.app).
2. Open the **Variables** tab → **+ New Variable**, add:

   | Variable | Value |
   |---|---|
   | `GOOGLE_OAUTH_AUDIENCE` | the **iOS** client ID — full string ending `.apps.googleusercontent.com` |
   | `APPLE_OAUTH_AUDIENCE` | `com.peakfettle.app` |

   ⚠️ `GOOGLE_OAUTH_AUDIENCE` must be the **iOS** client ID, NOT the web one — on
   iOS, expo-auth-session requests the token with the iOS client ID, so that's the
   `aud` claim the server must accept.
3. Railway redeploys the service when variables change (or click **Deploy** if it
   shows a pending change banner). Wait for the deploy to go green.

**Known limitation for later:** the server accepts a **single** audience string per
provider. When Android ships (its tokens carry the Android client ID), the server
needs a ~3-line change to accept a list. Tracked, not needed now.

---

## Part 6 — Commit, push, rebuild, verify (~10 min active + build time)

EAS builds from **origin/main**, not your working tree — pushing is mandatory.

1. From the repo root:
   ```
   git add mobile/src/components/auth/OAuthButtons.tsx mobile/app.json mobile/eas.json mobile/.env
   git commit -m "TICKET-099: guard OAuth buttons against missing client IDs; wire Google/Apple sign-in config"
   git push origin main
   ```
   (Fold in or leave out your other in-flight changes as you prefer — but the four
   files above must be on origin/main.)
2. Build:
   ```
   cd mobile
   eas build --platform ios --profile production
   ```
   (~20–35 min. Use `--profile preview` instead if you install via internal
   distribution rather than TestFlight.)
3. Submit to TestFlight when the build finishes:
   ```
   eas submit --platform ios --latest
   ```
   then wait for App Store Connect processing (5–30 min) and install the new build
   from the TestFlight app.

### Verify on the phone

- App boots to the **login screen** (no "failed to start").
- Below the email/password form you see the **"or" divider**, a black/white
  **Sign in with Apple** button, and a **Continue with Google** button.
- **Google:** tap → in-app browser opens Google → pick a **test-user** account
  (step 1b.5) → browser closes itself → you land logged-in in the app.
- **Apple:** tap → native Face ID sheet → continue → logged in.
- **Email/password:** register a fresh account (the old test account is deleted)
  and log in.

### If something misbehaves

| Symptom | Cause / fix |
|---|---|
| No Google button, console warns `EXPO_PUBLIC_GOOGLE_*_CLIENT_ID not set` | env vars missing from the **profile you built** in eas.json, or build ran before the push landed |
| Google completes in browser but never returns to the app | reversed-client-ID scheme missing or typo'd in `app.json` `scheme` (Part 3) |
| Google shows `access_denied` for an account | that account isn't in the consent screen Test users list, and app not published (1b) |
| Sign-in returns to app but errors; server logs **501** | Railway vars not set / not deployed (Part 5) |
| Server logs **401 invalid_token** | audience mismatch — `GOOGLE_OAUTH_AUDIENCE` is the web ID instead of the iOS ID, or `APPLE_OAUTH_AUDIENCE` ≠ `com.peakfettle.app` |
| Apple button errors immediately when pressed | plugin/`usesAppleSignIn` missing (Part 4a) or App ID capability off (4b); also confirm phone is signed into iCloud |
