#!/usr/bin/env node
/**
 * reconcile-collapse-map.js — turn the researched collapse suggestions into a
 * map that would actually be CORRECT to run.
 *
 *   node scripts/reconcile-collapse-map.js
 *
 * WHY THIS EXISTS. The per-exercise research was produced by 12 agents that
 * never saw each other's slices, so the collapse targets were never reconciled
 * globally. Running the raw map would do the OPPOSITE of its purpose: it would
 * SPLIT history rather than consolidate it. Concretely, in the bench family:
 *
 *     Smith Machine Bench Press   -> Bench Press
 *     Close-Grip Bench Press      -> Barbell Bench Press
 *     Incline/Decline Barbell BP  -> Barbell Bench Press
 *     Bench Press <-> Barbell Bench Press   (they alias each other, circularly)
 *
 * ...so the flagship lift lands in two different bases. This script resolves
 * that and the other 4 defect classes, and REFUSES to emit a map that still
 * contains any of them.
 *
 * Reads   docs/archive/qualifiers/corrected.json  (research; not modified)
 * Writes  docs/archive/qualifiers/collapse-map.json + collapse-report.md
 *
 * Nothing here touches a database. The output is a reviewed plan; executing it
 * is a separate, still-blocked step (see the spec's parked-work section).
 */

'use strict';

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const SRC = path.join(REPO, 'docs', 'archive', 'qualifiers', 'corrected.json');
const OUT_MAP = path.join(REPO, 'docs', 'archive', 'qualifiers', 'collapse-map.json');
const OUT_REPORT = path.join(REPO, 'docs', 'archive', 'qualifiers', 'collapse-report.md');

const records = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const byName = new Map(records.map((e) => [e.name, e]));

// ---------------------------------------------------------------------------
// THE DECISION TABLE — every deviation from the raw research, with its reason.
// ---------------------------------------------------------------------------

/** Bases to CREATE. Only where a real family has no existing base row. */
const CREATE_BASES = {
  'Cable Fly': 'Three variants (high-to-low, low-to-high, incline) with no base row. "Cable Fly" is the ordinary name for the movement.',
  'Lunge': 'Dumbbell and Walking lunge had no base. Reverse/Curtsy/Goblet stay separate - distinct patterns, not qualifiers of a plain lunge.',
  'Shrug': 'Shrug (Barbell) and Shrug (Dumbbell) are the same movement differing only by implement. Creating a clean base beats collapsing one parenthesised name into the other.',
};

