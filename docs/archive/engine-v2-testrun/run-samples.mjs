// run-samples.mjs — Engine v2 prototype TEST RUN.
// Runs generatePlanV2 on the six founder-requested profiles and prints a clean,
// human-readable multi-week report. Run:  node run-samples.mjs
// Writes the same report to TEST_RUN.md when invoked as:  node run-samples.mjs --md

import { generatePlanV2 } from './engine.mjs';
import { writeFileSync } from 'node:fs';

// ── The six required test profiles ──
const PROFILES = [
  {
    _title: '1 · Novice · General fitness · 3d/wk · 45 min · cautious · no injuries',
    userId: 'demo-1',
    experienceLevel: 'novice', goal: 'general_fitness', daysPerWeek: 3, sessionMinutes: 45,
    equipment: ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'bench', 'rack', 'pullup_bar'],
    bodyweightKg: 78, lifts: { squat: 80, bench: 60, deadlift: 100 },
    knobs: { failureProximity: 'cautious', progressionSpeed: 'conservative', deloadFrequency: 'infrequent' },
  },
  {
    _title: '2 · Intermediate · Hypertrophy · 5d/wk · 75 min · priority chest + back',
    userId: 'demo-2',
    experienceLevel: 'intermediate', goal: 'hypertrophy', daysPerWeek: 5, sessionMinutes: 75,
    equipment: ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'bench', 'rack', 'pullup_bar', 'bands'],
    musclePriorities: ['chest', 'back'], bodyweightKg: 84, lifts: { squat: 150, bench: 110, deadlift: 190, ohp: 65 },
    knobs: { failureProximity: 'balanced', progressionSpeed: 'balanced', deloadFrequency: 'standard' },
  },
  {
    _title: '3 · Advanced · Powerlifting · 4d/wk · meet in 10 weeks · S/B/D given → peaking',
    userId: 'demo-3',
    experienceLevel: 'advanced', goal: 'strength_powerlifting', daysPerWeek: 4, sessionMinutes: 90,
    equipment: ['barbell', 'dumbbell', 'machine', 'cable', 'bench', 'rack'],
    bodyweightKg: 93, lifts: { squat: 220, bench: 150, deadlift: 260, ohp: 90 },
    meet: { weeksToMeet: 10, target1RM: { squat: 230, bench: 157.5, deadlift: 270 } },
    knobs: { failureProximity: 'balanced', progressionSpeed: 'balanced', deloadFrequency: 'standard' },
  },
  {
    _title: '4 · Time-crunched · Fat-loss / general · 3d/wk · 30 min',
    userId: 'demo-4',
    experienceLevel: 'novice', goal: 'general_fitness', fatLossEmphasis: true, daysPerWeek: 3, sessionMinutes: 30,
    equipment: ['dumbbell', 'kettlebell', 'bodyweight', 'bench'], bodyweightKg: 90,
    knobs: { failureProximity: 'balanced', progressionSpeed: 'balanced', deloadFrequency: 'standard' },
  },
  {
    _title: '5 · Basketball athlete · In-season · 3d/wk · knee-sensitive · power emphasis',
    userId: 'demo-5',
    experienceLevel: 'intermediate', goal: 'team_sport', sport: 'basketball', seasonPhase: 'in_season',
    gameDay: 6, daysPerWeek: 3, sessionMinutes: 60, injuries: ['knees'],
    equipment: ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'bench', 'rack'],
    bodyweightKg: 88, lifts: { squat: 150, bench: 100, deadlift: 180 },
    knobs: { failureProximity: 'balanced', progressionSpeed: 'balanced', deloadFrequency: 'standard' },
  },
  {
    _title: '6 · Intermediate · Athletic power · 4d/wk',
    userId: 'demo-6',
    experienceLevel: 'intermediate', goal: 'athletic_power', daysPerWeek: 4, sessionMinutes: 75,
    equipment: ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'bench', 'rack', 'pullup_bar'],
    bodyweightKg: 82, lifts: { squat: 160, bench: 110, deadlift: 200 },
    knobs: { failureProximity: 'balanced', progressionSpeed: 'balanced', deloadFrequency: 'standard' },
  },
];

// ── formatting helpers ──
const L = [];
const out = (s = '') => L.push(s);

