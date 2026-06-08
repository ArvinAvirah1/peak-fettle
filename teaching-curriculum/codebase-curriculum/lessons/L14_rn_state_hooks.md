# Lesson L14 — Component state, hooks, and custom hooks for domain logic

> **Track:** 2 — Mobile Architecture · **Status:** ⭐ Fully worked
> **Interactive app:** [`L14_rn_state_hooks.html`](L14_rn_state_hooks.html)
> **Estimated time:** ~45 min · **Prerequisite rungs:** L01–L13 (domain model + routing)

## 0. Source of truth (read fresh before teaching — code drifts)
- `mobile/src/hooks/useWorkout.ts` — Manages today's workout; loads sets; handles logSet/deleteSet mutations.
- `mobile/src/hooks/useWorkoutHistory.ts` — Fetches past workouts; computes PRs client-side; derives streak.
- `mobile/src/hooks/useAuth.ts` — Manages JWT, refresh token, user state, and login/logout.
- `mobile/src/hooks/useSyncStatus.ts`, `usePercentile.ts`, `useHealthMetrics.ts` — Other custom hooks for domain logic.
- `mobile/src/hooks/usePowerSyncLog.ts` — New offline-first hook combining REST init + PowerSync reads/writes (TICKET-027).
- `mobile/app/(tabs)/index.tsx` — Home screen using multiple hooks; demonstrates the render flow.
- `mobile/app/(tabs)/log.tsx` — Log screen; uses `useWorkout()` or `usePowerSyncLog()` to manage set logging.
- React hooks docs: `useState`, `useEffect`, `useCallback`, `useRef`, `useReducer`, `useContext`.

## 1. Learning outcomes (Bloom-tagged)
By the end, Arvin can:
- **(L1)** Name the three Hooks (`useState`, `useEffect`, `useCallback`) and explain when to use each.
- **(L2)** Trace `useWorkout()` from the Home tab: initial load, render, and the re-render when a set is logged.
- **(L3)** Implement a custom hook from a specification: "Write a hook that tracks the currently selected exercise and validates it."
- **(L4)** Analyze the `useWorkout()` vs. `usePowerSyncLog()` design: trade-offs of REST-based state vs. local-database-driven state for offline apps.
- **(L5)** Evaluate lifting state to a custom hook vs. a context vs. a state library (Redux, Jotai) for an app that must work offline mid-set.

## 2. Pre-lesson survey (M1) — ask LIVE
- "Confidence with React hooks (`useState`, `useEffect`)?"
- "Have you written a custom hook before, or always used built-in hooks?"
- "Today: focus on the pattern-building (useState → useEffect → custom hook), or also dive into offline-specific hooks like `usePowerSyncLog`?"
> Calibrate: Arvin has React experience but may be new to RN hooks patterns.

## 3. Spacing carry-over (M14)
From L13: "You saw `useAuth()` and `useTheme()` in the providers and layout files. Today you'll build hooks like those from the ground up."

## 4. The difficulty ladder for THIS lesson
1. `useState` — local component state.
2. `useEffect` — side effects (fetching, subscribing).
3. Re-renders: when state changes, the component re-renders with the new state.
4. Custom hooks — encapsulating state + effects into a reusable function.
5. `useCallback` — memoizing callbacks to prevent re-renders of child components.
6. Lifting state — moving state from a component to a custom hook (or context) to share it with siblings.
7. Offline-first state: REST API state vs. PowerSync local-database state.

## 5. Concept sequence

### Concept 1: `useState` — local component state
- **(M4) Generate first:** "The Home tab shows a greeting with the user's name. Where does the name come from, and when does the screen update if the user changes it?"
- **The idea:** `useState` is a hook that lets a functional component maintain state. It returns a value and a setter function. When the setter is called, React re-renders the component with the new state.
- **Real code** (from `mobile/app/(tabs)/index.tsx`):
  ```tsx
  const [expandedStreak, setExpandedStreak] = useState<boolean>(false);

  return (
    <Pressable onPress={() => setExpandedStreak(!expandedStreak)}>
      <Text>{expandedStreak ? '14 day streak!' : 'Tap to expand'}</Text>
    </Pressable>
  );
  ```
  When the user presses, `setExpandedStreak(!expandedStreak)` is called. React re-renders the component with `expandedStreak = true`. The `<Text>` now shows "14 day streak!".
