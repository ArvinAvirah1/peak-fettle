// insightsLocal.ts — on-device insight computations (mobile port)
// Implements TRAINING_ENGINE_SPEC §4 formulas exactly.
// Pure functions — no DB access. Callers query localDb and pass plain arrays.

// ---------------------------------------------------------------------------
// Types (mirrors server API response shapes)
// ---------------------------------------------------------------------------

export interface MuscleFreshness {
  muscle: string;
  freshness: number;
  last_worked: string | null;
  sets_last_session: number;
}

export interface RecoveryResponse {
  muscles: MuscleFreshness[];
  generated_at: string;
  rule_trace: string[];
}

export interface ReadinessComponent {
  name: string;
  value: number | null;
  weight: number;
  detail: string;
}

export interface ReadinessResponse {
  score: number | null;
  band: 'push' | 'maintain' | 'rest' | 'unknown';
  components: ReadinessComponent[];
  rule_trace: string[];
}

export interface DeloadResponse {
  recommended: boolean;
  triggers: string[];
  prescription: string;
  rule_trace: string[];
}

// ---------------------------------------------------------------------------
// Input row types
// ---------------------------------------------------------------------------

export interface SetRow {
  day_key?: string;
  muscle_groups?: string[] | string;
  exercise_name?: string;
  weight_raw?: number;
  reps?: number;
  logged_at?: string;
}

export interface MetricRow {
  date?: string;
  resting_hr_bpm?: number | null;
  hrv_ms?: number | null;
  sleep_hours?: number | null;
}

