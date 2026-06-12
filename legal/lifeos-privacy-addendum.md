# Privacy Policy Addendum — Life OS Companion App (DRAFT)

*Status: DRAFT for human/legal review — TICKET-100 #5. Not published.
Prepared 2026-06-11. The final name replaces "Life OS" throughout (Q7).*

## What this addendum covers

This addendum extends the Peak Fettle privacy policy to the Life OS companion
application, which shares your Peak Fettle account.

## Data the Life OS app handles

**Stored only on your device (never transmitted in readable form):**
- Habits, habit stacks, and completion history
- Goals, milestones, and weekly review reflections
- Mood check-ins, optional notes, and exercise completions
- Self-assessment survey answers and generated plans
- Focus/blocking configurations and on-device focus statistics

**Screen-time and app-usage data:** processed entirely on your device by the
operating system's Screen Time framework. Apple's FamilyControls and
DeviceActivity APIs do not permit this data to be exported; we never receive
it, and no copy exists on our servers.

**Stored on our servers:**
- Your account credentials and session tokens (shared with Peak Fettle)
- A subscription entitlement flag
- If you enable backup: an **end-to-end encrypted** backup blob. It is
  encrypted on your device before upload with a key derived from your recovery
  code; we cannot read its contents.
- If you enable cross-app features: a per-day boolean activity marker used for
  the shared streak (no content, no detail).

## What we do not do

- We do not sell or share Life OS data with third parties.
- We do not use mood, goal, journal, or survey content for advertising or
  model training.
- We do not receive your screen-time or app-usage data (OS-enforced).

## Your controls

- Export: all local data can be exported from Settings → Your data.
- Delete: deleting your account removes server-side blobs and the entitlement
  record; local data is wiped on sign-out/uninstall.
- Backups can be disabled at any time; existing blobs can be deleted from
  Settings.

## Open items for counsel review

1. Confirm "end-to-end encrypted" phrasing matches the implemented mechanism
   (client-side key derivation; recovery-code custody with the user).
2. Confirm the cross-app activity marker is adequately disclosed.
3. App Store category language: Productivity positioning; confirm no wording
   triggers health-app data-use requirements beyond what we satisfy.
4. Jurisdictional review for GDPR (special-category considerations for mood
   data, even when stored client-side; identify lawful basis statements).
