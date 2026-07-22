# TICKET-099 — Sign in with Apple & Google

**Owner:** dev-frontend (mobile) + dev-backend (auth)
**Date opened:** 2026-06-06
**Phase:** R — Revision & Hardening
**Source:** Founder request 2026-06-06 ("add Apple/Google sign-in if feasible").

## Goal
Add Sign in with Apple and Sign in with Google to the login + register screens, alongside the existing email/password.

## Background
Auth is currently email/password only (`mobile/app/(auth)/login.tsx`). This is **net-new** and ties into the thin auth server and the **backup identity from TICKET-094** (the blob is keyed to the account).

## Scope — in
- **Client:** `expo-apple-authentication` (iOS) + Google via `expo-auth-session`/Google. Add provider buttons to login + register.
- **Server (thin auth):** verify the provider identity token, find-or-create the user, issue the app session + refresh token, map provider `sub` → account.
- **Backup linkage:** the TICKET-094 backup blob is keyed to the resulting account so restore-after-reinstall works via provider login.
- **App Store rule:** offering Google requires offering **Sign in with Apple** on iOS — include both.

## Scope — out
Other providers (Facebook, etc.); account-linking UI to merge an existing email account with a provider (note as a follow-up).

## Acceptance criteria
1. A new user can sign up, and an existing user can log in, via **Apple** and via **Google**.
2. A valid app session + refresh token is issued; provider identity is verified server-side.
3. The backup identity (TICKET-094) is keyed to the account.
4. Existing email/password login is unaffected.

## ⚠️ Prerequisites (cannot be completed/verified in-sandbox)
- Apple Developer **Services ID** + private key; Google **OAuth client IDs** (iOS/Android/web).
- A **dev/EAS build** (native modules don't run in Expo Go); server secrets configured.
- Because of the above, code can be **scaffolded** but cannot be run or verified in this environment — verification requires a dev build + credentials.

## Test plan
On a dev build: Apple + Google sign-up and login happy paths; server token verification; refresh-token flow; existing email login still works; restore-after-reinstall via provider login (with TICKET-094).