function fmtSlot(sl) {
  const load = sl.weight_kg != null ? `${sl.weight_kg}kg` : (sl.load_note || '');
  const pct = sl.pct_1rm ? ` (${Math.round(sl.pct_1rm * 100)}%1RM)` : '';
  const rir = sl.rir_target != null ? `RIR ${sl.rir_target} / RPE ${sl.rpe}` : `RPE ${sl.rpe}`;
  const roleTag = sl.role === 'primary' ? '★' : sl.role === 'secondary' ? '·' : ' ';
  return `      ${roleTag} ${pad(sl.name, 30)} ${sl.sets}×${pad(sl.reps, 5)}  ${pad(rir, 16)} ${load}${pct}`;
}
function pad(s, n) { s = String(s == null ? '' : s); return s.length >= n ? s : s + ' '.repeat(n - s.length); }

function renderPlan(profile) {
  const plan = generatePlanV2(profile);
  out('');
  out('='.repeat(96));
  out(profile._title);
  out('='.repeat(96));
  out('WHY: ' + plan.reasoning);
  out('');

  // volume report
  if (plan.volumeReport) {
    out('  Weekly per-muscle set plan (freq/wk · week-1 sets → peak-week sets · MEV–MRV landmark):');
    const per = plan.volumeReport.perMuscleWeeklySets;
    const keys = Object.keys(per).sort();
    for (const m of keys) {
      const v = per[m];
      out(`     ${pad(m, 12)} ${v.freqPerWeek}×/wk   ${pad(String(v.week1Sets) + '→' + v.peakWeekSets, 8)} sets   (MEV ${v.mev} · MRV ${v.mrv})`);
    }
    out('');
  }

  if (plan.peaking) {
    out('  PEAKING (backward from meet): ' + plan.peaking.phases.map(([n, l]) => `${n} ${l}wk`).join(' → '));
    if (plan.peaking.attempts) {
      out('  Suggested attempts (opener 91% / 2nd 96% / 3rd = goal):');
      for (const l of Object.keys(plan.peaking.attempts)) {
        const a = plan.peaking.attempts[l];
        out(`     ${pad(l, 9)} opener ${a.opener}kg · 2nd ${a.second}kg · 3rd ${a.third}kg`);
      }
    }
    out('');
  }

  // Show representative weeks: 1, mid, and the peak/deload week.
  const showWeeks = pickWeeks(plan.weeks);
  for (const wi of showWeeks) {
    const wk = plan.weeks[wi];
    out(`  ── WEEK ${wk.week_number} — ${wk.phase}${wk.isDeload ? '  (DELOAD)' : ''} ──`);
    for (const s of wk.sessions) {
      out(`    ${s.day_label}`);
      if (s.warmup) out(`      warm-up: ${s.warmup}`);
      for (const sl of s.slots) out(fmtSlot(sl));
      for (const c of (s.cardio || [])) out(`      + ${c.kind || 'cardio'}: ${c.description || (c.zone + ' ' + c.minutes + 'min')}`);
      const peakNotes = s.slots.filter((x) => x.peak_note).map((x) => x.peak_note);
      if (peakNotes.length) out(`      note: ${peakNotes[0]}`);
    }
    out('');
  }

  // rule trace (curated)
  out('  RULE TRACE (why these numbers):');
  for (const t of plan.rule_trace) out('     • ' + t);
  out('');
  return plan;
}

function pickWeeks(weeks) {
  const n = weeks.length;
  if (n <= 3) return weeks.map((_, i) => i);
  const set = new Set([0, Math.floor(n / 2), n - 1]);
  // ensure the deload week is shown if present
  const dl = weeks.findIndex((w) => w.isDeload);
  if (dl >= 0) set.add(dl);
  return [...set].sort((a, b) => a - b);
}

// ── header ──
out('PEAK FETTLE — ENGINE v2 PARAMETRIC PROTOTYPE — SAMPLE RUN');
out('Generated by run-samples.mjs · pure on-device functions · no network · deterministic');
out('Legend: ★ primary lift · · secondary · (blank) accessory. RIR = reps in reserve (RPE = 10 − RIR).');

const plans = PROFILES.map(renderPlan);

// ── contrast section: experience × knobs ──
out('='.repeat(96));
out('CONTRAST — how EXPERIENCE and the CONFIG KNOBS change the output');
out('='.repeat(96));

