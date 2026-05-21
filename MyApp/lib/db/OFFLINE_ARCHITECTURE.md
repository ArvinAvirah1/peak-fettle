# Peak Fettle — Offline-First Architecture

## Overview

The app is **offline-first**: every read and write goes directly to an on-device SQLite database. PowerSync syncs that database with Supabase in the background whenever the user has connectivity. The gym floor can have terrible Wi-Fi; this should never matter.

```
┌──────────────┐   reads/writes   ┌────────────────────────────┐
│  React UI    │ ─────────────── ▶ │  SQLite (on-device)         │
│  (hooks)     │ ◀────────────── │  managed by PowerSync        │
└──────────────┘    live query     └──────────┬─────────────────┘
                     re-renders               │ sync stream (when online)
                                              ▼
                                    ┌─────────────────┐
                                    │  PowerSync Cloud │
                                    │  (proxy layer)   │
                                    └────────┬────────┘
                                             │
                                             ▼
                                    ┌─────────────────┐
                                    │  Supabase        │
                                    │  (Postgres + RLS)│
                                    └─────────────────┘
```

## Packages

```
@powersync/react-native   — SQLite engine + sync client
@powersync/common         — Schema / Table / Column types
@supabase/supabase-js     — Auth + upload connector
expo-sqlite               — PowerSync peer dependency
```

Install:
```sh
npx expo install @powersync/react-native @powersync/common expo-sqlite
npm install @supabase/supabase-js
```

## File Map

| File | Role |
|------|------|
| `lib/db/schema.ts` | SQLite table definitions — must mirror Supabase column names exactly |
| `lib/db/connector.ts` | Bridges PowerSync ↔ Supabase (JWT auth + upload queue) |
| `lib/db/system.ts` | PowerSync singleton, `PowerSyncProvider`, `useDB`, `useQuery` |
| `lib/db/utils.ts` | `generateId()`, unit conversion, Epley 1RM |
| `hooks/useWorkoutSession.ts` | Log today's sets; search exercises; edit/delete |
| `hooks/useWorkoutHistory.ts` | Past workouts, per-exercise history, weekly volume |
| `hooks/useWorkoutPlans.ts` | Read plans + today's session; activate/deactivate; constraints |
| `sync-rules.yaml` | Supabase → device data rules (deploy to PowerSync service) |
| `migrations/20260515_plans_active.sql` | Adds `is_active` column to `plans` |

## Environment Variables

Add to `.env` (or `app.config.ts`):

```
EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
EXPO_PUBLIC_POWERSYNC_URL=https://xxxx.powersync.journeyapps.com
```

## Wiring Up (app/_layout.tsx)

```tsx
import { PowerSyncProvider } from '@/lib/db/system';

export default function RootLayout() {
  return (
    <PowerSyncProvider>
      <Stack />
    </PowerSyncProvider>
  );
}
```

`PowerSyncProvider` boots the SQLite engine, connects to Supabase auth, and starts the sync stream. Disconnect/reconnect is handled automatically on sign-in/sign-out.

## Data Flow: Logging a Set

1. User selects an exercise (searched live from local `exercises` table).
2. User enters reps, weight, RIR and taps **Log**.
3. `useWorkoutSession.logLift()` runs an `INSERT` into local SQLite — instant, no network.
4. PowerSync detects the new row in its write queue.
5. When online, `connector.uploadData()` `UPSERT`s the row to Supabase.
6. Supabase RLS validates ownership; the row is committed.
7. PowerSync's sync stream delivers the committed row back down (and to any other signed-in devices).

**If the user is offline for steps 4–7**, the set sits in the local write queue and is uploaded whenever connectivity returns. The UI shows the set immediately — no spinner, no "pending" state.

## Data Flow: Workout Plans

1. Paid user requests a plan → backend calls Haiku, stores the result in `plans.structure` (JSONB).
2. PowerSync sees the new `plans` row in the user's bucket and delivers it to the device.
3. The full plan JSON is now in local SQLite — `useWorkoutPlans` reads it offline.
4. `todaySession` is computed client-side from the JSON (no network call).
5. When the user activates a different plan, `activatePlan()` writes `is_active = 1` locally; PowerSync uploads and the server's partial unique index enforces at-most-one-active per user.

## What Is and Isn't Available Offline

| Data | Offline? | Notes |
|------|----------|-------|
| Logging sets & workouts | ✅ Always | Written to SQLite instantly |
| Viewing workout history | ✅ Always | Queried from SQLite |
| Exercise library search | ✅ Always | `exercises` + `exercise_aliases` synced globally |
| Workout plans | ✅ After first sync | Full `structure` JSON stored locally |
| Streak display | ✅ After first sync | `streaks` row synced per-user |
| Percentile rank | ✅ After first sync | `percentile_vectors` synced globally (weekly batch) |
| Generating a new AI plan | ❌ Requires server | Calls Haiku; plan then syncs down |
| Updating user profile | ❌ Requires server | Auth changes need Supabase |

## Schema Notes for Backend Devs

- **Column names in `schema.ts` must exactly match the Supabase columns** that appear in `sync-rules.yaml`. If you rename a column, update both files and ship a migration.
- `user_constraints.constraint_id` is aliased as `id` in the sync rule so PowerSync can treat it as a standard primary key. The client schema calls this column `id`.
- `plans.is_active` is a client-managed flag; Supabase enforces at-most-one via a partial unique index (`migrations/20260515_plans_active.sql`).
- `percentile_vectors` is read-only on the client. Never add it to `MUTABLE_TABLES` in `connector.ts`.
- `muscle_groups` and `contraindications` are `TEXT[]` in Postgres. PowerSync delivers them as JSON array strings (`'["chest","triceps"]'`). Parse with `JSON.parse()` in the UI layer.

## Adding a New Synced Table

1. Write and apply the Supabase migration.
2. Add a `Table(...)` entry to `schema.ts`.
3. Add a data query to the appropriate bucket in `sync-rules.yaml`.
4. If the table is writable by the client, add its name to `MUTABLE_TABLES` in `connector.ts`.
5. Write a hook in `hooks/` that uses `useQuery()` to read from it.
