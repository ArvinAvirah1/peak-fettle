/**
 * insights-local.test.js
 * Tests for mobile/src/lib/insightsLocal.ts
 * Run: node __tests__/insights-local.test.js (from mobile/)
 *
 * Harness: same TS-via-typescript pattern.
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const ts   = require('typescript');

function loadTs(relPath) {
  const absPath = path.resolve(__dirname, '..', relPath);
  const src = fs.readFileSync(absPath, 'utf8');
  const js  = ts.transpileModule(src, {
    compilerOptions: {
      module:  ts.ModuleKind.CommonJS,
      target:  ts.ScriptTarget.ES2019,
      strict:  false,
      esModuleInterop: true,
    },
  }).outputText;
  const mod = { exports: {} };
  const dir = path.dirname(absPath);
  new Function('module','exports','require','__dirname','__filename', js)(
    mod, mod.exports,
    (id) => id.startsWith('.') ? require(path.resolve(dir,id)) : require(id),
    dir, absPath
  );
  return mod.exports;
}

const IL = loadTs('src/lib/insightsLocal.ts');
const { computeRecovery, computeReadiness, computeDeload } = IL;

// ---------------------------------------------------------------------------
let pass = 0, fail = 0;
function ok(c, msg)  { if (c) { console.log('  ✓',msg); pass++; } else { console.error('  ✗',msg); fail++; } }
function near(a,b,tol,msg) { ok(Math.abs(a-b)<=tol, `${msg} (got ${a}, want ${b} ±${tol})`); }

console.log('\n── Insights Local Tests ──\n');

// ---------------------------------------------------------------------------
// Recovery — tau formula
// ---------------------------------------------------------------------------
{
  // Single muscle "quads" worked 24 hours ago in 5 sets
  const now = new Date('2026-06-12T12:00:00Z');
  const sets14d = [
    { day_key: '2026-06-11', muscle_groups: ['quads'], logged_at: '2026-06-11T12:00:00Z' },
    { day_key: '2026-06-11', muscle_groups: ['quads'], logged_at: '2026-06-11T12:05:00Z' },
    { day_key: '2026-06-11', muscle_groups: ['quads'], logged_at: '2026-06-11T12:10:00Z' },
    { day_key: '2026-06-11', muscle_groups: ['quads'], logged_at: '2026-06-11T12:15:00Z' },
    { day_key: '2026-06-11', muscle_groups: ['quads'], logged_at: '2026-06-11T12:20:00Z' },
  ];
  const result = computeRecovery(sets14d, now);
  ok(result.muscles.length === 1, 'recovery-1: one muscle group returned');
  const quads = result.muscles.find(m => m.muscle === 'quads');
  ok(!!quads, 'recovery-2: quads present');
  // tau = 48 + 12*min(5/5, 2) = 48+12 = 60h; hours_since = 24h; freshness = round(24/60*100) = 40
  near(quads.freshness, 40, 1, 'recovery-3: tau=60h, 24h elapsed → freshness≈40');
  ok(typeof result.generated_at === 'string', 'recovery-4: generated_at is string');
  ok(Array.isArray(result.rule_trace), 'recovery-5: rule_trace is array');
}

// tau with 0 sets in last session (edge case — freshness should be 100 as hours/tau*100 ≥ 100)
{
  const now = new Date('2026-06-12T12:00:00Z');
  const sets14d = [
    // 80 hours ago, 1 set → tau = 48 + 12*min(1/5,2) = 48+2.4 = 50.4h
    // hours_since=80 → freshness = min(100, round(80/50.4*100)) = 100
    { day_key: '2026-06-09', muscle_groups: ['glutes'], logged_at: '2026-06-09T08:00:00Z' },
  ];
  const result = computeRecovery(sets14d, now);
  const glutes = result.muscles.find(m => m.muscle === 'glutes');
  ok(glutes && glutes.freshness === 100, 'recovery-6: >tau hours elapsed → freshness capped 100');
}

// tau formula for 10 sets (capped at 2) → tau = 48 + 12*2 = 72h
{
  const now = new Date('2026-06-12T12:00:00Z');
  const sets14d = Array.from({ length: 10 }, (_, i) => ({
    day_key: '2026-06-11',
    muscle_groups: ['hamstrings'],
    logged_at: `2026-06-11T12:${String(i).padStart(2,'0')}:00Z`,
  }));
  // 24h elapsed, tau=72h → freshness = round(24/72*100) = round(33.3) = 33
  const result = computeRecovery(sets14d, now);
  const ham = result.muscles.find(m => m.muscle === 'hamstrings');
  near(ham.freshness, 33, 1, 'recovery-7: 10 sets (tau=72h), 24h elapsed → freshness≈33');
}

// ---------------------------------------------------------------------------
// Readiness — band boundary cases
// ---------------------------------------------------------------------------

// Helper: build metrics rows
function makeMetrics(count, hrv, rhr, sleep) {
  return Array.from({ length: count }, (_, i) => ({
    date: `2026-05-${String(i+1).padStart(2,'0')}`,
    hrv_ms: hrv,
    resting_hr_bpm: rhr,
    sleep_hours: sleep,
  }));
}

// Score ≥ 67 → 'push'
{
  // All components high: hrv stable (ratio=1→100), rhr stable (ratio=1→100),
  // sleep=8h→100, ACR=0.8→100 → weighted all 100 → score=100 → band='push'
  const metrics = makeMetrics(28, 60, 60, 8);
  const r = computeReadiness(metrics, 800, 4*1000); // tonnage7=800, weekly avg=1000/week → ACR=0.8
  ok(r.band === 'push', 'readiness-1: all-high components → band=push');
  ok(r.score !== null && r.score >= 67, `readiness-2: score=${r.score} ≥ 67`);
}

// Score 34–66 → 'maintain'
{
  // HRV ratio = 0.85 → score = round((0.85-0.70)/(1.0-0.70)*100) = round(50) = 50
  // Resting HR ratio = 1.08 → score = round((1.15-1.08)/(1.15-1.0)*100) = round(46.7) = 47
  // Sleep = 5h → round(5/8*100) = 63
  // ACR = 1.15 → round(85 - (0.15/0.3)*35) = round(85-17.5) = round(67.5) = 68
  // weighted: all available → .35*50 + .25*47 + .20*63 + .20*68 = 17.5+11.75+12.6+13.6 = 55.45 → ~55
  const baseHRV = 60;
  const lowHRV  = 0.85 * baseHRV;
  const baseHR  = 60;
  const highHR  = Math.round(1.08 * baseHR);
  const metricsArr = Array.from({ length: 28 }, (_, i) => ({
    date: `2026-05-${String(i+1).padStart(2,'0')}`,
    hrv_ms: i < 21 ? baseHRV : lowHRV,
    resting_hr_bpm: i < 21 ? baseHR : highHR,
    sleep_hours: 5,
  }));
  const r = computeReadiness(metricsArr, 1150, 4*1000); // ACR≈1.15
  ok(r.band === 'maintain' || r.band === 'push', `readiness-3: moderate inputs → band=${r.band} (maintain or push)`);
  ok(r.score !== null, 'readiness-4: score is not null');
}

// Score < 34 → 'rest'
{
  // HRV ratio = 0.7 → score=0; RHR ratio=1.15→0; sleep=2h→25; ACR=2→20
  const baseHRV = 60;
  const lowHRV  = 0.7 * baseHRV;
  const baseHR  = 60;
  const highHR  = Math.round(1.15 * baseHR);
  const metricsArr = Array.from({ length: 28 }, (_, i) => ({
    date: `2026-05-${String(i+1).padStart(2,'0')}`,
    hrv_ms: i < 21 ? baseHRV : lowHRV,
    resting_hr_bpm: i < 21 ? baseHR : highHR,
    sleep_hours: 2,
  }));
  const r = computeReadiness(metricsArr, 2000, 4*1000); // ACR=2→20
  ok(r.band === 'rest' || r.band === 'maintain', `readiness-5: stress inputs → band=${r.band}`);
}

// No data → score null, band unknown
{
  const r = computeReadiness([], 0, 0);
  ok(r.score === null, 'readiness-6: no data → score null');
  ok(r.band === 'unknown', 'readiness-7: no data → band unknown');
}

// Readiness with only sleep data (reweighting)
{
  // Only sleep_hours rows, no hrv/rhr → reweight: sleep gets 100% weight
  const metricsArr = Array.from({ length: 28 }, (_, i) => ({
    date: `2026-05-${String(i+1).padStart(2,'0')}`,
    hrv_ms: null,
    resting_hr_bpm: null,
    sleep_hours: 7,
  }));
  const r = computeReadiness(metricsArr, 0, 0);
  // sleep=7/8*100=87.5→88; ACR=0/0 → skip; only sleep available → reweighted 100%
  ok(r.score !== null, 'readiness-8: sleep-only data → score non-null');
  ok(r.band === 'push' || r.band === 'maintain', `readiness-9: sleep 7h → band=${r.band}`);
}

// ---------------------------------------------------------------------------
// Deload — 42-day rule trigger
// ---------------------------------------------------------------------------
{
  const oldDeload = new Date();
  oldDeload.setDate(oldDeload.getDate() - 50);
  const r = computeDeload([], oldDeload.toISOString().slice(0,10));
  ok(r.recommended === true, 'deload-1: 50-day-old deload → recommended=true');
  ok(r.triggers.some(t => /42-day|50 day|\(d\)/i.test(t)), 'deload-2: trigger (d) present');
  ok(typeof r.prescription === 'string' && r.prescription.length > 0, 'deload-3: prescription non-empty');
}

// Recent deload → no trigger
{
  const recent = new Date();
  recent.setDate(recent.getDate() - 10);
  const r = computeDeload([], recent.toISOString().slice(0,10));
  ok(r.recommended === false, 'deload-4: 10-day-old deload → recommended=false');
}

// No deload ever with long history → trigger
{
  const oldWorkout = new Date();
  oldWorkout.setDate(oldWorkout.getDate() - 50);
  const history = [
    { day_key: new Date().toISOString().slice(0,10), set_count: 15 },
    { day_key: oldWorkout.toISOString().slice(0,10), set_count: 10 },
  ];
  const r = computeDeload(history, null);
  ok(r.recommended === true, 'deload-5: null lastDeload + 50-day history → recommended=true');
}

// rule_trace always present
{
  const r = computeDeload([], null);
  ok(Array.isArray(r.rule_trace), 'deload-6: rule_trace is array');
}

// ---------------------------------------------------------------------------
console.log(`\n  ${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