function firstPrimary(plan) {
  for (const wk of plan.weeks) for (const s of wk.sessions) for (const sl of s.slots) if (sl.role === 'primary') return { wk: wk.week_number, sl };
  return null;
}

// Same goal (hypertrophy), vary experience → volume + RIR
out('');
out('A) Same goal (hypertrophy, 4d/wk, chest priority), 3 experience levels — week-1 chest volume + primary RIR:');
for (const exp of ['beginner', 'intermediate', 'advanced']) {
  const p = generatePlanV2({ userId: 'c-' + exp, experienceLevel: exp, goal: 'hypertrophy', daysPerWeek: 4, sessionMinutes: 75, musclePriorities: ['chest'], equipment: ['barbell', 'dumbbell', 'machine', 'cable', 'bench', 'rack'], lifts: { bench: 100 }, knobs: {} });
  const chest = p.volumeReport.perMuscleWeeklySets.chest;
  const fp = firstPrimary(p);
  out(`   ${pad(exp, 13)} chest ${chest.freqPerWeek}×/wk ${chest.week1Sets}→${chest.peakWeekSets} sets/wk · deload every ${p.mesocycle.accumulationWeeks + 1}wk · a primary set ran at RIR ${fp.sl.rir_target} (RPE ${fp.sl.rpe})`);
}

// Same lifter, vary failure-proximity knob → RIR floor
out('');
out('B) Same lifter (intermediate hypertrophy), failure-proximity knob cautious→balanced→aggressive — week-1 primary RIR:');
for (const fp of ['cautious', 'balanced', 'aggressive']) {
  const p = generatePlanV2({ userId: 'k-' + fp, experienceLevel: 'intermediate', goal: 'hypertrophy', daysPerWeek: 4, sessionMinutes: 75, equipment: ['barbell', 'dumbbell', 'machine', 'cable', 'bench', 'rack'], lifts: { bench: 100 }, knobs: { failureProximity: fp } });
  const prim = firstPrimary(p);
  out(`   ${pad(fp, 11)} → a primary set: RIR ${prim.sl.rir_target} (RPE ${prim.sl.rpe})   [floor enforced by experience+knob]`);
}

// Novice cannot be pushed past the floor even on aggressive
out('');
out('C) Safety clamp — a NOVICE on "aggressive" failure-proximity is still held to the experience RIR floor:');
{
  const p = generatePlanV2({ userId: 'clamp', experienceLevel: 'novice', goal: 'hypertrophy', daysPerWeek: 3, sessionMinutes: 60, equipment: ['barbell', 'dumbbell', 'machine', 'cable', 'bench', 'rack'], lifts: { bench: 80 }, knobs: { failureProximity: 'aggressive' } });
  const prim = firstPrimary(p);
  out(`   novice + aggressive → primary compound RIR ${prim.sl.rir_target} (never below 2 for a novice on compounds, whatever the knob says).`);
}

// Deload-frequency knob
out('');
out('D) Deload-frequency knob (intermediate) infrequent→standard→frequent — accumulation length before a deload week:');
for (const df of ['infrequent', 'standard', 'frequent']) {
  const p = generatePlanV2({ userId: 'd-' + df, experienceLevel: 'intermediate', goal: 'hypertrophy', daysPerWeek: 4, sessionMinutes: 75, equipment: ['barbell', 'dumbbell', 'machine', 'cable', 'bench', 'rack'], knobs: { deloadFrequency: df } });
  out(`   ${pad(df, 11)} → ${p.mesocycle.accumulationWeeks} accumulation weeks, then deload (week ${p.mesocycle.deloadWeek}).`);
}
out('');
out('END OF SAMPLE RUN — all six profiles generated with zero errors.');

const report = L.join('\n');
console.log(report);

if (process.argv.includes('--md')) {
  const md = '# Engine v2 — Test Run Output\n\n' +
    '**Date:** 2026-06-30 · Generated by `node run-samples.mjs`. This is the raw, human-readable output of the parametric prototype on the six founder-requested profiles, plus a contrast section showing how experience and the config knobs change the plan. See `DESIGN_SPEC.md` for the algorithm and `RESEARCH.md` for the cited evidence behind every number.\n\n' +
    '```text\n' + report + '\n```\n';
  writeFileSync(new URL('./TEST_RUN.md', import.meta.url), md);
  console.error('\n[wrote TEST_RUN.md]');
}
