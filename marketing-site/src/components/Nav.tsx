'use client';
// Nav — sticky top nav with responsive hamburger menu
// T-10 (2026-05-03): aria-modal + focus trap on mobile menu
// T-12 (2026-05-03): visibility/opacity animation replaces display:none
// dev-frontend (Web Dept) — 2026-05-03

import { useState, useEffect, useRef, useCallback } from 'react';
import styles from './Nav.module.css';

export default function Nav() {
    const [open, setOpen] = useState(false);
    const hamburgerRef  = useRef<HTMLButtonElement>(null);
    const menuRef       = useRef<HTMLDivElement>(null);

    // Close on Escape; restore focus to hamburger
    useEffect(() => {
        if (!open) return;
        function onKey(e: KeyboardEvent) {
            if (e.key === 'Escape') {
                setOpen(false);
                hamburgerRef.current?.focus();
            }
        }
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open]);

    // T-10: focus trap — keep Tab/Shift+Tab inside the mobile menu while open
    const trapFocus = useCallback((e: React.KeyboardEvent) => {
        if (e.key !== 'Tab' || !menuRef.current) return;
        const focusable = Array.from(
            menuRef.current.querySelectorAll<HTMLElement>(
                'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last  = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    }, []);

    // Lock body scroll when menu is open
    useEffect(() => {
        document.body.style.overflow = open ? 'hidden' : '';
        return () => { document.body.style.overflow = ''; };
    }, [open]);

    function close() { setOpen(false); }

    return (
        <nav className={styles.nav} aria-label="Main navigation">
            <div className="container">
                <div className={styles.navInner}>
                    {/* Logo */}
                    <span className={styles.logo}>
                        <span className={styles.logoMark}>▲</span>
                        Peak Fettle
                    </span>

                    {/* Desktop links */}
                    <ul className={styles.desktopLinks} role="list">
                        <li><a href="#features">Features</a></li>
                        <li><a href="#waitlist" className={styles.navCta}>Early Access</a></li>
                    </ul>

                    {/* Hamburger (mobile only) */}
                    <button
                        ref={hamburgerRef}
                        className={styles.hamburger}
                        aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
                        aria-expanded={open}
                        aria-controls="mobile-menu"
                        onClick={() => setOpen(prev => !prev)}
                    >
                        <span className={`${styles.bar} ${open ? styles.barTop : ''}`} />
                        <span className={`${styles.bar} ${open ? styles.barMid : ''}`} />
                        <span className={`${styles.bar} ${open ? styles.barBot : ''}`} />
                    </button>
                </div>
            </div>

            {/* T-12: overlay uses visibility/opacity — no display:none so transition works */}
            {/* T-10: role=dialog + aria-modal so screen readers don't escape into page behind */}
            <div
                id="mobile-menu"
                ref={menuRef}
                role="dialog"
                aria-modal="true"
                aria-label="Navigation menu"
                className={`${styles.mobileMenu} ${open ? styles.mobileMenuOpen : ''}`}
                onKeyDown={trapFocus}
            >
                <ul className={styles.mobileLinks} role="list">
                    <li>
                        <a href="#features" className={styles.mobileLink} onClick={close}>
                            Features
                        </a>
                    </li>
                    <li>
                        <a href="#waitlist" className={`${styles.mobileLink} ${styles.mobileLinkCta}`} onClick={close}>
                            Early Access
                        </a>
                    </li>
                </ul>
                <button className={styles.mobileClose} onClick={close}>
                    Close menu
                </button>
            </div>

            {/* Backdrop — closes menu on outside click */}
            <div
                className={`${styles.backdrop} ${open ? styles.backdropVisible : ''}`}
                onClick={close}
                aria-hidden="true"
            />
        </nav>
    );
}