/** name -> [target, qualifiers, reason]. Overrides whatever research said. */
const OVERRIDES = {
  // ── circular / duplicate bases: pick ONE and merge the other in ──────────
  'Barbell Bench Press': ['Bench Press', {}, 'Circular alias with Bench Press and variants split across both. One base; this is a pure rename merge.'],
  'Conventional Deadlift': ['Deadlift', {}, 'Circular alias with Deadlift. Same lift, two names.'],
  'Flat Dumbbell Fly': ['Dumbbell Fly', { bench_angle: 'flat' }, 'Both bases, both claiming "chest fly"; flat IS the ordinary dumbbell fly.'],
  'Lying Leg Curl': ['Leg Curl', { body_position: 'lying_prone' }, 'Seated Leg Curl already collapses into Leg Curl; leaving lying as its own base split the family.'],
  'Dumbbell Skull Crusher': ['Skull Crusher', { bar_type: 'dumbbell' }, 'Was a base shadowing the real Skull Crusher via an alias; its own rationale admitted it was a slice-boundary artifact.'],

  // ── phantom targets resolved to bases that ALREADY exist ────────────────
  'Seated Barbell Press': ['Overhead Press', { body_position: 'seated' }, 'Target "Barbell Overhead Press" never existed. Overhead Press does, and already carries body_position.'],
  'Smith Machine Shoulder Press': ['Overhead Press', { bar_type: 'smith' }, 'Target "Shoulder Press" never existed. Overhead Press does, and already carries bar_type.'],
  'Rope Tricep Pushdown': ['Triceps Pushdown', { attachment: 'rope' }, 'Target "Tricep Pushdown" (singular) never existed; unifies with Rope Pushdown, which already points at the real base.'],
  'Single-Leg Calf Raise': ['Standing Calf Raise', { laterality: 'unilateral' }, 'Target "Calf Raise" would have been a FOURTH calf base alongside Standing/Seated/Leg-Press.'],
  'Donkey Calf Raise': ['Standing Calf Raise', { body_position: 'bent_over' }, 'Same - folds into the existing standing base rather than inventing one.'],
  'Shrug (Barbell)': ['Shrug', { bar_type: 'straight_barbell' }, 'Half-collapsing the family (dumbbell only) would have split shrug history.'],
  'Shrug (Dumbbell)': ['Shrug', { bar_type: 'dumbbell' }, 'Paired with the barbell row above.'],
  'Weighted Dip': ['Parallel Bar Dip (Triceps)', { load_mode: 'weighted' }, 'Target "Dip" is not created (no torso-lean axis exists to tell chest from triceps dips apart). FOUNDER CALL: this assumes weighted dips are the triceps variant.'],

  // Two literal library rows for one lift, given OPPOSITE verdicts by different
  // agents. Trap-bar stays its own base: the neutral grip and torso angle make it
  // arguably a distinct lift, and the 1RM literature is directly conflicting
  // (Swinton ~8% higher; Camara no significant difference), which is why its
  // coefficient is `exclude`. So merge the hyphenated duplicate INTO it.
  'Trap-Bar Deadlift': ['Trap Bar Deadlift', {}, 'Duplicate library row - same lift, two spellings. Pure rename merge; the un-hyphenated row is the survivor.'],

  'Cable Overhead Extension': ['Overhead Cable Extension', {}, 'Pure word-order rename merge - the same exercise written two ways, so empty qualifiers is the CORRECT encoding, not a loss.'],

  // ── lossy collapses, now fixable because bar_position exists ────────────
  'Low-Bar Squat': ['Back Squat', { bar_position: 'low_bar' }, 'Was collapsing with EMPTY qualifiers, silently destroying the distinction on the flagship lift. bar_position (added 2026-08-05) reconstructs it.'],
  'High-Bar Squat': ['Back Squat', { bar_position: 'high_bar' }, 'NEW collapse. Was a separate base while Back Squat claimed "high-bar squat" as an alias - a three-way split of squat history.'],
};

/** Variants whose research target was a name we are merging away. */
const RETARGET_FROM_MERGED_BASE = { 'Barbell Bench Press': 'Bench Press', 'Conventional Deadlift': 'Deadlift' };

/** Explicitly KEEP as their own base, overriding a research collapse. */
const KEEP_SEPARATE = {
  'Bent-Over Reverse Fly': 'Target "Reverse Fly" would have been created for a SINGLE variant. Pointless base.',
  'Dip (Chest-Focused)': 'Was collapsing into a phantom "Dip" with EMPTY qualifiers. Torso lean has no axis, so the chest/triceps distinction is real and unreconstructable - keep both dips as bases.',
  'Concentration Curl': 'Research collapsed it as {seated, unilateral}, but the braced-elbow strength curve IS the exercise; a seated unilateral DB curl is a different thing.',
};

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

const decisions = [];
const out = {};
const createdBases = new Set(Object.keys(CREATE_BASES));

for (const rec of records) {
  const name = rec.name;
  let target = rec.collapse_into || null;
  let quals = rec.collapse_qualifiers || {};
  let reason = null;
  let source = 'research';

  if (KEEP_SEPARATE[name]) {
    if (target) decisions.push({ name, from: target, to: null, reason: KEEP_SEPARATE[name], kind: 'keep-separate' });
    target = null; quals = {}; source = 'override';
  } else if (OVERRIDES[name]) {
    const [t, q, why] = OVERRIDES[name];
    if (t !== target || JSON.stringify(q) !== JSON.stringify(quals)) {
      decisions.push({ name, from: target, to: t, reason: why, kind: target ? 'retarget' : 'new-collapse' });
    }
    target = t; quals = q; reason = why; source = 'override';
  } else if (target && RETARGET_FROM_MERGED_BASE[target]) {
    const t = RETARGET_FROM_MERGED_BASE[target];
    decisions.push({ name, from: target, to: t, reason: 'Its target was merged away into ' + t + '.', kind: 'retarget' });
    target = t; source = 'override';
  }

  if (target) out[name] = { target, qualifiers: quals, source, reason };
}

