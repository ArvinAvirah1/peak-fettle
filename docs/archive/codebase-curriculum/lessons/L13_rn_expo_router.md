# Lesson L13 — React Native, Expo, and file-based routing with expo-router

> **Track:** 2 — Mobile Architecture · **Status:** ⭐ Fully worked
> **Interactive app:** [`L13_rn_expo_router.html`](L13_rn_expo_router.html)
> **Estimated time:** ~40 min · **Prerequisite rungs:** L01–L12 (basic domain + API concepts)

## 0. Source of truth (read fresh before teaching — code drifts)
- `mobile/app.json` — Expo project config; plugin list; EAS Build settings.
- `mobile/app/_layout.tsx` — Root layout; auth guard; provider nesting (`ThemeProvider` → `AuthProvider` → `PowerSyncProvider`).
- `mobile/app/(auth)/_layout.tsx` — Auth route group; login/register stacks.
- `mobile/app/(tabs)/_layout.tsx` — Authenticated tab bar; five main screens.
- `mobile/app/(tabs)/index.tsx` — Home tab (greeting, streak, recent activity).
- `mobile/app/(tabs)/log.tsx` — Logging screen (FAB, exercise picker).
- `mobile/app/(tabs)/rankings.tsx`, `plans.tsx`, `profile.tsx` — Other main tabs.
- Push screens: `health-metrics.tsx`, `groups.tsx`, `group-detail.tsx`, `progress.tsx`, `workout-day.tsx`, `workout-history.tsx`.
- Glossary & one-time screens: `intro.tsx`, `splash.tsx`, `templates.tsx`, `cosmetics.tsx`.

## 1. Learning outcomes (Bloom-tagged)
By the end, Arvin can:
- **(L1)** Name the three core differences between React Native, web React, and Expo.
- **(L2)** Explain why `mobile/app/(auth)/` and `mobile/app/(tabs)/` are route groups and how folders become URLs.
- **(L3)** Trace the request "user taps Home tab" through the navigation tree: `/(tabs)` group → `index.tsx` → `<Tabs.Screen name="index">` rendering.
- **(L4)** Analyze the provider nesting order (`ThemeProvider` outermost, `PowerSyncProvider` innermost) and predict what breaks if it changes.
- **(L5)** Evaluate the "auth guard in the root layout" pattern against alternatives (a dedicated redirect screen, a separate login/app router), and defend the current approach for an offline-first app.

## 2. Pre-lesson survey (M1) — ask LIVE
- "Have you used React Navigation (React Native's older routing) or SwiftUI navigation? How does file-based routing feel different?"
- "Confidence with React Native's flexbox-based layout (vs. web CSS)?"
- "Today: deep dive on routing only, or also cover the theme/auth provider layer?"
> Calibrate: if unfamiliar with RN layout, surface that early.

## 3. Spacing carry-over (M14)
For the next lesson (L14, hooks): "In L13, we saw that `useAuth()` is a custom hook provided by AuthContext. Today we'll build that hook and others like `useWorkout`."

## 4. The difficulty ladder for THIS lesson
1. React Native vs. web React vs. Expo — the platform landscape.
2. File-based routing: folders = routes, `(auth)` = route groups.
3. Anatomy of a layout file: `_layout.tsx` and `<Stack>` / `<Tabs>` components.
4. Auth guard: checking `isLoading` and `isAuthenticated`, redirecting with `router.replace()`.
5. Provider nesting and dependency injection (ThemeProvider depends on nothing; AuthProvider needs ThemeProvider for error UI; PowerSyncProvider needs AuthProvider for the JWT).
6. The screen inventory: modals, stacks, one-time screens, and how they interleave.

## 5. Concept sequence

