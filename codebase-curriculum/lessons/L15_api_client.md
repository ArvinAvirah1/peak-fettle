# Lesson L15 — Building the API client: authentication, interceptors, and the request/response cycle

> **Track:** 2 — Mobile Architecture · **Status:** ⭐ Fully worked
> **Interactive app:** [`L15_api_client.html`](L15_api_client.html)
> **Estimated time:** ~45 min · **Prerequisite rungs:** L01–L14 (domain + routing + hooks)

## 0. Source of truth (read fresh before teaching — code drifts)
- `mobile/src/api/client.ts` — Base Axios instance, auth interceptors, token refresh logic.
- `mobile/src/api/auth.ts` — POST /auth/login, /auth/signup, /auth/refresh, /auth/logout.
- `mobile/src/api/sets.ts` — POST /sets, GET /sets, DELETE /sets/:id.
- `mobile/src/api/workouts.ts`, `exercises.ts`, `groups.ts`, `plans.ts` — Domain-specific API modules.
- `mobile/src/context/AuthContext.tsx` — Injects auth handlers into the client via `setAuthHandlers()`.
- `mobile/src/types/api.ts` — TypeScript types for all API request/response payloads.
- Backend reference: `peak-fettle-server/routes/sets.js`, `auth.js` (the Express API the client calls).

## 1. Learning outcomes (Bloom-tagged)
By the end, Arvin can:
- **(L1)** Name the parts of an HTTP request: method, URL, headers, body, and query parameters.
- **(L2)** Explain what an interceptor is and why the client uses one to attach the `Authorization` header.
- **(L3)** Trace a request from the Home tab to the server: `apiClient.post('/sets', ...)` → interceptor attaches JWT → server validates → response returns.
- **(L4)** Analyze the token refresh flow: 401 response → one silent refresh attempt → success (retry original request) or failure (redirect to login).
- **(L5)** Evaluate the "single refresh attempt" strategy against alternatives (cascade retries, queue-and-drain) for a mobile app with weak connectivity, and defend it for Peak Fettle's use case.

## 2. Pre-lesson survey (M1) — ask LIVE
- "Experience with HTTP (REST APIs, status codes like 401/403)?"
- "Ever debugged a network request? How do you inspect request headers?"
- "Today: focus on the client architecture (Axios, interceptors, token refresh), or also the design of individual API modules (sets, exercises, etc.)?"
> Calibrate: check HTTP/REST comfort level; offer to revisit basics if needed.

## 3. Spacing carry-over (M14)
From L14: "You called `apiLogSet(payload)` in the `useWorkout()` hook. Today, we'll build the API layer that makes that call, and trace the JWT all the way from the AuthContext to the server."

## 4. The difficulty ladder for THIS lesson
1. HTTP fundamentals: method, URL, headers, body, status codes (101, 200, 401, 403, 500).
2. Axios: creating an instance, setting base URL, default headers.
3. Interceptors: request (attach token), response (handle 401).
4. Token management: in-memory access token, refresh token in secure storage.
5. Silent token refresh: on 401, call /auth/refresh with the refresh token, get new pair, retry original request.
6. Error handling: distinguish API errors (400, 401) from network errors.
7. Race conditions: multiple requests fail with 401 simultaneously; deduplicate refresh calls.

## 5. Concept sequence

### Concept 1: HTTP fundamentals and REST API design
- **(M4) Generate first:** "You want to log a set (exercise, reps, weight). You send a message to the server. What information must you include, and how?"
- **The idea:** HTTP requests have:
  - **Method:** GET (read), POST (create), PUT (update), DELETE (delete), PATCH (partial update).
  - **URL:** `https://api.example.com/sets` or `https://api.example.com/sets/abc-123`.
  - **Headers:** Metadata (Content-Type, Authorization, etc.).
  - **Body:** JSON payload for POST/PUT/PATCH.
  - **Query parameters:** `?workoutId=xyz&limit=50` for filtering.
  - **Status code:** 200 (OK), 201 (Created), 400 (Bad Request), 401 (Unauthorized), 404 (Not Found), 500 (Server Error).
