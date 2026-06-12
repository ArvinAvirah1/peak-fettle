// On-brand SVG renderings of the Peak Fettle app UI, used as stand-ins inside
// device mockups until real screenshots are exported to /public/screens.
// Colors match the app's "Deep Ocean" theme (navy #0A0E1A + accent #00D4C8).
// Each screen is a 390×844 (logical iPhone) viewBox so it fills a phone frame.
//
// Every number shown is A.R.'s week-6 reading from src/lib/story.ts — the
// page's chart visibly continues inside the product (see the data
// constitution in story.ts).

import { STORY, PLATE_WEEK, PLATE_SETS, PLATE_PERCENTILE, LIFTER } from '@/lib/story';

const W = 390;
const H = 844;

function Frame({ children }: { children: React.ReactNode }) {
    return (
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <rect width={W} height={H} fill="#0A0E1A" />
            {children}
        </svg>
    );
}

const A = '#00D4C8';
const TXT = '#FFFFFF';
const MUT = '#94A3B8';
const CARD = '#0F1629';
const SUB = '#151D35';

const fmtKg = (v: number) => (Number.isInteger(v) ? `${v} kg` : `${v.toFixed(1)} kg`);

export function ScreenLog() {
    return (
        <Frame>
            <text x="24" y="92" fill={MUT} fontSize="14" fontFamily="sans-serif">Week 6 · Push day</text>
            <text x="24" y="120" fill={TXT} fontSize="26" fontWeight="700" fontFamily="sans-serif">Bench Press</text>
            {PLATE_SETS.map((s, i) => (
                <g key={i} transform={`translate(24 ${150 + i * 76})`}>
                    <rect width="342" height="62" rx="14" fill={CARD} />
                    <text x="20" y="38" fill={MUT} fontSize="15" fontFamily="sans-serif">Set {i + 1}</text>
                    <text x="110" y="38" fill={TXT} fontSize="18" fontWeight="600" fontFamily="sans-serif">{fmtKg(s.weightKg)}</text>
                    <text x="220" y="38" fill={MUT} fontSize="16" fontFamily="sans-serif">× {s.reps}</text>
                    {s.pr && (
                        <g transform="translate(270 16)">
                            <rect width="52" height="30" rx="15" fill="#00D4C8" opacity="0.16" />
                            <text x="26" y="20" fill={A} fontSize="13" fontWeight="700" textAnchor="middle" fontFamily="sans-serif">PR</text>
                        </g>
                    )}
                </g>
            ))}
            {/* add-set button */}
            <g transform="translate(24 392)">
                <rect width="342" height="56" rx="14" fill={SUB} stroke="#00D4C8" strokeOpacity="0.3" strokeDasharray="4 4" />
                <text x="171" y="35" fill={A} fontSize="16" fontWeight="600" textAnchor="middle" fontFamily="sans-serif">+ Add set</text>
            </g>
            {/* summary */}
            <g transform="translate(24 480)">
                <rect width="342" height="120" rx="18" fill={CARD} />
                <text x="20" y="40" fill={MUT} fontSize="13" fontFamily="sans-serif">ESTIMATED 1RM</text>
                <text x="20" y="76" fill={TXT} fontSize="30" fontWeight="700" fontFamily="sans-serif">{PLATE_WEEK.e1rm.toFixed(1)} kg</text>
                <text x="200" y="40" fill={MUT} fontSize="13" fontFamily="sans-serif">STRENGTH SCORE</text>
                <text x="200" y="76" fill={A} fontSize="30" fontWeight="700" fontFamily="sans-serif">{PLATE_WEEK.score}</text>
                <rect x="20" y="92" width="302" height="6" rx="3" fill={SUB} />
                <rect x="20" y="92" width={302 * PLATE_WEEK.score / 1000} height="6" rx="3" fill={A} />
            </g>
            {/* tab bar */}
            <TabBar active={0} />
        </Frame>
    );
}

