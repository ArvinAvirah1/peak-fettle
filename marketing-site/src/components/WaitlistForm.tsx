'use client';
// WaitlistForm — email capture that calls /api/waitlist (Resend)
// Phase B: Web Department
// dev-frontend — 2026-05-02

import { useState } from 'react';
import styles from './WaitlistForm.module.css';

type FormState = 'idle' | 'loading' | 'success' | 'error';

export default function WaitlistForm() {
    const [email, setEmail] = useState('');
    const [state, setState] = useState<FormState>('idle');
    const [message, setMessage] = useState('');

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const trimmed = email.trim();
        if (!trimmed) return;

        // T-05: validate email format client-side before hitting the API.
        // Mirrors the server-side regex so users get instant feedback.
        const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRe.test(trimmed)) {
            setState('error');
            setMessage('Please enter a valid email address (e.g. you@example.com).');
            return;
        }

        setState('loading');
        setMessage('');

        try {
            const res = await fetch('/api/waitlist', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ email: email.trim() }),
            });

            const data = await res.json();

            if (res.ok) {
                setState('success');
                setMessage(data.message || 'You\'re on the list! We\'ll be in touch.');
                setEmail('');
            } else {
                setState('error');
                setMessage(data.error || 'Something went wrong. Please try again.');
            }
        } catch {
            setState('error');
            setMessage('Network error. Please check your connection and try again.');
        }
    }

    return (
        <div className={styles.wrapper}>
            {state === 'success' ? (
                <div className={styles.successCard}>
                    <span className={styles.successIcon}>✓</span>
                    <h3 className={styles.successTitle}>You&apos;re on the list!</h3>
                    <p className={styles.successBody}>{message}</p>
                    <button
                        className={styles.resetBtn}
                        onClick={() => setState('idle')}
                    >
                        Add another email
                    </button>
                </div>
            ) : (
                <form onSubmit={handleSubmit} className={styles.form}>
                    <label htmlFor="waitlist-email" className={styles.label}>
                        Email address
                    </label>
                    <div className={styles.inputRow}>
                        <input
                            id="waitlist-email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            className={styles.input}
                            disabled={state === 'loading'}
                            required
                            autoComplete="email"
                        />
                        <button
                            type="submit"
                            className={styles.submitBtn}
                            disabled={state === 'loading' || !email.trim()}
                        >
                            {state === 'loading' ? (
                                <span className={styles.spinner} aria-hidden="true" />
                            ) : (
                                'Join'
                            )}
                            <span className="sr-only">
                                {state === 'loading' ? 'Sending…' : 'Join the waitlist'}
                            </span>
                        </button>
                    </div>

                    {state === 'error' && (
                        <p className={styles.errorMsg} role="alert">
                            {message}
                        </p>
                    )}

                    <p className={styles.privacy}>
                        No spam. One email when your beta spot is ready.
                        Unsubscribe at any time.
                    </p>
                </form>
            )}
        </div>
    );
}