- **(M7) Concrete — logging a set:**
  ```
  POST /sets
  Authorization: Bearer <access_token>
  Content-Type: application/json

  {
    "workout_id": "550e8400-e29b-41d4-a716-446655440000",
    "exercise_id": "1",
    "kind": "lift",
    "reps": 5,
    "weight_kg": 80,
    "rir": 2
  }
  ```
  Server validates the token, checks ownership (the user owns the workout), inserts the set, returns:
  ```
  201 Created
  Content-Type: application/json

  {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "workout_id": "550e8400-e29b-41d4-a716-446655440000",
    "exercise_id": "1",
    "kind": "lift",
    "reps": 5,
    "weight_kg": 80,
    "rir": 2,
    "created_at": "2026-05-21T18:30:00Z"
  }
  ```
- **(M6) Elaboration:** The token is in the Authorization header, not the body. Why? Because the header is a standard place for credentials, and some proxies/firewalls understand it. The body is for user data (the set itself).
- **(M3) Retrieval check:** "You're fetching exercises. Would you use GET /exercises?category=chest or POST /exercises with a body? Why?"

### Concept 2: Axios and the base client instance
- **(M4) Generate first:** "You have 20 API endpoints. Every request needs the Authorization header. Do you add the header to each request, or is there a way to do it once?"
- **The idea:** Axios is a JavaScript HTTP library. Creating a client instance lets you set defaults (base URL, headers, timeout) that apply to all requests.
- **Real code** (`mobile/src/api/client.ts` lines 66–72):
  ```tsx
  export const apiClient: AxiosInstance = axios.create({
    baseURL: BASE_URL,
    timeout: 15_000,
    headers: {
      'Content-Type': 'application/json',
    },
  });
  ```
  Now, `apiClient.post('/sets', payload)` automatically prefixes the base URL and sets Content-Type. Requests go to `${BASE_URL}/sets`.
- **(M7) Concrete — without the client:**
  ```tsx
  // Tedious: repeat base URL and headers everywhere
  const response = await axios.post('http://localhost:3001/sets', payload, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  ```
  **With the client:**
  ```tsx
  // Clean: base URL and headers set globally
  const response = await apiClient.post('/sets', payload);
  // The interceptor adds the Authorization header
  ```
- **(M3) Retrieval check:** "If the base URL changes from `http://localhost:3001` to `https://api.peakfettle.com`, how many places in the code need to change?"

### Concept 3: Request interceptors — attaching the authorization token
- **(M4) Generate first:** "The token lives in AuthContext (in-memory). Every API call needs to attach it as `Authorization: Bearer <token>`. Where does that attachment happen?"
- **The idea:** An interceptor is a function that runs before every request (request interceptor) or after every response (response interceptor). The request interceptor reads the token and adds it to the headers.
- **Real code** (`mobile/src/api/client.ts` lines 78–87):
  ```tsx
  apiClient.interceptors.request.use(
    (config: InternalAxiosRequestConfig): InternalAxiosRequestConfig => {
      const token = _authHandlers?.getAccessToken();
      if (token && config.headers) {
        config.headers['Authorization'] = `Bearer ${token}`;
      }
      return config;
    },
    (error: unknown) => Promise.reject(error)
  );
  ```
  For every request, this runs. It calls `getAccessToken()` (provided by AuthContext) and adds the token to headers. If there's no token, the header isn't added.
- **Why not import the token directly from AuthContext?** Because that would create a circular dependency:
  - `client.ts` needs the token from `AuthContext.tsx`.
  - `AuthContext.tsx` imports `apiClient` from `client.ts` to make API calls.
  - Circular: `client → AuthContext → client` (breaks at import time).
  - Solution: AuthContext calls `setAuthHandlers()` at startup, injecting a callback (`getAccessToken`) that the client can call without importing AuthContext directly.
- **(M6) Elaboration:** The callback `_authHandlers?.getAccessToken()` reads the current token every time a request is made. This ensures that if the token is refreshed while requests are in flight, the new token is used for subsequent requests.
- **(M3) Retrieval check:** "If you added a request interceptor to log all requests, where would you place it (before or after the auth interceptor)? Why?"

