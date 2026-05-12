// POST /api/waitlist — add an email to the waitlist, confirm via Resend
// Phase B: Web Department
// dev-backend — 2026-05-02
//
// Requires env vars:
//   RESEND_API_KEY         — Resend API key (https://resend.com/api-keys)
//   RESEND_FROM_EMAIL      — verified sender, e.g. "Peak Fettle <noreply@peakfettle.com>"
//   RESEND_WAITLIST_TO     — internal notification address, e.g. "founder@peakfettle.com"
//
// The route:
//   1. Validates the email with a simple regex.
//   2. Sends a confirmation email to the subscriber via Resend.
//   3. Sends a notification email to the team so signups are visible in real time.
// A proper waitlist DB table (waitlist_emails) is Phase D work — for Phase B
// we rely on Resend's audience feature or a simple CSV export from the inbox.

import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Z-05 (2026-05-11): duplicate-email guard. Submitting the same address twice
// previously sent two confirmation emails and two founder notifications.
//
// We use a module-level Set as a best-effort dedupe within a single
// serverless-function instance — sufficient to catch the common case
// (user clicking "Submit" twice, or a double-bounce from a flaky network).
// Cross-instance dedupe will land in Phase D when the `waitlist_emails`
// Supabase table is created and we can use a UNIQUE constraint there.
//
// We intentionally do not error on duplicates — the user-facing flow should
// look identical to a fresh submit (same success message) so duplicates
// don't leak signup state. We only skip the email sends.
const seenEmails = new Set<string>();
// Cap the Set so a long-running instance doesn't grow unbounded.
const SEEN_EMAILS_LIMIT = 10_000;

export async function POST(req: NextRequest) {
    // ---- Parse body ----
    let body: { email?: string };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
    }

    const email = (body.email || '').trim().toLowerCase();

    if (!email || !EMAIL_RE.test(email)) {
        return NextResponse.json(
            { error: 'Please provide a valid email address.' },
            { status: 422 }
        );
    }

    // ---- Z-05: duplicate-email short-circuit ----
    if (seenEmails.has(email)) {
        return NextResponse.json(
            { message: "You're on the list! We'll be in touch when your beta spot is ready." },
            { status: 200 }
        );
    }

    // ---- Send emails ----
    const from     = process.env.RESEND_FROM_EMAIL  || 'Peak Fettle <noreply@peakfettle.com>';
    const notifyTo = process.env.RESEND_WAITLIST_TO || 'founder@peakfettle.com';

    try {
        // Confirmation to subscriber
        await resend.emails.send({
            from,
            to:      [email],
            subject: "You're on the Peak Fettle waitlist 🏔️",
            html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="background:#06080F;color:#E2EEF7;font-family:Inter,system-ui,sans-serif;
             padding:40px 20px;max-width:560px;margin:0 auto;line-height:1.6">
  <div style="margin-bottom:32px">
    <span style="color:#2DD4BF;font-size:1.5rem;font-weight:700">&#9650; Peak Fettle</span>
  </div>
  <h1 style="font-size:1.5rem;font-weight:700;margin-bottom:1rem">
    You&rsquo;re on the list!
  </h1>
  <p style="color:#8FA4BC;margin-bottom:1.25rem">
    Thanks for joining the Peak Fettle early access list. We&rsquo;re opening
    beta spots to a small group first &mdash; we&rsquo;ll email you as soon as yours
    is ready.
  </p>
  <p style="color:#8FA4BC;margin-bottom:1.25rem">
    In the meantime: <strong style="color:#E2EEF7">one set is better than none</strong>.
    Every rep you log is one notch tighter.
  </p>
  <p style="color:#8FA4BC;font-size:0.85rem;margin-top:2rem;border-top:1px solid rgba(45,212,191,0.15);
            padding-top:1rem">
    You&rsquo;re receiving this because you signed up at peakfettle.com.
    No further emails until your beta spot is ready.
  </p>
</body>
</html>
            `,
        });

        // Internal notification to founder
        await resend.emails.send({
            from,
            to:      [notifyTo],
            subject: `[Peak Fettle] New waitlist signup: ${email}`,
            text:    `New waitlist signup: ${email}\nTime: ${new Date().toISOString()}`,
        });

        // Z-05: record successful send so a re-submit of the same address
        // doesn't trigger another pair of emails. Only added on success
        // so a transient Resend failure doesn't lock the user out.
        if (seenEmails.size >= SEEN_EMAILS_LIMIT) {
            // Drop the oldest insertion (Set preserves insertion order).
            const oldest = seenEmails.values().next().value;
            if (oldest) seenEmails.delete(oldest);
        }
        seenEmails.add(email);

        return NextResponse.json(
            { message: "You're on the list! We'll be in touch when your beta spot is ready." },
            { status: 200 }
        );

    } catch (err) {
        console.error('[waitlist] Resend error:', err);
        return NextResponse.json(
            { error: 'Failed to send confirmation. Please try again.' },
            { status: 500 }
        );
    }
}