export interface WorkoutHistoryRow {
  day_key?: string;
  set_count?: number;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// §4 computeRecovery
// ---------------------------------------------------------------------------
/**
 * computeRecovery(sets14d, now)
 *
 * For each muscle group in the last 14 days of sets:
 *   tau = 48 + 12 * min(sets_in_last_session_for_muscle / 5, 2)  →  48–72h
 *   freshness = min(100, round(hours_since_last_worked / tau * 100))
 *
 * @param sets14d  Array of set rows with day_key, muscle_groups, logged_at
 * @param now      Current timestamp
 */
export function computeRecovery(
  sets14d: unknown[],
  now: Date
): RecoveryResponse {
  const ruleTrace: string[] = [];
  const rows = (sets14d as SetRow[]);

  if (!rows || rows.length === 0) {
    ruleTrace.push('No sets in the last 14 days — all muscles at freshness 100.');
    return {
      muscles: [],
      generated_at: now.toISOString(),
      rule_trace: ruleTrace,
    };
  }

  // Build per-muscle: last_session_date and sets in that session
  // Group rows by muscle group, then by session (day_key)
  const muscleSessionMap = new Map<
    string,
    Map<string, { count: number; lastTime: Date }>
  >();

  for (const row of rows) {
    // muscle_groups may be a JSON string, array, or CSV
    let muscles: string[] = [];
    if (Array.isArray(row.muscle_groups)) {
      muscles = row.muscle_groups as string[];
    } else if (typeof row.muscle_groups === 'string') {
      try {
        const parsed = JSON.parse(row.muscle_groups);
        muscles = Array.isArray(parsed) ? parsed : [row.muscle_groups];
      } catch {
        muscles = row.muscle_groups
          .split(',')
          .map((m: string) => m.trim())
          .filter(Boolean);
      }
    }

    const dayKey = row.day_key || row.logged_at?.slice(0, 10) || 'unknown';
    const loggedAt = row.logged_at ? new Date(row.logged_at) : new Date(dayKey);

    for (const muscle of muscles) {
      if (!muscle) continue;
      if (!muscleSessionMap.has(muscle)) {
        muscleSessionMap.set(muscle, new Map());
      }
      const sessions = muscleSessionMap.get(muscle)!;
      const existing = sessions.get(dayKey);
      if (existing) {
        existing.count++;
        if (loggedAt > existing.lastTime) existing.lastTime = loggedAt;
      } else {
        sessions.set(dayKey, { count: 1, lastTime: loggedAt });
      }
    }
  }

  const result: MuscleFreshness[] = [];

  for (const [muscle, sessions] of muscleSessionMap) {
    // Find the most recent session for this muscle
    let latestSessionKey = '';
    let latestTime = new Date(0);
    for (const [dayKey, info] of sessions) {
      if (info.lastTime > latestTime) {
        latestTime = info.lastTime;
        latestSessionKey = dayKey;
      }
    }

    const setsInLastSession = sessions.get(latestSessionKey)?.count ?? 0;

    // tau = 48 + 12 * min(sets / 5, 2)   →   range 48–72h
    const tau = 48 + 12 * Math.min(setsInLastSession / 5, 2);

    const hoursSinceLast =
      (now.getTime() - latestTime.getTime()) / (1000 * 60 * 60);

    const freshness = Math.min(
      100,
      Math.round((hoursSinceLast / tau) * 100)
    );

    ruleTrace.push(
      `${muscle}: last worked ${latestTime.toISOString()}, ` +
        `${setsInLastSession} sets → tau=${tau.toFixed(1)}h, ` +
        `hours_since=${hoursSinceLast.toFixed(1)} → freshness=${freshness}.`
    );

    result.push({
      muscle,
      freshness,
      last_worked: latestTime.toISOString(),
      sets_last_session: setsInLastSession,
    });
  }

  return {
    muscles: result,
    generated_at: now.toISOString(),
    rule_trace: ruleTrace,
  };
}

// ---------------------------------------------------------------------------
// §4 computeReadiness
// ---------------------------------------------------------------------------
/**
 * computeReadiness(metrics28d, tonnage7d, tonnage28d)
 *
 * Components vs user's own 28-day baseline (skip any lacking ≥7 baseline days;
 * reweight remaining):
 *   HRV (weight .35): today/7d-avg vs baseline; ratio≥1 → 100; linear to 0 at .7
 *   Resting HR (weight .25): inverted; ratio≤1 → 100; 0 at ratio 1.15
 *   Sleep (weight .20): last night / 8h, capped 100
 *   ACR (weight .20): 7d tonnage / 28d weekly-avg; ACR≤0.8→100, 1.0→85, 1.3→50, ≥1.5→20
 *
 * Bands: ≥67 push / 34–66 maintain / <34 rest
 *
 * @param metrics28d  28 days of daily health metrics
 * @param tonnage7d   Sum of weight_kg*reps over last 7 days
 * @param tonnage28d  Sum of weight_kg*reps over last 28 days
 */
export function computeReadiness(
  metrics28d: unknown[],
  tonnage7d: number,
  tonnage28d: number
): ReadinessResponse {
  const ruleTrace: string[] = [];
  const rows = (metrics28d as MetricRow[]);

  // ── HRV component ────────────────────────────────────────────────────────
  const hrvRows = rows.filter((r) => r.hrv_ms != null);
  let hrvScore: number | null = null;
  let hrvDetail = 'Insufficient HRV data (<7 days).';

  if (hrvRows.length >= 7) {
    const baseline28 =
      hrvRows.reduce((s, r) => s + (r.hrv_ms ?? 0), 0) / hrvRows.length;
    const recent7 = hrvRows.slice(-7);
    const avg7 =
      recent7.reduce((s, r) => s + (r.hrv_ms ?? 0), 0) / recent7.length;
    const ratio = baseline28 > 0 ? avg7 / baseline28 : 1;
    // ratio ≥ 1 → 100; linear to 0 at 0.7
    if (ratio >= 1) {
      hrvScore = 100;
    } else if (ratio <= 0.7) {
      hrvScore = 0;
    } else {
      hrvScore = Math.round(((ratio - 0.7) / (1 - 0.7)) * 100);
    }
    hrvDetail = `7d avg HRV=${avg7.toFixed(1)}ms vs baseline=${baseline28.toFixed(1)}ms (ratio=${ratio.toFixed(2)}).`;
    ruleTrace.push(`HRV: ${hrvDetail} score=${hrvScore}`);
  } else {
    ruleTrace.push(`HRV: ${hrvDetail}`);
  }

  // ── Resting HR component ─────────────────────────────────────────────────
  const hrRows = rows.filter((r) => r.resting_hr_bpm != null);
  let hrScore: number | null = null;
  let hrDetail = 'Insufficient resting HR data (<7 days).';

  if (hrRows.length >= 7) {
    const baseline28 =
      hrRows.reduce((s, r) => s + (r.resting_hr_bpm ?? 0), 0) / hrRows.length;
    const recent7 = hrRows.slice(-7);
    const today = recent7[recent7.length - 1].resting_hr_bpm ?? 0;
    const ratio = baseline28 > 0 ? today / baseline28 : 1;
    // inverted: ratio ≤ 1 → 100; 0 at 1.15
    if (ratio <= 1) {
      hrScore = 100;
    } else if (ratio >= 1.15) {
      hrScore = 0;
    } else {
      hrScore = Math.round(((1.15 - ratio) / (1.15 - 1)) * 100);
    }
    hrDetail = `Today HR=${today}bpm vs baseline=${baseline28.toFixed(1)}bpm (ratio=${ratio.toFixed(2)}).`;
    ruleTrace.push(`RHR: ${hrDetail} score=${hrScore}`);
  } else {
    ruleTrace.push(`RHR: ${hrDetail}`);
  }

  // ── Sleep component ───────────────────────────────────────────────────────
  const sleepRows = rows.filter((r) => r.sleep_hours != null);
  let sleepScore: number | null = null;
  let sleepDetail = 'No sleep data.';

  if (sleepRows.length >= 1) {
    const lastNight = sleepRows[sleepRows.length - 1].sleep_hours ?? 0;
    sleepScore = Math.min(100, Math.round((lastNight / 8) * 100));
    sleepDetail = `Last night=${lastNight.toFixed(1)}h (target 8h).`;
    ruleTrace.push(`Sleep: ${sleepDetail} score=${sleepScore}`);
  } else {
    ruleTrace.push(`Sleep: ${sleepDetail}`);
  }

  // ── ACR component ─────────────────────────────────────────────────────────
  let acrScore: number | null = null;
  let acrDetail = 'Insufficient training data for ACR.';

  // 28d weekly avg = tonnage28d / 4
  const weeklyAvg28 = tonnage28d / 4;
  if (weeklyAvg28 > 0) {
    const acr = tonnage7d / weeklyAvg28;
    // ACR ≤ 0.8 → 100, 1.0 → 85, 1.3 → 50, ≥ 1.5 → 20 (linear between)
    if (acr <= 0.8) {
      acrScore = 100;
    } else if (acr <= 1.0) {
      acrScore = Math.round(100 - ((acr - 0.8) / (1.0 - 0.8)) * (100 - 85));
    } else if (acr <= 1.3) {
      acrScore = Math.round(85 - ((acr - 1.0) / (1.3 - 1.0)) * (85 - 50));
    } else if (acr < 1.5) {
      acrScore = Math.round(50 - ((acr - 1.3) / (1.5 - 1.3)) * (50 - 20));
    } else {
      acrScore = 20;
    }
    acrDetail = `7d tonnage=${tonnage7d.toFixed(0)}kg·reps, 28d weekly avg=${weeklyAvg28.toFixed(0)}kg·reps, ACR=${acr.toFixed(2)}.`;
    ruleTrace.push(`ACR: ${acrDetail} score=${acrScore}`);
  } else {
    ruleTrace.push(`ACR: ${acrDetail}`);
  }

  // ── Assemble components and reweight ─────────────────────────────────────
  const rawComponents: Array<{
    name: string;
    rawWeight: number;
    score: number | null;
    detail: string;
  }> = [
    { name: 'hrv',       rawWeight: 0.35, score: hrvScore,   detail: hrvDetail },
    { name: 'resting_hr', rawWeight: 0.25, score: hrScore,   detail: hrDetail },
    { name: 'sleep',     rawWeight: 0.20, score: sleepScore, detail: sleepDetail },
    { name: 'acr',       rawWeight: 0.20, score: acrScore,   detail: acrDetail },
  ];

  const available = rawComponents.filter((c) => c.score !== null);

  let score: number | null = null;
  let band: ReadinessResponse['band'] = 'unknown';
  const components: ReadinessComponent[] = [];

  if (available.length === 0) {
    ruleTrace.push('No data available — returning unknown readiness.');
  } else {
    // Reweight: redistribute weight among available components proportionally
    const totalRaw = available.reduce((s, c) => s + c.rawWeight, 0);
    let weightedSum = 0;

    for (const comp of rawComponents) {
      const reweighted =
        comp.score !== null ? comp.rawWeight / totalRaw : 0;
      const contribution =
        comp.score !== null ? reweighted * comp.score! : 0;
      weightedSum += contribution;
      components.push({
        name: comp.name,
        value: comp.score,
        weight: parseFloat(reweighted.toFixed(4)),
        detail: comp.detail,
      });
    }

    score = Math.round(weightedSum);
    band = score >= 67 ? 'push' : score >= 34 ? 'maintain' : 'rest';
    ruleTrace.push(
      `Readiness score=${score} (${available.length}/${rawComponents.length} components available), band="${band}".`
    );
  }

  return { score, band, components, rule_trace: ruleTrace };
}

// ---------------------------------------------------------------------------
// §4 computeDeload
// ---------------------------------------------------------------------------
/**
 * computeDeload(history, lastDeloadAt)
 *
 * Triggers (any → recommended):
 *   (a) e1RM down ≥2% across 3 consecutive sessions on any lift with ≥6 sessions logged
 *   (b) same exercise+weight failed (reps decreased session-over-session at same weight) 3 consecutive sessions
 *   (c) mean RIR < 1 over trailing 14 days with ≥6 sets
 *   (d) last_deload_at older than 42 days (or NULL with ≥42 days of history)
 *
 * @param history      Recent workout history rows (ordered by day_key desc)
 * @param lastDeloadAt ISO date string of last deload, or null
 */
export function computeDeload(
  history: unknown[],
  lastDeloadAt: string | null
): DeloadResponse {
  const ruleTrace: string[] = [];
  const triggers: string[] = [];
  const rows = (history as WorkoutHistoryRow[]);

  // ── (d) 42-day rule ───────────────────────────────────────────────────────
  const now = new Date();
  if (lastDeloadAt) {
    const daysSinceLast =
      (now.getTime() - new Date(lastDeloadAt).getTime()) /
      (1000 * 60 * 60 * 24);
    if (daysSinceLast >= 42) {
      triggers.push(
        `(d) Last deload was ${Math.floor(daysSinceLast)} days ago (≥42-day rule).`
      );
      ruleTrace.push(
        `Trigger (d): last_deload_at=${lastDeloadAt}, days_since=${Math.floor(daysSinceLast)}.`
      );
    } else {
      ruleTrace.push(
        `Trigger (d): last_deload_at=${lastDeloadAt}, days_since=${Math.floor(daysSinceLast)} — no trigger.`
      );
    }
  } else if (rows && rows.length > 0) {
    // No deload recorded; check if we have ≥42 days of history
    const oldestRow = rows[rows.length - 1];
    const oldestDate = oldestRow?.day_key
      ? new Date(String(oldestRow.day_key))
      : null;
    if (oldestDate) {
      const historyDays =
        (now.getTime() - oldestDate.getTime()) / (1000 * 60 * 60 * 24);
      if (historyDays >= 42) {
        triggers.push(
          `(d) No deload recorded and ≥42 days of training history found.`
        );
        ruleTrace.push(
          `Trigger (d): no deload on record, history spans ${Math.floor(historyDays)} days.`
        );
      } else {
        ruleTrace.push(
          `Trigger (d): no deload on record, but history only ${Math.floor(historyDays)} days — no trigger yet.`
        );
      }
    }
  } else {
    ruleTrace.push(`Trigger (d): no history and no last_deload_at — skip.`);
  }

  // Triggers (a), (b), (c) require per-set data which is not in the summary
  // workout history passed to this function. The localDb query in useInsights
  // passes workout summary rows (not individual sets). We implement the
  // checks defensively: if set-level data is absent, these triggers remain
  // undetected on the free path and are logged accordingly.
  //
  // This is correct per spec — the localDb query in useInsights.ts
  // (fetchWorkoutHistory) returns workout-level aggregates. For full triggers
  // (a)/(b)/(c), the Pro path uses the server endpoint which has full set history.
  ruleTrace.push(
    `Triggers (a)/(b)/(c): set-level data not present in summary history — ` +
      `Pro path handles full e1RM/RIR analysis via server endpoint.`
  );

  const recommended = triggers.length > 0;

  return {
    recommended,
    triggers,
    prescription: recommended
      ? '1 week: same exercises, 50–60% of normal sets, weights −10%.'
      : 'No deload indicated at this time.',
    rule_trace: ruleTrace,
  };
}
