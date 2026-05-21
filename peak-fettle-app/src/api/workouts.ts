/**
 * Peak Fettle — Workouts & Sets API calls
 */

import { apiClient } from './client';

// ---------------------------------------------------------------------------
// Workouts
// ---------------------------------------------------------------------------

export interface Workout {
    id:         string;
    day_key:    string;   // YYYY-MM-DD
    notes:      string | null;
    created_at: string;
}

export interface WorkoutListResponse {
    workouts:     Workout[];
    next_cursor?: string;
}

export async function listWorkouts(cursor?: string): Promise<WorkoutListResponse> {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
    return apiClient.get<WorkoutListResponse>(`/workouts${query}`);
}

export async function getOrCreateWorkout(dayKey: string): Promise<Workout & { status: 'created' | 'existing' }> {
    return apiClient.post(`/workouts`, { day_key: dayKey });
}

// ---------------------------------------------------------------------------
// Sets
// ---------------------------------------------------------------------------

export type SetKind = 'lift' | 'cardio';

export interface LiftSet {
    id:          string;
    workout_id:  string;
    exercise_id: string;
    kind:        'lift';
    weight_kg:   number;
    reps:        number;
    rir:         number | null;
    e1rm_kg:     number | null;
    set_number:  number;
    logged_at:   string;
}

export interface CardioSet {
    id:            string;
    workout_id:    string;
    exercise_id:   string;
    kind:          'cardio';
    duration_secs: number;
    distance_m:    number | null;
    pace_per_km:   number | null;
    set_number:    number;
    logged_at:     string;
}

export type WorkoutSet = LiftSet | CardioSet;

export interface SetListResponse {
    sets:         WorkoutSet[];
    next_cursor?: string;
}

export async function listSets(workoutId: string, cursor?: string): Promise<SetListResponse> {
    const query = cursor
        ? `?workout_id=${workoutId}&cursor=${encodeURIComponent(cursor)}`
        : `?workout_id=${workoutId}`;
    return apiClient.get<SetListResponse>(`/sets${query}`);
}

export interface LogLiftSetPayload {
    workout_id:  string;
    exercise_id: string;
    weight_kg:   number;
    reps:        number;
    rir?:        number;
    logged_at?:  string;  // ISO — for backdated entries
}

export interface LogCardioSetPayload {
    workout_id:    string;
    exercise_id:   string;
    duration_secs: number;
    distance_m?:   number;
    logged_at?:    string;
}

export async function logLiftSet(payload: LogLiftSetPayload): Promise<LiftSet> {
    return apiClient.post<LiftSet>('/sets', { ...payload, kind: 'lift' });
}

export async function logCardioSet(payload: LogCardioSetPayload): Promise<CardioSet> {
    return apiClient.post<CardioSet>('/sets', { ...payload, kind: 'cardio' });
}

export async function deleteSet(setId: string): Promise<void> {
    return apiClient.delete(`/sets/${setId}`);
}