### Concept 1: React Native, Expo, and why the platform matters
- **(M4) Generate first:** "You've written React for the web. Your app renders on iPhone using the same JavaScript. What's different?"
- **The idea:** React Native compiles JSX to native iOS/Android APIs. The DOM (`<div>`, `<span>`) doesn't exist; instead, you use `<View>`, `<Text>`, `<ScrollView>`. Layout is *always* flexbox (no CSS Grid). Styling uses `StyleSheet.create()` — a RN-specific API that returns an object with numeric IDs, not a CSS file.
  - **Web React:** JSX → DOM → browser renders HTML.
  - **React Native:** JSX → native (iOS UIView, Android View) → OS renders natively.
  - **Expo:** A managed platform that wraps React Native and handles the build/deploy pipeline (EAS Build for CI, Expo Go for local dev).
- **(M7) Concrete hook:** Show `mobile/app/_layout.tsx` lines 36–44 and point out `<Stack>`, `<StatusBar>`, `<ActivityIndicator>` — all native components, not web DOM.
- **Why it matters:** Native components are *fast* (no web bridge overhead) and *feel right* (iOS buttons bounce, Android ripples). But debugging is harder, and ecosystem packages are fewer.
- **(M6) Elaboration:** What's Expo? It's a build service + a local development server (`expo-dev-client`). It handles code signing for iOS, manages environment variables, and provides a curated set of modules (camera, notifications, etc.) that integrate with the native OS.
- **(M3) Retrieval check:** "You want to add a camera to Peak Fettle. Would you use a web library like `react-camera`, or an Expo module? Why?"