// ---------------------------------------------------------------------------
// Alias hygiene: drop aliases that name a DIFFERENT real exercise which does
// not collapse into the claimer. Those mis-route search (and any alias-driven
// migration) to the wrong lift.
// ---------------------------------------------------------------------------

const allNames = new Set(records.map((e) => e.name));
const lowerToName = new Map(records.map((e) => [e.name.toLowerCase(), e.name]));
const strippedAliases = [];
const aliasesOut = {};

for (const rec of records) {
  const keep = [];
  const ownTarget = out[rec.name] ? out[rec.name].target : null;
  for (const a of rec.aliases || []) {
    const hit = lowerToName.get(String(a).toLowerCase().trim());
    const resolvesToSelf = hit === rec.name;
    // The shadowed exercise collapses INTO this one, so the alias is exactly
    // right - that is the point of keeping old names searchable.
    const collapsesIntoClaimer = hit && out[hit] && out[hit].target === rec.name;
    // This exercise collapses INTO the shadowed one, so naming it is redundant
    // rather than wrong. Dropped quietly; the survivor already owns that name.
    const namesOwnTarget = hit && hit === ownTarget;
    if (hit && !resolvesToSelf && !collapsesIntoClaimer && !namesOwnTarget) {
      strippedAliases.push({ owner: rec.name, alias: a, shadows: hit });
      continue;
    }
    if (!namesOwnTarget) keep.push(a);
  }
  // A base being merged away must hand its remaining aliases to the survivor,
  // or searching its old name stops finding anything after the collapse.
  if (ownTarget) {
    const inherited = aliasesOut[ownTarget] || [];
    const merged = new Set([...inherited, ...keep, rec.name]);
    aliasesOut[ownTarget] = [...merged];
  } else if (keep.length) {
    aliasesOut[rec.name] = keep;
  }
}

// ---------------------------------------------------------------------------
// Axis union: a base must offer every axis its inbound variants collapse with,
// or the chip UI cannot render or edit those sets after the merge.
// ---------------------------------------------------------------------------

const axisAdditions = {};
for (const [name, info] of Object.entries(out)) {
  const base = byName.get(info.target);
  const have = new Set(base ? (base.axes || []).map((a) => a.axis_id) : []);
  for (const ax of Object.keys(info.qualifiers || {})) {
    if (!have.has(ax)) {
      (axisAdditions[info.target] = axisAdditions[info.target] || new Set()).add(ax);
    }
  }
}

// ---------------------------------------------------------------------------
// VALIDATE — refuse to emit a map that still contains a known defect class.
// ---------------------------------------------------------------------------

const errors = [];
const validTargets = new Set([...allNames, ...createdBases]);

for (const [name, info] of Object.entries(out)) {
  if (!validTargets.has(info.target)) errors.push(`phantom target: ${name} -> ${info.target}`);
  if (out[info.target]) errors.push(`chained collapse: ${name} -> ${info.target} -> ${out[info.target].target}`);
  if (info.target === name) errors.push(`self-collapse: ${name}`);
  const isRename = info.reason && /rename merge|two names/i.test(info.reason);
  if (Object.keys(info.qualifiers || {}).length === 0 && !isRename) {
    errors.push(`lossy collapse (no reconstructing qualifiers): ${name} -> ${info.target}`);
  }
}
for (const s of strippedAliases) {
  if (out[s.owner] && out[s.owner].target === s.shadows) errors.push(`stripped a legitimate alias: ${s.owner}/${s.alias}`);
}

