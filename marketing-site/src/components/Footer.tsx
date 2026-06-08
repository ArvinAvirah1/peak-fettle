import Link from 'next/link';
import { SITE, FOOTER_LINKS } from '@/lib/site';
import Logo from './Logo';
import styles from './Footer.module.css';

export default function Footer() {
    const year = 2026; // static to keep the page deterministic / cache-friendly
    return (
        <footer className={styles.footer}>
            <div className="container">
                <div className={styles.top}>
                    <div className={styles.brand}>
                        <Link href="/" className={styles.logo} aria-label="Peak Fettle home">
                            <Logo className={styles.logoMark} />
                            <span>Peak Fettle</span>
                        </Link>
                        <p className={styles.tagline}>
                            Train at peak. Measured. Honest progress for every athlete —
                            from your first session to your hundredth PR.
                        </p>
                        <a href={`mailto:${SITE.email}`} className={styles.email}>{SITE.email}</a>
                    </div>

                    <nav className={styles.cols} aria-label="Footer">
                        {Object.entries(FOOTER_LINKS).map(([group, links]) => (
                            <div key={group} className={styles.col}>
                                <h3 className={styles.colTitle}>{group}</h3>
                                <ul role="list">
                                    {links.map((l) => (
                                        <li key={l.href}>
                                            {l.href.startsWith('mailto:') ? (
                                                <a href={l.href}>{l.label}</a>
                                            ) : (
                                                <Link href={l.href}>{l.label}</Link>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </nav>
                </div>

                <div className={styles.bottom}>
                    <p>© {year} {SITE.name}. All rights reserved.</p>
                    <p className={styles.fineprint}>
                        Peak Fettle is a training tool, not medical advice. Consult a
                        professional before starting a new program.
                    </p>
                </div>
            </div>
        </footer>
    );
}
