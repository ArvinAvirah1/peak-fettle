/**
 * engineBecause.test.js — TICKET-146 golden consistency check.
 *
 * The engine modules return a canonical English `because` line AND a
 * (because_key, because_params) pair; engine.json holds the EN templates.
 * This test proves template ∘ params === module English, byte for byte, for
 * every rule variant — so translators can work from engine.json knowing the
 * templates are exactly what the engine says today.
 *
 * Run: node mobile/src/i18n/__tests__/engineBecause.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..', '..', '..');
const ts = require(path.join(REPO, 'mobile', 'node_modules', 'typescript'));

function load(relPath, cache) {
  cache = cache || {};
  const norm = path.normalize(relPath);
  if (cache[norm]) return cache[norm];
  const abs = path.join(REPO, norm);
  let file = abs;
  if (!fs.existsSync(file)) file = abs + '.ts';
  if (!fs.existsSync(file)) file = abs + '.tsx';
  const src = fs.readFileSync(file, 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: { module: 'commonjs', target: 'es2019', esModuleInterop: true },
  }).outputText;
  const mod = { exports: {} };
  cache[norm] = mod.exports;
  const dir = path.dirname(file);
  const localRequire = (spec) => {
    if (spec.startsWith('.')) {
      const rel = path.relative(REPO, path.resolve(dir, spec));
      return load(rel, cache);
    }
    return require(spec);
  };
  new Function('require', 'module', 'exports', js)(localRequire, mod, mod.exports);
  return mod.exports;
}

const i18next = require(path.join(REPO, 'mobile', 'node_modules', 'i18next'));
const engineJson = JSON.parse(
  fs.readFileSync(path.join(REPO, 'mobile', 'src', 'i18n', 'locales', 'en', 'engine.json'), 'utf8'),
);

const EB = load('mobile/src/i18n/engine.ts');
const AR = load('mobile/src/lib/trainingEngine/v2/autoregulation.ts');
const FT = load('mobile/src/lib/trainingEngine/v2/fatigue.ts');

let passed = 0;
let failed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log('  PASS ', name); }
  else { failed++; console.log('  FAIL ', name, extra !== undefined ? JSON.stringify(extra) : ''); }
}

// Deterministic fixed clock, injected (no clock reads).
const NOW = '2026-07-03T12:00:00.000Z';
const NOW_MS = Date.parse(NOW);
const DAY = 24 * 60 * 60 * 1000;
const iso = (off) => new Date(NOW_MS - off * DAY).toISOString();

async function main() {
  await i18next.init({
    resources: { en: { engine: engineJson } },
    lng: 'en',
    fallbackLng: 'en',
    defaultNS: 'engine',
    ns: ['engine'],
    interpolation: { escapeValue: false },
    returnNull: false,
  });

  const band = { targetRepsLow: 8, targetRepsHigh: 10, targetRirLow: 1, targetRirHigh: 3 };
  const cfg = { unitPref: 'kg', equipment: 'barbell', effortDisplay: 'rir', now: NOW };
  const set = (w, reps, rir, off) => ({ weightKg: w, reps, rir, loggedAt: iso(off ?? 2), isDrop: false });

  // Every autoregulation rule variant.
  const arCases = [
    ['AR-P1', [set(80, 10, 3)]],
    ['AR-H1', [set(80, 9, 2)]],
    ['AR-R1', [set(80, 8, 0)]],
    ['AR-D1', [set(80, 6, 1)]],
    ['AR-S1', [set(80, 8, 2, 32)]],
    ['AR-H1_bodyweight', [set(70, 12, 2)], { ...cfg, equipment: 'bodyweight' }],
  ];
  for (const [label, history, cfgOverride] of arCases) {
    const out = AR.suggestNextLoad(history, band, cfgOverride ?? cfg);
    check(`${label}: template+params reproduce module English exactly`,
      out !== null && out.because_key != null && EB.engineBecause(out) === out.because,
      out && { key: out.because_key, rendered: EB.engineBecause(out), because: out.because });
  }

  // Every fatigue rule variant.
  const lowWeek = [6, 5, 4, 3, 2, 1, 0].map((o) => ({ date: iso(o), score: 50 }));
  const ftCases = [
    ['FT-D1_deload', lowWeek, { now: NOW, lastDeloadAt: iso(44) }],
    ['FT-D1_nodeload', [{ date: iso(40), score: 70 }].concat(lowWeek), { now: NOW, lastDeloadAt: null }],
    ['FT-V1', [{ date: iso(4), score: 52 }, { date: iso(2), score: 55 }, { date: iso(0), score: 58 }], { now: NOW, lastDeloadAt: iso(44) }],
  ];
  for (const [label, series, config] of ftCases) {
    const out = FT.suggestPlanAdjustment(series, config);
    check(`${label}: template+params reproduce module English exactly`,
      out !== null && out.because_key === label && EB.engineBecause(out) === out.because,
      out && { key: out.because_key, rendered: EB.engineBecause(out), because: out.because });
  }

  // Fallback path: unknown key → module English untouched.
  check('unknown because_key falls back to module English',
    EB.engineBecause({ because: 'plain english', because_key: 'NOPE-9', because_params: {} }) === 'plain english');
  check('missing because_key falls back to module English',
    EB.engineBecause({ because: 'plain english' }) === 'plain english');

  console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

void main();