- **Key insight:** State is per-component, per-instance. If two instances of this component exist, they have independent state.
- **(M6) Elaboration:** Why `useState` and not a class field? Functional components have no `this`. `useState` is a hook that RN (via React) uses to store state for that component instance. React uses the call order of hooks to track which state belongs to which variable (this is why hooks must be called at the top level, in the same order every render).
- **(M7) Concrete:** Initial state can be a value or a function. `useState(false)` sets it to false immediately. `useState(() => computeExpensiveInitialState())` computes it once and uses the result.
- **(M3) Retrieval check:** "You have a form with a text input. How would you track the input value in state, and what happens when the user types?"

### Concept 2: `useEffect` — side effects and data fetching
- **(M4) Generate first:** "When the Home tab mounts, it needs to fetch today's workout from the API. Where does that call happen, and how does the screen know when the data arrives?"
- **The idea:** `useEffect` is a hook that runs a function after the component renders. It's for side effects — API calls, subscriptions, timers. The effect runs after every render by default, but you can specify a dependency array to run it only when specific values change.
- **Real code** (from `mobile/src/hooks/useWorkout.ts` lines 73–75):
  ```tsx
  useEffect(() => {
    load();
  }, [load]);
  ```
  This effect runs after every render *only if `load` changes*. Since `load` is a `useCallback`, it only changes if its own dependencies change. This prevents infinite loops.
- **Real code** (initial load pattern):
  ```tsx
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const w = await createWorkout(getTodayKey());
      setWorkout(w);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]); // Empty means run once on mount
  ```
  On mount, `load()` is called. It fetches the workout and calls `setWorkout()`. React re-renders with the new state. The UI updates to show the workout.
- **(M6) Elaboration:** Why `useCallback`? Because if we define `load` directly in the component body, it's redefined on every render. That would cause the effect to run on every render (infinite loop). `useCallback` memoizes the function so it only changes when its dependencies (`[]` = never) change.
- **Dependency array rules:**
  - `[]` (empty) — run once on mount, never again.
  - `[value]` — run on mount and whenever `value` changes.
  - Omitted — run after every render (rarely used; can cause infinite loops).
- **(M3) Retrieval check:** "You're fetching a list of exercises and want to re-fetch if the user's units (kg vs. lbs) change. Write the useEffect with the dependency array."

### Concept 3: Custom hooks — encapsulating state and effects
- **(M4) Generate first:** "The Home tab, Log tab, and Rankings tab all need today's workout. Should each component have its own `useState` + `useEffect`, or is there a pattern to reuse the logic?"
- **The idea:** A custom hook is a JavaScript function that calls other hooks. It encapsulates state and effects into a reusable unit. The hook returns state and mutations, and any component can call it to get access to that state.
- **Real code** (`mobile/src/hooks/useWorkout.ts`):
  ```tsx
  export interface UseWorkoutResult {
    workout: Workout | null;
    sets: WorkoutSet[];
    isLoading: boolean;
    error: string | null;
    logSet: (payload: LogSetPayload) => Promise<WorkoutSet>;
    deleteSet: (id: string) => Promise<void>;
    refetch: () => Promise<void>;
  }

  export function useWorkout(): UseWorkoutResult {
    const [workout, setWorkout] = useState<Workout | null>(null);
    const [sets, setSets] = useState<WorkoutSet[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
      // ... fetch and set state
    }, []);

    useEffect(() => {
      load();
    }, [load]);

    const logSet = useCallback(async (payload: LogSetPayload): Promise<WorkoutSet> => {
      const newSet = await apiLogSet(payload);
      setSets((prev) => [...prev, newSet]);
      return newSet;
    }, []);

    const deleteSet = useCallback(async (id: string): Promise<void> => {
      await apiDeleteSet(id);
      setSets((prev) => prev.filter((s) => s.id !== id));
    }, []);

    return { workout, sets, isLoading, error, logSet, deleteSet, refetch: load };
  }
  ```
  Any component can now call `const { workout, sets, logSet } = useWorkout()` and get the state and mutations. If two components call the hook, they get *independent* state (separate `workout`, `sets`, etc.).
- **(M6) Elaboration:** The hook returns an interface (`UseWorkoutResult`). This is TypeScript — it documents what the hook provides and ensures the caller uses it correctly.
- **Lifting state with custom hooks:** Instead of each component managing its own state, the logic lives in the hook. This is a form of "lifting state" — extracting it from a component so multiple callers can share it (but each caller gets its own instance of the state).
- **(M7) Concrete:** The Home tab calls `useWorkout()`. The Log tab calls `useWorkout()` as well. They have independent state — if the Log tab logs a set and re-renders, the Home tab doesn't re-render (they're separate instances of the hook). To share state *across* components, you'd use a context or a state library.
- **(M3) Retrieval check:** "Write a custom hook `useExerciseSearch` that takes a search query and returns a list of exercises that match. Use `useState` to track the query and results."