### Concept 4: Response interceptors and token refresh on 401
- **(M4) Generate first:** "The user logs in at 6 PM. The access token expires at 8 PM. At 8:15 PM, they log a set. The API returns 401 (Unauthorized). What should the app do?"
- **The idea:** A 401 means "your credentials are invalid or expired." Rather than immediately forcing the user to log in again, the client can try a *silent refresh*: use the refresh token to get a new access token, then retry the original request. If the refresh fails, *then* redirect to login.
- **Real code** (`mobile/src/api/client.ts` lines 99–148):
  ```tsx
  apiClient.interceptors.response.use(
    (response: AxiosResponse) => response,
    async (error: unknown) => {
      if (!axios.isAxiosError(error)) {
        return Promise.reject(error);
      }

      const originalRequest = error.config as AxiosRequestConfig & { _retried?: boolean };

      // Only retry on 401, and only once
      if (error.response?.status !== 401 || originalRequest._retried) {
        return Promise.reject(error);
      }

      if (!_authHandlers) {
        return Promise.reject(error);
      }

      const refreshToken = _authHandlers.getRefreshToken();
      if (!refreshToken) {
        _authHandlers.onLogout();
        return Promise.reject(error);
      }

      originalRequest._retried = true;

      try {
        // Deduplicate concurrent refresh calls
        if (!_refreshPromise) {
          _refreshPromise = _doRefresh(refreshToken).finally(() => {
            _refreshPromise = null;
          });
        }
        const newAccessToken = await _refreshPromise;

        // Retry the original request with the new token
        if (originalRequest.headers) {
          (originalRequest.headers as Record<string, string>)[
            'Authorization'
          ] = `Bearer ${newAccessToken}`;
        }
        return apiClient(originalRequest);
      } catch {
        _authHandlers.onLogout();
        return Promise.reject(error);
      }
    }
  );
  ```
  **Flow:**
  1. Request fails with 401.
  2. Interceptor checks: is this a 401? Have we already retried this request? (No → proceed.)
  3. Do we have a refresh token? (Yes → proceed.)
  4. Call `_doRefresh(refreshToken)` to get a new access token.
  5. Update the original request with the new token.
  6. Call `apiClient(originalRequest)` to retry.
  7. If retry succeeds, return the response. If it fails, call `onLogout()` (redirect to login).
- **Key detail: deduplication.** If many requests fail with 401 simultaneously (e.g., token refresh takes 2 seconds, user logs 10 sets concurrently), we don't want to call `/auth/refresh` 10 times. Instead, `_refreshPromise` stores the *first* refresh call, and all 10 requests await it. Once it resolves, all 10 retry their original requests with the new token.
  ```tsx
  if (!_refreshPromise) {
    _refreshPromise = _doRefresh(refreshToken).finally(() => {
      _refreshPromise = null;
    });
  }
  const newAccessToken = await _refreshPromise;
  ```
- **(M6) Elaboration:** Why `_retried` flag? To prevent infinite loops. If a request is retried and *still* returns 401 (e.g., the refresh token is revoked), we don't retry again. One retry per request, max.
- **(M3) Retrieval check:** "The refresh token is stored in SecureStore (persistent storage). The access token is in-memory. If the app restarts, how does the silent refresh work on the first request?"

### Concept 5: Token storage and AuthContext integration
- **(M4) Generate first:** "The access token expires in 15 minutes. The refresh token lasts 30 days. Where do you store each, and why differently?"
- **The idea:**
  - **Access token:** In-memory. Short-lived (15 min), used on every request, high security (not persisted).
  - **Refresh token:** SecureStore (encrypted device storage). Long-lived (30 days), used only on refresh, survives app restart.
- **Real code** (from `mobile/src/context/AuthContext.tsx` — conceptual):
  ```tsx
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    // On app startup, load the refresh token and do a silent refresh
    (async () => {
      const rt = await SecureStore.getItemAsync('refreshToken');
      if (rt) {
        try {
          const response = await refreshTokens(rt);
          setAccessToken(response.accessToken);
          await SecureStore.setItemAsync('refreshToken', response.refreshToken);
          setIsAuthenticated(true);
        } catch {
          // Refresh failed; user must log in
          setIsAuthenticated(false);
        }
      }
      setIsLoading(false);
    })();
  }, []);

  // When user logs in
  const login = async (email, password) => {
    const response = await login(email, password);
    setAccessToken(response.accessToken);
    await SecureStore.setItemAsync('refreshToken', response.refreshToken);
    setIsAuthenticated(true);
    setAuthHandlers({ getAccessToken: () => accessToken, ... });
  };
  ```
  The auth context stores the access token in React state (in-memory) and the refresh token in SecureStore. It also injects `setAuthHandlers()` so the client can read the current token.
- **(M6) Elaboration:** Why call `setAuthHandlers()` *after* setting the token? Because the request interceptor calls `getAccessToken()` immediately. If you call `setAuthHandlers()` before setting the token, the first request sees `null`.
- **(M3) Retrieval check:** "If a user manually deletes the app's SecureStore (via the OS settings), what happens on the next app launch?"