// Duplicate library rows (same name modulo punctuation) must reach the SAME
// destination. Opposite verdicts on a literal duplicate is how one user's sets
// end up under Deadlift while another's stay under Trap Bar Deadlift.
const normKey = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const dupeGroups = new Map();
for (const rec of records) {
  const k = normKey(rec.name);
  if (!dupeGroups.has(k)) dupeGroups.set(k, []);
  dupeGroups.get(k).push(rec.name);
}
for (const [k, group] of dupeGroups) {
  if (group.length < 2) continue;
  const dests = new Set(group.map((n) => (out[n] ? out[n].target : n)));
  if (dests.size > 1) {
    errors.push(`duplicate rows "${k}" disagree: ${group.map((n) => n + ' -> ' + (out[n] ? out[n].target : '[BASE]')).join(' | ')}`);
  }
}

if (errors.length) {
  console.error('REFUSING TO EMIT — ' + errors.length + ' unresolved defect(s):');
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------

const payload = {
  generated_from: 'docs/archive/qualifiers/corrected.json',
  note: 'Reviewed collapse plan. NOT executed - see the spec for the remaining execution blockers.',
  create_bases: CREATE_BASES,
  collapses: out,
  aliases: aliasesOut,
  axis_additions: Object.fromEntries(Object.entries(axisAdditions).map(([k, v]) => [k, [...v].sort()])),
};
fs.writeFileSync(OUT_MAP, JSON.stringify(payload, null, 1), 'utf8');

const lines = [];
lines.push('# Collapse map — reconciliation report\n');
lines.push('GENERATED by `scripts/reconcile-collapse-map.js`. Do not edit by hand.\n');
lines.push(`Source: ${records.length} researched exercises → **${Object.keys(out).length} collapses** into **${new Set(Object.values(out).map((o) => o.target)).size} bases**.\n`);
lines.push('The raw research map could not be run: 12 agents produced it without seeing each');
lines.push("other's slices, so targets were never reconciled. This pass fixes 5 defect classes");
lines.push('and the script refuses to emit while any remain.\n');

lines.push('\n## Bases to create\n');
lines.push('| Base | Why |\n|---|---|');
for (const [b, why] of Object.entries(CREATE_BASES)) lines.push(`| \`${b}\` | ${why} |`);

lines.push('\n## Decisions that override the research\n');
lines.push('| Exercise | Research said | Now | Why |\n|---|---|---|---|');
for (const d of decisions) {
  lines.push(`| \`${d.name}\` | ${d.from ? '→ `' + d.from + '`' : 'keep separate'} | ${d.to ? '→ `' + d.to + '`' : '**keep separate**'} | ${d.reason} |`);
}

lines.push('\n## Aliases stripped (they named a different real exercise)\n');
lines.push('| Owner | Alias | Actually is |\n|---|---|---|');
for (const s of strippedAliases) lines.push(`| \`${s.owner}\` | "${s.alias}" | \`${s.shadows}\` |`);

lines.push('\n## Axes each base must gain\n');
lines.push('Without these, sets carry a qualifier the base cannot render or edit.\n');
lines.push('| Base | Axes to add |\n|---|---|');
for (const [b, v] of Object.entries(axisAdditions)) lines.push(`| \`${b}\` | ${[...v].sort().map((x) => '`' + x + '`').join(', ')} |`);

lines.push('\n## Full collapse list\n');
lines.push('| Variant | → Base | Reconstructing qualifiers |\n|---|---|---|');
for (const [n, i] of Object.entries(out).sort()) {
  const q = Object.entries(i.qualifiers || {}).map(([k, v]) => `${k}=${v}`).join(', ') || '_(rename merge)_';
  lines.push(`| ${n} | \`${i.target}\` | ${q} |`);
}
fs.writeFileSync(OUT_REPORT, lines.join('\n') + '\n', 'utf8');

console.log(`reconciled: ${Object.keys(out).length} collapses -> ${new Set(Object.values(out).map((o) => o.target)).size} bases`);
console.log(`  overrides applied : ${decisions.length}`);
console.log(`  bases to create   : ${Object.keys(CREATE_BASES).length}`);
console.log(`  aliases stripped  : ${strippedAliases.length}`);
console.log(`  bases gaining axes: ${Object.keys(axisAdditions).length}`);
console.log(`  validation        : clean`);
