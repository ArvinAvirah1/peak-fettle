'use client';
// Sticky top nav. Multi-page links + a primary "Get the app" CTA.
// Accessible mobile menu: aria-modal dialog, focus trap, Esc to close, scroll lock.

import Link from 'next/link';
import { useState, useEffect, useRef, useCallback } from 'react';
import { NAV_LINKS } from '@/lib/site';
import Logo from './Logo';
import styles from './Nav.module.css';

export default function Nav() {
    const [open, setOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);
    const hamburgerRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    // Add a solid background once the page is scrolled.
    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 12);
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    // Esc closes the mobile menu and restores focus.
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setOpen(false);
                hamburgerRef.current?.focus();
            }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open]);

    const trapFocus = useCallback((e: React.KeyboardEvent) => {
        if (e.key !== 'Tab' || !menuRef.current) return;
        const focusable = Array.from(
            menuRef.current.querySelectorAll<HTMLElement>(
                'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    }, []);

    useEffect(() => {
        document.body.style.overflow = open ? 'hidden' : '';
        return () => { document.body.style.overflow = ''; };
    }, [open]);

    const close = () => setOpen(false);

    return (
        <nav className={`${styles.nav} ${scrolled ? styles.scrolled : ''}`} aria-label="Main navigation">
            <div className="container">
                <div className={styles.inner}>
                    <Link href="/" className={styles.logo} aria-label="Peak Fettle home">
                        <Logo className={styles.logoMark} />
                        <span>Peak Fettle</span>
                    </Link>

                    <ul className={styles.desktopLinks} role="list">
                        {NAV_LINKS.map((l) => (
                            <li key={l.href}><Link href={l.href}>{l.label}</Link></li>
                        ))}
                        <li className={styles.stamp} aria-hidden="true">est. wk 01</li>
                        <li>
                            <Link href="/#download" className={styles.cta}>Get the app</Link>
                        </li>
                    </ul>

                    <button
                        ref={hamburgerRef}
                        className={styles.hamburger}
                        aria-label={open ? 'Close menu' : 'Open menu'}
                        aria-expanded={open}
                        aria-controls="mobile-menu"
                        onClick={() => setOpen((p) => !p)}
                    >
                        <span className={`${styles.bar} ${open ? styles.barTop : ''}`} />
                        <span className={`${styles.bar} ${open ? styles.barMid : ''}`} />
                        <span className={`${styles.bar} ${open ? styles.barBot : ''}`} />
                    </button>
                </div>
            </div>

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
                    {NAV_LINKS.map((l) => (
                        <li key={l.href}>
                            <Link href={l.href} className={styles.mobileLink} onClick={close}>{l.label}</Link>
                        </li>
                    ))}
                    <li>
                        <Link href="/#download" className={`${styles.mobileLink} ${styles.mobileLinkCta}`} onClick={close}>
                            Get the app
                        </Link>
                    </li>
                </ul>
            </div>

            <div
                className={`${styles.backdrop} ${open ? styles.backdropVisible : ''}`}
                onClick={close}
                aria-hidden="true"
            />
        </nav>
    );
}