### Concept 6: Domain-specific API modules
- **(M4) Generate first:** "The client has 20 endpoints. Do you make all requests directly from components, or organize them somehow?"
- **The idea:** API modules group related endpoints by domain. Each module imports `apiClient` and wraps endpoints in functions that handle request/response mapping.
- **Real code** (`mobile/src/api/sets.ts`):
  ```tsx
  export async function getSetsForWorkout(workoutId: string): Promise<WorkoutSet[]> {
    const response = await apiClient.get<SetsPage>('/sets', {
      params: { workoutId },
    });
    return response.data.sets;
  }

  export async function logSet(payload: LogSetPayload): Promise<WorkoutSet> {
    const response = await apiClient.post<WorkoutSet>('/sets', payload);
    return response.data;
  }

  export async function deleteSet(id: string): Promise<void> {
    await apiClient.delete(`/sets/${id}`);
  }
  ```
  Benefits:
  - **Single source of truth for URL paths.** If the API changes from `/sets` to `/v2/sets`, you update one file.
  - **Type safety.** The response type is declared (`<WorkoutSet[]>`, `<SetsPage>`).
  - **Reusability.** Hooks call these functions; components never call `apiClient` directly.
  - **Error handling.** If you need to log errors or retry, you do it here, not in 20 different places.
- **(M7) Concrete:** Without modules:
  ```tsx
  // In Home.tsx
  const response = await apiClient.get('/sets', { params: { workoutId } });
  const sets = response.data.sets;

  // In Log.tsx
  const response = await apiClient.get('/sets', { params: { workoutId } });
  const sets = response.data.sets;

  // Duplicated everywhere!
  ```
  **With modules:**
  ```tsx
  // In Home.tsx and Log.tsx
  const sets = await getSetsForWorkout(workoutId);
  ```
- **(M3) Retrieval check:** "Why does `getSetsForWorkout` return `WorkoutSet[]` but `logSet` returns `WorkoutSet` (singular)?"

### Concept 7: Error handling and distinguishing error types
- **(M4) Generate first:** "A request fails. How do you know if it's a network error (user is offline) vs. an auth error (token revoked) vs. a server error (500)?"
- **The idea:** Axios errors have different shapes. Network errors (no response) vs. HTTP errors (response with status code) vs. other errors. Hooks should handle each differently.
- **Real code** (in a hook):
  ```tsx
  try {
    const w = await createWorkout(getTodayKey());
    setWorkout(w);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load workout';
    setError(message);
  }
  ```
  For more granular handling:
  ```tsx
  import { AxiosError } from 'axios';

  try {
    // ...
  } catch (err) {
    if (axios.isAxiosError(err)) {
      if (err.response?.status === 401) {
        // Auth error (handled by interceptor, but in case it reaches here)
        setError('Session expired. Please log in again.');
      } else if (err.response?.status === 400) {
        // Validation error
        setError(err.response.data.message || 'Invalid input');
      } else if (err.code === 'ECONNABORTED') {
        // Timeout
        setError('Request timed out. Please check your connection.');
      } else if (!err.response) {
        // Network error
        setError('No internet connection');
      } else {
        // Other HTTP error
        setError(`Server error: ${err.response.status}`);
      }
    } else {
      // Non-Axios error (e.g., JSON parse error)
      setError('An unexpected error occurred');
    }
  }
  ```
- **(M6) Elaboration:** In Peak Fettle, most errors are silently caught and logged (using `catch(() => {})`). The UI shows a generic loading spinner if a required fetch fails. For non-critical fetches (like PR detection), errors are silently ignored.
- **(M3) Retrieval check:** "You're fetching exercises but the user's internet is slow. The request times out. What error message should the user see?"

## 6. Teach-back (M10)
"Explain to a backend dev: how does the client attach the JWT to every request, what happens if the token expires mid-request, and why the client deduplicates refresh calls."

## 7. Cumulative review (M13) — rapid-fire
1. What are the parts of an HTTP request?
2. Why does the request interceptor call `getAccessToken()` instead of importing the token directly from AuthContext?
3. Trace a 401 response: what happens, and when is the user redirected to login?
4. Why are API modules (sets.ts, exercises.ts) better than making requests directly in components?