### Concept 4: The render cycle and re-renders
- **(M4) Generate first:** "When you call `setWorkout(newWorkout)`, the Home tab re-renders. But does the Log tab re-render too? Why or why not?"
- **The idea:** When a component's state changes, React re-renders *that component and its children*. Sibling components don't re-render unless their state changes. This is crucial for performance — the Log tab shouldn't re-render just because the Home tab fetched new data.
- **Real flow:**
  1. User opens the Home tab. `useWorkout()` is called, `useState` initializes state, `useEffect` fetches today's workout.
  2. API responds. `setWorkout(w)` is called inside the effect.
  3. React marks the component as needing a re-render and re-renders the Home tab with the new state.
  4. The Home tab renders `<Text>Workout: {workout.name}</Text>` with the new data.
  5. The Log tab (a sibling, in the `<Tabs>` component) is *not* re-rendered. Its state is untouched.
  6. If the user taps the Log tab and logs a set, `useWorkout()` (in the Log tab) is called with independent state. It fetches today's workout separately. The Log tab re-renders; the Home tab doesn't (they're independent instances of the hook).
- **(M6) Elaboration:** This is why two components can call the same hook and get independent state. Each instance of the hook has its own `useState` storage. React keeps track of this via component identity and hook call order.
- **(M9) Faded review:** What if you *want* the Home and Log tabs to share state? You'd move the state to a parent context or a custom hook called from a parent context, and both tabs would read from that shared state.
- **(M3) Retrieval check:** "You have two `useWorkout()` calls on the same screen (Home and Archive tabs side-by-side). If the Home tab logs a set, does the Archive tab see it? Why or why not?"

### Concept 5: `useCallback` — memoizing callbacks to prevent re-renders
- **(M4) Generate first:** "The `useWorkout` hook returns `logSet` function. If you define `logSet` directly in the component body, it's redefined on every render. Why does that matter?"
- **The idea:** `useCallback` memoizes a function. It returns the same function instance across renders *if the dependencies haven't changed*. This is useful when a child component needs a function prop — if the function is redefined every render, the child re-renders unnecessarily.
- **Real code** (from `useWorkout.ts`):
  ```tsx
  const logSet = useCallback(
    async (payload: LogSetPayload): Promise<WorkoutSet> => {
      const newSet = await apiLogSet(payload);
      setSets((prev) => [...prev, newSet]);
      return newSet;
    },
    [] // Empty: function never changes
  );
  ```
  On every render, `logSet` is the *same function object*. If a child component is memoized (via `memo`), it won't re-render because the function prop is unchanged.
- **(M6) Elaboration:** When do you need `useCallback`? When the function is passed to a child component that's memoized with `React.memo`. If the child isn't memoized, the extra render from a new function object is negligible. Use it for performance optimization, not by default.
- **(M3) Retrieval check:** "The `logSet` function calls `apiLogSet(payload)`. If the API endpoint URL changes, does the `logSet` function need to be redefined? Why or why not?"

### Concept 6: Offline-first hooks — `usePowerSyncLog` vs. `useWorkout`
- **(M4) Generate first:** "You've seen `useWorkout`, which fetches data from the API. Peak Fettle is offline-first — sets should be logged even on the gym floor with no Wi-Fi. How does that change the hook?"
- **The idea:** `useWorkout` is REST-based: it calls the API to load data, and mutations are sent to the API. For an offline-first app, this is a footgun — if the user logs a set and the network drops, the set is lost.
  
  `usePowerSyncLog` (new, TICKET-027) combines REST init (get today's workout ID) with PowerSync reads/writes (log sets locally):
  ```tsx
  export function usePowerSyncLog(): UseWorkoutResult {
    const [workoutId, setWorkoutId] = useState<string | null>(null);
    const [initError, setInitError] = useState<string | null>(null);

    // Step 1: REST — get or create today's workout
    useEffect(() => {
      const init = async () => {
        try {
          const w = await createWorkout(getTodayKey());
          setWorkoutId(w.id);
        } catch (err) {
          setInitError(err.message);
        }
      };
      init();
    }, []);

    // Step 2: PowerSync — watch the local SQLite sets table
    const [sets, setSets] = useState<WorkoutSet[]>([]);
    useEffect(() => {
      if (!workoutId) return;
      const subscription = db.watch(
        'SELECT * FROM sets WHERE workout_id = ?',
        [workoutId],
        { onChange: (rows) => setSets(rows) }
      );
      return () => subscription.unsubscribe();
    }, [workoutId]);

    // Step 3: Mutations go to local SQLite (PowerSync queues them for upload)
    const logSet = useCallback(
      async (payload: LogSetPayload): Promise<WorkoutSet> => {
        const id = generateUUID();
        const weight_raw = Math.round(payload.weight_kg * 8);
        await db.execute('INSERT INTO sets (...) VALUES (...)', [
          id, workoutId, weight_raw, payload.reps, ...
        ]);
        // No API call — PowerSync will upload when online
        return { id, ...payload }; // Optimistic return
      },
      [workoutId]
    );

    return { workout: null, sets, isLoading: !workoutId && !initError, error: initError, logSet, deleteSet, refetch };
  }
  ```
- **Key difference:** REST hook calls `apiLogSet()` and waits for the response. PowerSync hook calls `db.execute()` (instant local write) and returns immediately. The user sees the set logged instantly, even offline. PowerSync handles the sync when the device is online.
- **(M6) Elaboration:** Why a hybrid (REST for init, PowerSync for writes)? Because the server owns the workout UUID. You must ask the server "give me today's workout" to get the ID to write sets with. But once you have the ID, you can write locally and let PowerSync handle the upload.
- **(M7) Concrete:** User scenario:
  1. User opens the Log tab at 6 AM in the gym (no Wi-Fi).
  2. `usePowerSyncLog` mounts. It calls `createWorkout(getTodayKey())` — succeeds (maybe cached from the night before, or the device was online at 11:59 PM).
  3. Once the workout ID arrives, the hook subscribes to the local `sets` table.
  4. User logs a set. `logSet()` writes to local SQLite instantly. No network call.
  5. User logs 10 more sets. All written locally.
  6. User exits the gym and connects to Wi-Fi. PowerSync detects the new sets in the write queue and uploads them to Supabase.
  7. Supabase validates ownership (via RLS) and commits the sets.
  8. PowerSync's sync stream delivers them back to the device (and to any other signed-in device).
- **(M3) Retrieval check:** "In `usePowerSyncLog`, why must `createWorkout` be called at least once (even if it returns a cached workout)?"

### Concept 7: Context and lifting state for app-wide sharing
- **(M4) Generate first:** "The Home tab shows the user's name. The Log tab also needs the name for the greeting. Do you call `useAuth()` in both, or share state somehow?"
- **The idea:** If multiple components need the same state, you have two options: (1) Call the custom hook in each (independent state instances, but they're actually the same data from the same source). (2) Use a context to share state.
  - **Context example** (`src/context/AuthContext.tsx`):
    ```tsx
    import { createContext, useContext } from 'react';

    const AuthContext = createContext<AuthContextValue | null>(null);

    export function AuthProvider({ children }) {
      const [user, setUser] = useState<User | null>(null);
      const [accessToken, setAccessToken] = useState<string | null>(null);

      return (
        <AuthContext.Provider value={{ user, accessToken }}>
          {children}
        </AuthContext.Provider>
      );
    }

    export function useAuth() {
      const ctx = useContext(AuthContext);
      if (!ctx) throw new Error('useAuth must be inside AuthProvider');
      return ctx;
    }
    ```
  - Any component wrapped inside `<AuthProvider>` can call `useAuth()` and get the shared state.
- **When to use context?** When state needs to be shared across *many* components (not just 2–3), and passing it via props is unwieldy. Context avoids "prop drilling."
- **(M6) Elaboration:** Context doesn't prevent re-renders. If the context value changes, every component that uses it re-renders. For performance-critical apps, you'd split contexts by value (e.g., `UserContext` for user data, `UIContext` for UI state) so a change in one doesn't trigger a re-render of everything.
- **(M3) Retrieval check:** "The Log tab needs to know if a set is currently being uploaded. Would you pass this state via a context, a custom hook, or something else? Why?"

## 6. Teach-back (M10)
"Explain to a teammate: what does `useWorkout()` do, why the hook returns state and mutations together, and how it differs from `usePowerSyncLog` for offline-first logging."

## 7. Cumulative review (M13) — rapid-fire
1. What's the difference between `useState` and `useEffect`?
2. When you call `useWorkout()` in the Home tab and again in the Log tab, do they share state?
3. Why does `useCallback` memoize the `logSet` function?
4. In `usePowerSyncLog`, why is the REST init separate from the PowerSync writes?

## 8. The graded quiz (Bloom L1–L5, AI-graded in the app)

| # | Bloom | Type | Prompt | Rubric | Model answer (reference) | Pts |
|---|-------|------|--------|--------|--------------------------|-----|
| q1 | L1 | mc | What does `useState` return? | Identifies the [state, setter] tuple | An array with two elements: the current state value and a function to update it | 8 |
| q2 | L2 | free | Trace the flow: user opens the Home tab, `useWorkout()` is called, API fetches the workout. Where does the fetch happen (which hook?), and when does the UI update? | Identifies `useEffect` for the fetch; explains that the UI updates after the API responds and `setWorkout` is called | `useEffect` runs after the component renders. Inside it, `load()` calls the API. When the API responds, `setWorkout(w)` is called, which triggers a re-render of the Home tab with the new workout data. | 12 |
| q3 | L3 | free | Write a custom hook `useDebounced` that takes a value and returns a debounced version (delayed by 500 ms). Use `useState` and `useEffect`. | Correct implementation with proper cleanup; applies useEffect with dependency array | `function useDebounced(value) { const [debounced, setDebounced] = useState(value); useEffect(() => { const timer = setTimeout(() => setDebounced(value), 500); return () => clearTimeout(timer); }, [value]); return debounced; }` | 12 |
| q4 | L4 | free | Compare `useWorkout` (REST-based) and `usePowerSyncLog` (SQLite-based) for offline-first logging. What happens when the user logs a set and the device is offline? | Traces the offline path; identifies REST vs. PowerSync behavior; discusses user experience | REST: API call fails, set is lost, user sees error. PowerSync: `db.execute()` succeeds locally, no network call, set is queued for upload when online. The UI shows the set immediately, no error, no spinner. PowerSync is correct for offline-first. | 18 |
| q5 | L5 | free | The Log tab and Home tab both call `useWorkout()`. They have separate state. But when the user logs a set in the Log tab, the Home tab should see it (if it's open). Evaluate three approaches: (1) each component calls `useWorkout()` independently (status quo), (2) move state to a context, (3) use a state library like Redux. | Takes a position; traces implications; considers trade-offs | (1) is bad: the Home tab is stale (it won't see the new set unless it manually refetches). (2) is better: both tabs can read from `AuthContext.workout` or a dedicated `WorkoutContext`, so they stay in sync. But refetches are tricky. (3) Redux is overkill for this use case. Best for Peak Fettle: move the shared state to a context, with manual refetch on tab switch (cheap API call for a single workout). | 21 |
| q6 | L5 | free | The `usePowerSyncLog` hook has a REST init step (call `createWorkout`) and then PowerSync writes. Why can't the entire flow (init + writes) be done with PowerSync (local SQLite) without touching the API? | Identifies the server as the source of truth for the workout UUID; explains the bootstrap problem | The server owns the workout UUID. You can't know which sets to insert without a valid workout_id (foreign key constraint). PowerSync syncs *existing* rows from the server, but it doesn't generate server-owned IDs. You must ask the server once, then you have permission to write locally. | 21 |
| q7 | L6 (opt) | free | Propose how you'd add a "local-only" note to each set (not synced to Supabase). The user can add a note offline, but it must stay on-device only (e.g., for privacy). How would you store it and prevent it from syncing? | Architectural decision; considers PowerSync scope; identifies data model | Add a `notes` column to the local `sets` table, but do NOT include it in `schema.ts` (PowerSync's schema). Mark the `sets` table as MUTABLE in the connector, but instruct the connector to strip the `notes` column before uploading to Supabase. The column exists locally, is editable, but will never sync upstream. | 15 |

## 9. Custom interactive widget
**Hook state timeline** — a visual animation showing `useState`, `useEffect`, and component re-renders over time. The user can click buttons to trigger state changes and see how React re-renders the component and executes effects. Demonstrates the "render → effect → re-render" cycle.

## 10. End-of-session updates (agent)
- Grade quiz via the app's "Grade with Claude."
- Update `teacher_skill.md` PART 2: hooks comprehension (useState/useEffect/useCallback); any confusion about custom hooks vs. contexts; offline-first hook patterns.
- Offer to schedule L15 (API client + request/response cycle) in 2–3 days; queue carry-over: "You've seen the hooks call `apiLogSet()`, `createWorkout()`, etc. Today we'll build the API layer that makes those calls work."