### Concept 2: File-based routing — folders are URLs, `(auth)` and `(tabs)` are route groups
- **(M4) Generate first:** "In web Next.js, `app/posts/[id].tsx` becomes `/posts/:id`. Peak Fettle doesn't use Next.js — it's a mobile app. How does it define routes without a URL bar?"
- **The idea:** expo-router (RN's first-party routing library) uses the *file system as the route definition*. Every `.tsx` file in `mobile/app/` maps to a screen accessible via a URL-like address. Folders with parentheses, like `(auth)` and `(tabs)`, are **route groups** — they group screens under a layout but don't appear in the URL.
  ```
  mobile/app/
    _layout.tsx                    → Root layout (wraps everything)
    (auth)/
      _layout.tsx                  → Auth stack layout
      login.tsx                    → Screen: /(auth)/login
      register.tsx                 → Screen: /(auth)/register
    (tabs)/
      _layout.tsx                  → Tab bar layout
      index.tsx                    → Screen: /(tabs)/ (Home tab)
      log.tsx                       → Screen: /(tabs)/log (Log tab)
      rankings.tsx                 → Screen: /(tabs)/rankings
      plans.tsx                    → Screen: /(tabs)/plans
      profile.tsx                  → Screen: /(tabs)/profile
    progress.tsx                   → Push screen: /progress
    health-metrics.tsx             → Push screen: /health-metrics
    groups.tsx                     → Push screen: /groups
  ```
- **Route groups explained:** `(auth)` and `(tabs)` are *not* part of the path. They're a way to group related screens under a shared layout without adding extra nesting to the URL. The `_layout.tsx` file inside a group defines the container component (`<Stack>` for auth, `<Tabs>` for the main app).
- **(M7) Concrete:** In `mobile/app/(auth)/_layout.tsx`, there's a `<Stack>` component that renders `<Stack.Screen name="login">` and `<Stack.Screen name="register">`. When the user navigates to `/(auth)/login`, the Stack shows the login screen with a back button. When they tap Register, the Stack pushes the register screen on top.
- **(M6) Elaboration — why groups?** They avoid URL pollution and allow multiple routes to share the same layout. Without groups, you'd have `/auth/login`, `/auth/register`, `/tabs/home`, `/tabs/log` — messy. With groups, the URL is clean (`/login`, `/home`) and related screens share a layout.
- **(M3) Retrieval check:** "If you added a new file `mobile/app/(tabs)/debug.tsx`, what URL would it be accessible at, and would it show the tab bar?"

### Concept 3: The root layout and auth guard
- **The idea:** `mobile/app/_layout.tsx` is the outermost component. It wraps the entire app in three providers (Theme, Auth, PowerSync), then renders a `<RootNavigator>` that checks the auth state and either shows a spinner or the route tree.
- **Real code** (`mobile/app/_layout.tsx` lines 119–136):
  ```tsx
  export default function RootLayout(): React.ReactElement {
    return (
      <ThemeProvider onThemeChange={async (newTheme: ThemeName) => {
        await patchProfile({ theme_preference: newTheme }).catch(() => {});
      }}>
        <AuthProvider>
          <PowerSyncProvider>
            <RootNavigator />
          </PowerSyncProvider>
        </AuthProvider>
      </ThemeProvider>
    );
  }
  ```
- **Provider nesting order (outermost to innermost):**
  1. **ThemeProvider:** Provides design tokens (colors, fonts, spacing). Nothing depends on it — it's safe to be outermost. Every component in the app (including login screens) can call `useTheme()`.
  2. **AuthProvider:** Manages the JWT, refresh token, and user state. Depends on ThemeProvider for error UI.
  3. **PowerSyncProvider:** Boots the local SQLite database and starts syncing. Depends on AuthProvider because it calls `useAuth()` to get the JWT and listen for token rotations.
- **The RootNavigator guard** (`mobile/app/_layout.tsx` lines 49–113):
  ```tsx
  function RootNavigator(): React.ReactElement {
    const { isLoading, isAuthenticated } = useAuth();
    const { theme } = useTheme();

    if (isLoading) {
      return <View style={[styles.loadingContainer, { backgroundColor: theme.colors.bgPrimary }]}>
        <ActivityIndicator size="large" color={theme.colors.accentDefault} />
      </View>;
    }

    return (
      <>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          {/* modal screens: progress, health-metrics, etc. */}
        </Stack>
      </>
    );
  }
  ```
  - While `isLoading` is true (cold-start silent refresh in flight), the guard renders a spinner.
  - Once `isLoading` resolves, the `<Stack>` is rendered. The *initial route* depends on `isAuthenticated` — this is wired in AuthContext, which calls `router.replace()` on login/logout to switch between `/(auth)/*` and `/(tabs)/*`.
- **(M6) Elaboration:** Why does ThemeProvider read the persisted theme from AsyncStorage *on mount*? Because the OS native layer renders the status bar and navigation UI before React hydrates. If we don't apply the theme immediately, the first frame shows the wrong colors (flicker). By reading from storage before rendering, we avoid the flash.
- **(M3) Retrieval check:** "The PowerSync provider calls `useAuth()` to get the JWT. If you moved PowerSync before AuthProvider, what would break?"

### Concept 4: Anatomy of a layout file — `_layout.tsx` and the Stack/Tabs components
- **The idea:** Each folder can have a `_layout.tsx` file (the underscore is significant — it's excluded from routing). This file defines the container for all screens in that folder. For auth, the container is a `<Stack>` (push/pop navigation). For tabs, it's a `<Tabs>` bar.
- **Real code** (`mobile/app/(auth)/_layout.tsx` — simplified):
  ```tsx
  import { Stack } from 'expo-router';

  export default function AuthLayout() {
    return (
      <Stack
        screenOptions={{
          headerShown: false,
          animationEnabled: true,
        }}
      >
        <Stack.Screen name="login" options={{ title: 'Login' }} />
        <Stack.Screen name="register" options={{ title: 'Register' }} />
      </Stack>
    );
  }
  ```
  When the user navigates to `/(auth)/login`, the Stack renders `login.tsx`. When they tap a "Go to Register" button (using `router.push('/(auth)/register')`), the register screen slides in from the right. The back button pops it off.
- **Real code** (`mobile/app/(tabs)/_layout.tsx` lines 85–216 — Tab bar with FAB):
  ```tsx
  export default function TabsLayout() {
    return (
      <Tabs screenOptions={{ tabBarActiveTintColor: colors.accentDefault }}>
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, size, focused }) => (
              <AnimatedTabIcon
                name={focused ? 'home' : 'home-outline'}
                size={size}
                color={color}
                focused={focused}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="log"
          options={{
            tabBarLabel: () => null,
            tabBarButton: (props) => (
              <TouchableOpacity
                style={{ top: -18, width: 56, height: 56, borderRadius: 28 }}
              >
                <View style={{ backgroundColor: colors.accentDefault }}>
                  <Ionicons name="flash" size={28} />
                </View>
              </TouchableOpacity>
            ),
          }}
        />
        {/* rankings, plans, profile */}
      </Tabs>
    );
  }
  ```
  Each `<Tabs.Screen>` is a tab. The Log tab is special — it has `tabBarButton` customized to render a floating action button (FAB) in the center of the tab bar, overlapping the edge.
- **(M6) Elaboration:** Why `tabBarLabel: () => null` for the Log tab? Because the FAB has no label, just an icon. Setting the label to `null` hides the text that would normally appear below the icon.
- **(M3) Retrieval check:** "You want to add a Settings tab. Write the code for `<Tabs.Screen name="settings">` with an icon and label."

### Concept 5: The screen inventory and navigation patterns
- **Authenticated main screens (in `(tabs)/`):** Home, Log, Rankings, Plans, Profile. These are always visible (tappable via tab bar) when authenticated.
- **Push screens (at the root level):** `progress.tsx`, `health-metrics.tsx`, `groups.tsx`, `group-detail.tsx`, `workout-day.tsx`, `workout-history.tsx`. These are *modal* or *stack* screens, accessible via `router.push('/progress')`. They overlay the main tabs and have a back button to dismiss.
  ```tsx
  <Stack.Screen name="progress" options={{ title: 'Progress', headerShown: true }} />
  ```
  When the user taps "View Progress" from the Home tab, the app calls `router.push('/progress')`. The Stack component at the root level catches this and renders the progress screen on top of the tabs.
- **One-time screens:** `intro.tsx` (shown once after first signup), `splash.tsx` (animated splash for new vs. returning users). These are navigated to via `router.replace('/(auth)/intro')` and have `gestureEnabled: false` so the user can't swipe back.
- **Special screens:** `templates.tsx` (workout browser), `csv-import.tsx` (activity import), `glossary.tsx` (help screen), `cosmetics.tsx` (shop/achievements).
- **(M7) Concrete:** User flow: (1) User taps Home tab. (2) App renders `/(tabs)/index.tsx` inside the tab bar. (3) User taps a "Recent Activity" row. (4) App calls `router.push('/workout-day?date=2026-05-21')`. (5) The root Stack renders `workout-day.tsx` on top of the tabs (with a back button). (6) User taps back. (7) The Stack pops, and the Home tab is visible again.
- **(M3) Retrieval check:** "The intro screen has `gestureEnabled: false`. Why might that be important for a tutorial screen?"

### Concept 6: Dynamic routes and query parameters
- **The idea:** expo-router supports dynamic segments (like Next.js). A file `mobile/app/workout-day.tsx` can receive a query parameter `?date=YYYY-MM-DD` and read it with `useLocalSearchParams()`.
- **Real code** (in a screen file):
  ```tsx
  import { useLocalSearchParams } from 'expo-router';

  export default function WorkoutDayScreen() {
    const { date } = useLocalSearchParams<{ date: string }>();
    // date is now '2026-05-21' (or undefined if not provided)
  }
  ```
- **Real code** (navigating to it):
  ```tsx
  const router = useRouter();
  router.push(`/workout-day?date=${dateKey}`);
  ```
- **(M3) Retrieval check:** "Would you store the date in a React context, or pass it via a query parameter? What are the trade-offs?"

## 6. Teach-back (M10)
"Explain to a colleague new to mobile: what does 'file-based routing' mean in Peak Fettle, why is the auth guard in a layout file, and what happens when the user taps the Log tab?"

## 7. Cumulative review (M13) — rapid-fire
1. What's the difference between `(auth)` and `(tabs)` folders, and why are they route groups?
2. Name the three providers in the root layout and their dependency order.
3. When a user is cold-starting the app (isLoading = true), what does the root layout render?
4. How would you navigate from the Home tab to the Progress screen and back?

## 8. The graded quiz (Bloom L1–L5, AI-graded in the app)

| # | Bloom | Type | Prompt | Rubric | Model answer (reference) | Pts |
|---|-------|------|--------|--------|--------------------------|-----|
| q1 | L1 | mc | In React Native, what replaces HTML `<div>` elements? | Identifies the RN equivalent | `<View>` (from react-native) | 8 |
| q2 | L2 | free | Explain why `mobile/app/(auth)/` is a route *group* rather than a route. Include the difference in URLs. | States that groups don't affect the path; allows shared layout without nesting | Route groups let multiple screens share a layout without adding path segments. `/(auth)/login` and `/(auth)/register` both use the same `<Stack>` layout, but the URLs don't have `/auth` in them. | 12 |
| q3 | L3 | free | The user taps the Rankings tab. Trace the code path: where is `rankings.tsx`, what component renders it, and what Hook does the screen call to get the theme colors? | Identifies the file path, the `<Tabs>` component, and `useTheme()` | `mobile/app/(tabs)/rankings.tsx` exists. The `<Tabs.Screen name="rankings">` in `(tabs)/_layout.tsx` renders it. The Rankings screen calls `useTheme()` to get `theme.colors.accentDefault`. | 12 |
| q4 | L4 | free | The PowerSync provider calls `useAuth()` to get the JWT. If PowerSync were placed *before* AuthProvider in the provider nesting, what would break and why? | Identifies the dependency; explains that `useAuth()` would have no context to consume | `useAuth()` would throw "useAuth must be used inside an AuthProvider" because the context doesn't exist yet. PowerSync would fail to boot and no data would sync. | 18 |
| q5 | L5 | free | The app uses an auth guard in the root layout (checking `isLoading` and `isAuthenticated`) instead of a dedicated redirect screen. Evaluate this approach: what would happen if the guard were removed, and is the current pattern correct for an offline-first app? | Takes a position; traces the cold-start flow; explains offline implications; considers alternatives | Without the guard, an already-authenticated user would see the login screen briefly (flicker) on cold start while the silent refresh runs. The current pattern is correct for offline-first because it: (1) avoids redirect loops, (2) masks the refresh delay from the user, (3) allows both (auth) and (tabs) to render in parallel. An alternative (a dedicated 401-redirect screen) would be reactive, not proactive. | 21 |
| q6 | L5 | free | You want to add a Settings screen inside the tab bar (sixth tab). Write the file path, the `<Tabs.Screen>` code, and explain how it integrates with the existing navigation. | Complete, correct code; notes that it will appear in the tab bar; considers naming and routing | Create `mobile/app/(tabs)/settings.tsx`. Add to `(tabs)/_layout.tsx`: `<Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'settings' : 'settings-outline'} size={size} color={color} /> }} />`. The screen will appear as a sixth tab and can navigate to push screens via `router.push('/some-screen')` like any other tab. | 21 |
| q7 | L6 (opt) | free | Propose how you'd add a "Welcome Tour" screen that plays once after onboarding, before the user sees the Home tab. Where would you place the file, how would you trigger the display, and what would prevent the user from seeing it twice? | Architectural decision; considers the layout tree and state flow | Create `mobile/app/welcome-tour.tsx` at the root. In `RootNavigator`, after `isLoading` resolves, check a flag (e.g., `hasSeenWelcomeTour` from AuthContext). If false, render `<Stack.Screen name="welcome-tour" ... />` and push `/welcome-tour` instead of `/(tabs)/`. On completion, the tour calls `markWelcomeTourSeen()` (API + AuthContext), then `router.replace('/(tabs)')`. The flag ensures it only shows once. | 15 |

## 9. Custom interactive widget
**File-based routing simulator** — a visual explorer showing the `mobile/app/` folder tree with live search. Clicking a file shows its screen name and URL, and highlights the provider/layout stack it lives under. Lets Arvin *see* how the file system maps to navigation.

## 10. End-of-session updates (agent)
- Grade quiz via the app's "Grade with Claude."
- Update `teacher_skill.md` PART 2: first real assessment of mobile/routing knowledge; whether the "groups don't add path segments" concept stuck; any confusion about provider nesting.
- Offer to schedule L14 (React hooks and state) in 2–3 days; queue carry-over: "When you saw `useAuth()`, `useTheme()`, and `useWorkout()`, you were looking at custom React hooks. Today we'll build them from scratch."