## 8. The graded quiz (Bloom L1–L5, AI-graded in the app)

| # | Bloom | Type | Prompt | Rubric | Model answer (reference) | Pts |
|---|-------|------|--------|--------|--------------------------|-----|
| q1 | L1 | mc | In HTTP, what does a 401 status code mean? | Identifies the correct meaning | Unauthorized — the request lacks valid authentication credentials | 8 |
| q2 | L2 | free | Explain the difference between the request interceptor and the response interceptor in `client.ts`. What does each do? | Identifies request-side (attach token) vs. response-side (handle 401 & refresh); explains the flow | Request interceptor: reads the current access token and adds it to the Authorization header before every request. Response interceptor: catches 401 responses, attempts a silent refresh with the refresh token, retries the original request if successful, or logs out if refresh fails. | 12 |
| q3 | L3 | free | Trace the flow: User opens Log tab, calls `logSet(...)` from the hook, which calls `apiClient.post('/sets', ...)`. Write the sequence of interceptors, headers, and server response. | Traces the full path; identifies when token is attached; shows the response | Request interceptor attaches `Authorization: Bearer <token>`. POST /sets is sent with the payload. Server validates token, checks ownership, inserts the set. Responds 201 with the set JSON. Axios resolves the promise with `response.data`. Hook receives the new set and re-renders. | 12 |
| q4 | L4 | free | The response interceptor has `if (!_refreshPromise)` and deduplicates refresh calls. Why is this necessary, and what would happen without it? | Identifies race condition; explains cascade of refresh calls; justifies deduplication | If 10 requests fail with 401 simultaneously, all 10 interceptors would call `_doRefresh()`, flooding the server with 10 refresh requests. Deduplication (storing the refresh promise in `_refreshPromise`) ensures only 1 refresh runs; all 10 requests await it, then retry together. Without it, the server might reject some refresh calls (rate limiting) and the user's session becomes inconsistent. | 18 |
| q5 | L5 | free | The client retries a failed request once (with the 401 flag). Evaluate this strategy: should it retry multiple times with backoff, or is once enough? Consider weak gym Wi-Fi and Peak Fettle's use case. | Takes a position; traces failure modes; considers UX | Retrying once is correct: (1) a 401 means the token is stale/revoked — retrying won't help unless the refresh succeeds. (2) If refresh fails, the user's session is invalid; retrying again is pointless. (3) In a gym with weak Wi-Fi, cascading retries would drain the battery. (4) One attempt + clear error message is better UX. If the refresh *succeeds*, the retry succeeds; if it fails, we redirect to login cleanly. | 21 |
| q6 | L5 | free | Design the error handling for the Log tab: the user logs a set and the API returns 400 (Bad Request, invalid exercise ID). What should the UI show, and should the set be added to the local list optimistically? | Considers error types, optimistic UI, user feedback | 400 is a validation error — don't retry. Show an error toast: "Invalid exercise. Please select from the library." Do not add the set locally (pessimistic). The user must fix the input and try again. Optimistic UI only works for successful requests or temporary failures (network error → retry); not for 400s (programmer error). | 21 |
| q7 | L6 (opt) | free | The `apiClient` is a singleton — all API calls go through the same Axios instance. Propose how you'd add request logging (log every request/response for debugging), and where it would live. | Identifies the interceptor pattern; places logging appropriately | Add a request logging interceptor: `apiClient.interceptors.request.use((config) => { console.log('Request:', config.method, config.url, config.data); return config; })` and a response logging interceptor: `apiClient.interceptors.response.use((response) => { console.log('Response:', response.status, response.data); return response; }, (error) => { ... })`. Place these after the auth interceptor but before error handling. Logs go to the console (or a file, if you add persistence). | 15 |

## 9. Custom interactive widget
**Request/response visualizer** — a live diagram showing the full HTTP cycle: user action → request (with headers/body) → server → response (with status/body) → JavaScript handling. User can toggle between success, 401 with refresh, and error scenarios to see the flow.

## 10. End-of-session updates (agent)
- Grade quiz via the app's "Grade with Claude."
- Update `teacher_skill.md` PART 2: HTTP/REST comprehension; interceptor patterns; token refresh understanding; any confusion about error handling.
- Offer to schedule L16 (offline-first sync with PowerSync) in 2–3 days; queue carry-over: "The API client you just learned sends requests to the server. For offline-first, we need a local SQLite database and a sync service. Today we'll explore that layer."