export function ScreenRank() {
    // a simple distribution curve with the user's position marked
    const pts: string[] = [];
    for (let i = 0; i <= 60; i++) {
        const x = 24 + (i / 60) * 342;
        const t = (i - 32) / 13;
        const y = 360 - Math.exp(-t * t) * 150;
        pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    // PLATE_PERCENTILE of the curve's width — just left of the bulge's centre
    const ux = 24 + 0.47 * 342;
    return (
        <Frame>
            <text x="24" y="92" fill={MUT} fontSize="14" fontFamily="sans-serif">Bench Press · your cohort</text>
            <text x="24" y="120" fill={TXT} fontSize="26" fontWeight="700" fontFamily="sans-serif">Where you rank</text>

            <g transform="translate(0 60)">
                <polyline points={pts.join(' ')} fill="none" stroke={MUT} strokeOpacity="0.4" strokeWidth="2" />
                <polygon points={`24,360 ${pts.join(' ')} 366,360`} fill="#00D4C8" opacity="0.08" />
                {/* user marker */}
                <line x1={ux} y1="190" x2={ux} y2="360" stroke={A} strokeWidth="2" />
                <circle cx={ux} cy="190" r="6" fill={A} />
                <g transform={`translate(${ux - 60} 136)`}>
                    <rect width="120" height="40" rx="10" fill={A} />
                    <text x="60" y="26" fill="#06121A" fontSize="16" fontWeight="700" textAnchor="middle" fontFamily="sans-serif">{PLATE_PERCENTILE}th pct</text>
                </g>
            </g>

            <g transform="translate(24 500)">
                <rect width="342" height="150" rx="18" fill={CARD} />
                <text x="20" y="38" fill={MUT} fontSize="13" fontFamily="sans-serif">MATCHED ON</text>
                <Tag x={20} y={54} label="Male" />
                <Tag x={92} y={54} label="Age 25–34" />
                <Tag x={206} y={54} label={`${LIFTER.yearsTrained} yrs trained`} />
                <text x="20" y="128" fill={TXT} fontSize="15" fontFamily="sans-serif">Honest comparisons — never vs. veterans.</text>
            </g>
            <TabBar active={1} />
        </Frame>
    );
}

export function ScreenScore() {
    // The in-app trend chart draws the page's own dataset, weeks 1–6 —
    // the essay's line continues inside the product.
    const crop = STORY.slice(0, 6);
    const lo = 82, hi = 95;
    const pts = crop
        .map((p, i) => {
            const x = 40 + (i / (crop.length - 1)) * 310;
            const y = 470 - ((p.e1rm - lo) / (hi - lo)) * 90;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(' ');
    const ring = 578; // 2πr, r=92
    const offset = ring * (1 - PLATE_WEEK.score / 1000);
    return (
        <Frame>
            <text x="24" y="92" fill={MUT} fontSize="14" fontFamily="sans-serif">Overall</text>
            <text x="24" y="120" fill={TXT} fontSize="26" fontWeight="700" fontFamily="sans-serif">Strength score</text>

            <g transform="translate(195 250)">
                <circle r="92" fill="none" stroke={SUB} strokeWidth="14" />
                <circle r="92" fill="none" stroke={A} strokeWidth="14" strokeLinecap="round"
                    strokeDasharray={ring} strokeDashoffset={offset.toFixed(0)} transform="rotate(-90)" />
                <text y="2" fill={TXT} fontSize="56" fontWeight="700" textAnchor="middle" fontFamily="sans-serif">{PLATE_WEEK.score}</text>
                <text y="34" fill={MUT} fontSize="15" textAnchor="middle" fontFamily="sans-serif">/ 1000</text>
            </g>

            <polyline points={pts} fill="none" stroke={A} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
            <text x="24" y="498" fill={MUT} fontSize="14" fontFamily="sans-serif">
                +{(PLATE_WEEK.e1rm - STORY[0].e1rm).toFixed(1)} kg over six weeks
            </text>

            <g transform="translate(24 520)">
                <rect width="342" height="140" rx="18" fill={CARD} />
                <text x="20" y="38" fill={MUT} fontSize="13" fontFamily="sans-serif">METHOD</text>
                <text x="20" y="68" fill={TXT} fontSize="18" fontWeight="600" fontFamily="sans-serif">Peak Fettle score</text>
                <text x="20" y="94" fill={MUT} fontSize="14" fontFamily="sans-serif">Volume · overload · consistency</text>
                <text x="20" y="120" fill={A} fontSize="14" fontFamily="sans-serif">Switch to DOTS / Wilks →</text>
            </g>
            <TabBar active={2} />
        </Frame>
    );
}

export function ScreenStreak() {
    const days = Array.from({ length: 28 });
    return (
        <Frame>
            <text x="24" y="92" fill={MUT} fontSize="14" fontFamily="sans-serif">Consistency</text>
            <text x="24" y="120" fill={TXT} fontSize="26" fontWeight="700" fontFamily="sans-serif">Your streak</text>

            <g transform="translate(195 220)">
                <text y="0" fill={A} fontSize="64" fontWeight="700" textAnchor="middle" fontFamily="sans-serif">12</text>
                <text y="34" fill={MUT} fontSize="16" textAnchor="middle" fontFamily="sans-serif">days in a row</text>
            </g>

            <g transform="translate(24 290)">
                {days.map((_, i) => {
                    const col = i % 7;
                    const row = Math.floor(i / 7);
                    const on = i > 5 && i < 26 && (i % 9 !== 0);
                    return (
                        <rect key={i} x={col * 50} y={row * 50} width="40" height="40" rx="10"
                            fill={on ? A : SUB} opacity={on ? (0.5 + (i / 56)) : 1} />
                    );
                })}
            </g>

            <g transform="translate(24 540)">
                <rect width="342" height="120" rx="18" fill={CARD} />
                <text x="20" y="40" fill={TXT} fontSize="16" fontWeight="600" fontFamily="sans-serif">Make-up window open</text>
                <text x="20" y="70" fill={MUT} fontSize="14" fontFamily="sans-serif">Missed Tuesday? You have until Sunday.</text>
                <text x="20" y="98" fill={A} fontSize="14" fontFamily="sans-serif">Even a 5-minute visit counts.</text>
            </g>
            <TabBar active={3} />
        </Frame>
    );
}

function Tag({ x, y, label }: { x: number; y: number; label: string }) {
    const w = label.length * 8 + 22;
    return (
        <g transform={`translate(${x} ${y})`}>
            <rect width={w} height="32" rx="16" fill="#00D4C8" opacity="0.14" />
            <text x={w / 2} y="21" fill={A} fontSize="13" fontWeight="600" textAnchor="middle" fontFamily="sans-serif">{label}</text>
        </g>
    );
}

function TabBar({ active }: { active: number }) {
    const labels = ['Log', 'Rank', 'Score', 'Streak'];
    return (
        <g transform="translate(0 760)">
            <rect x="0" y="0" width={W} height="84" fill="#0C1426" />
            <rect x="0" y="0" width={W} height="1" fill="#1A2340" />
            {labels.map((l, i) => {
                const x = 49 + i * 97;
                const on = i === active;
                return (
                    <g key={l}>
                        <circle cx={x} cy="26" r="4" fill={on ? A : '#3A4A66'} />
                        <text x={x} y="58" fill={on ? A : MUT} fontSize="12" textAnchor="middle" fontFamily="sans-serif">{l}</text>
                    </g>
                );
            })}
        </g>
    );
}
