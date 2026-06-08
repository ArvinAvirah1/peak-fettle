'use client';
// A phone frame around an app screen. If `src` points to a real screenshot in
// /public/screens it is shown; if that file is missing (404 / decode error)
// we fall back to the on-brand SVG screen so the mockup is never empty.

import { useState, type ReactNode } from 'react';
import styles from './DeviceMockup.module.css';

type Props = {
    /** real screenshot path, e.g. /screens/log.png — optional */
    src?: string;
    alt: string;
    /** SVG stand-in shown until a real screenshot exists */
    fallback: ReactNode;
    className?: string;
};

export default function DeviceMockup({ src, alt, fallback, className = '' }: Props) {
    const [failed, setFailed] = useState(false);
    const showImg = src && !failed;

    return (
        <div className={`${styles.phone} ${className}`}>
            <div className={styles.notch} aria-hidden="true" />
            <div className={styles.screen}>
                {showImg ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={src} alt={alt} className={styles.img} width={390} height={844} onError={() => setFailed(true)} loading="lazy" />
                ) : (
                    <div className={styles.svgWrap} role="img" aria-label={alt}>{fallback}</div>
                )}
            </div>
            <span className={styles.btnPower} aria-hidden="true" />
            <span className={styles.btnVolUp} aria-hidden="true" />
            <span className={styles.btnVolDn} aria-hidden="true" />
        </div>
    );
}
