// POST /api/waitlist — "get notified / launch list" capture.
//
// Sends two emails via the Resend REST API (no SDK dependency):
//   1. a confirmation to the subscriber
//   2. an internal notification to the team
//
// Requires env vars:
//   RESEND_API_KEY     — https://resend.com/api-keys
//   RESEND_FROM_EMAIL  — verified sender, e.g. "Peak Fettle <noreply@peakfettle.com>"
//   RESEND_WAITLIST_TO — internal notification address
//
// If RESEND_API_KEY is absent (e.g. a preview deploy before keys are set), the
// endpoint degrades gracefully: it validates and returns success without
// sending, and logs a warning — so the form demo never shows a scary error.

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUCCESS = "You're on the list! We'll email you the moment Peak Fettle lands on your store.";

// Best-effort in-instance dedupe so a double-submit doesn't double-send.
const seenEmails = new Set<string>();
const SEEN_LIMIT = 10_000;

type Email = { from: string; to: string[]; subject: string; html?: string; text?: string };

async function sendEmail(payload: Email): Promise<void> {
    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`Resend ${res.status}: ${detail}`);
    }
}

export async function POST(req: NextRequest) {
    let body: { email?: string };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
    }

    const email = (body.email || '').trim().toLowerCase();
    if (!email || !EMAIL_RE.test(email)) {
        return NextResponse.json({ error: 'Please provide a valid email address.' }, { status: 422 });
    }

    if (seenEmails.has(email)) {
        return NextResponse.json({ message: SUCCESS }, { status: 200 });
    }

    // Graceful no-key fallback (preview before secrets are configured).
    if (!process.env.RESEND_API_KEY) {
        console.warn('[waitlist] RESEND_API_KEY not set — skipping send for', email);
        return NextResponse.json({ message: SUCCESS }, { status: 200 });
    }

    const from = process.env.RESEND_FROM_EMAIL || 'Peak Fettle <noreply@peakfettle.com>';
    const notifyTo = process.env.RESEND_WAITLIST_TO || 'founder@peakfettle.com';

    try {
        await sendEmail({
            from,
            to: [email],
            subject: "You're on the Peak Fettle list 💪",
            html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="background:#06080F;color:#E8F1F8;font-family:Inter,system-ui,sans-serif;
             padding:40px 20px;max-width:560px;margin:0 auto;line-height:1.6">
  <div style="margin-bottom:32px">
    <span style="color:#2DD4BF;font-size:1.5rem;font-weight:700">Peak Fettle</span>
  </div>
  <h1 style="font-size:1.5rem;font-weight:700;margin-bottom:1rem">You&rsquo;re on the list!</h1>
  <p style="color:#98ACC4;margin-bottom:1.25rem">
    Thanks for signing up. We&rsquo;ll email you the moment Peak Fettle is available
    to download &mdash; and then only when it matters.
  </p>
  <p style="color:#98ACC4;margin-bottom:1.25rem">
    In the meantime: <strong style="color:#E8F1F8">one set is better than none</strong>.
    Every rep you log is one notch tighter.
  </p>
  <p style="color:#98ACC4;font-size:0.85rem;margin-top:2rem;border-top:1px solid rgba(45,212,191,0.15);
            padding-top:1rem">
    You&rsquo;re receiving this because you signed up at peakfettle.com.
  </p>
</body>
</html>`,
        });

        await sendEmail({
            from,
            to: [notifyTo],
            subject: `[Peak Fettle] New signup: ${email}`,
            text: `New launch-list signup: ${email}\nTime: ${new Date().toISOString()}`,
        });

        if (seenEmails.size >= SEEN_LIMIT) {
            const oldest = seenEmails.values().next().value;
            if (oldest) seenEmails.delete(oldest);
        }
        seenEmails.add(email);

        return NextResponse.json({ message: SUCCESS }, { status: 200 });
    } catch (err) {
        console.error('[waitlist] send error:', err);
        return NextResponse.json({ error: 'Failed to send confirmation. Please try again.' }, { status: 500 });
    }
}
