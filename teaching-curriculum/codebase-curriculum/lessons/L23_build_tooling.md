# L23 — Build Tooling: CMake, Expo/EAS, and CI

**Duration:** 2–3 hours (lecture + worked exercises)
**Bloom Levels:** L1 (Recall), L2 (Understand), L3 (Apply), L4 (Analyze), L5 (Evaluate)
**Prerequisites:** L01 (domain model), L10–L15 (Qt/QML), L16–L20 (mobile stack)

---

## Opening Context

Peak Fettle runs **two very different build systems** side by side:

1. **Qt (C++/QML)** — Desktop landing page + set tracker app
   - Built with **CMake**, configured for Qt 6.7+
   - Compiled to native executables
   - Dependency: Qt 6.7, C++17 compiler (MSVC or GCC/Clang)

2. **React Native** — Mobile apps (iOS + Android)
   - Built with **Expo** + **EAS (Expo Application Services)**
   - Compiled to `.ipa` (iOS) and `.apk` (Android) binaries
   - Dependency: Node 20+, Expo CLI

3. **CI/CD Pipeline** — GitHub Actions
   - Runs on every push to `main` or `develop`
   - Lints backend + mobile, runs unit tests
   - Auto-deploys marketing site to Vercel

This lesson explores **why** these build systems exist, **how** they work in practice, and **where they fail**.

---

## Section 1 — Understanding Build Systems

### What Does a Build System Do?

A build system automates the translation of **source code** → **compiled artifacts** (binaries, apps, bundles).

Without a build system, you'd manually:
1. Find all `.cpp` files
2. Invoke the compiler on each, passing header paths, library flags, optimization settings
3. Link the object files together
4. Copy resources (icons, fonts, data) into the output folder
5. Sign/package the result for distribution

A good build system:
- **Declares dependencies** (Qt, POSIX threading, external libraries)
- **Detects your environment** (OS, compiler version, installed packages)
- **Compiles only changed files** (incremental builds)
- **Manages resource bundling** (QML → .qrc → compiled resource)
- **Enforces consistency** (everyone's build uses the same flags)

### Why Peak Fettle Needs Two Builders

**Qt + CMake** for desktop:
- Qt applications are C++ under the hood
- Qt's `moc` preprocessor generates boilerplate from `Q_PROPERTY`, `Q_INVOKABLE` annotations
- CMake's `CMAKE_AUTOMOC` handles this automatically
- Produces a single native executable (no runtime dependency on Qt libraries if statically linked)

**React Native + Expo/EAS** for mobile:
- React Native bundles JavaScript + native modules into an iOS/Android app
- Expo abstracts the native build complexity (Xcode, Gradle)
- EAS provides cloud build servers (iOS builds require a macOS machine; EAS doesn't)
- Produces `.ipa` (iOS) and `.apk` (Android) signed packages ready for app stores

---

## Section 2 — Deep Dive: CMake

### CMake Structure in Peak Fettle

Open `CMakeLists.txt` at the project root:

```cmake
cmake_minimum_required(VERSION 3.21)

project(PeakFettle
    VERSION 0.1.0
    DESCRIPTION "Peak Fettle - Fitness tracking app..."
    LANGUAGES CXX
)

# Standards
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Qt automation
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)
set(CMAKE_AUTOUIC ON)

# Find Qt 6.7
find_package(Qt6 6.7 REQUIRED COMPONENTS
    Core Gui Qml Quick QuickControls2 Graphs Svg
)

# Define source files
set(PEAK_FETTLE_CPP_SOURCES
    src/main.cpp
    src/set.cpp
    src/exercise.cpp
    src/workouttracker.cpp
    src/usermanager.cpp
    src/UnitPreference.cpp
    src/ExerciseLibrary.cpp
    src/EffortPreference.cpp
    src/UserProfile.cpp
    src/StrengthCurve.cpp
)

# Create executable
qt_add_executable(PeakFettle ${PEAK_FETTLE_CPP_SOURCES} ${PEAK_FETTLE_CPP_HEADERS})

# Bundle QML files + resources
qt_add_qml_module(PeakFettle
    URI PeakFettle
    VERSION 1.0
    QML_FILES
        qml/Main.qml
        qml/LandingPage.qml
        ...
    RESOURCES
        resources/mountain_logo.svg
    IMPORTS QtQuick QtQuick.Controls QtGraphs
)

target_link_libraries(PeakFettle PRIVATE Qt6::Core Qt6::Gui Qt6::Qml Qt6::Quick)
```

### What This Does

**Line 1:** Minimum CMake version (3.21 for modern Qt 6 features).

**Lines 3–7:** Project metadata. CMake doesn't generate the `VERSION` automatically — you can read it with `${PROJECT_VERSION}` in the build but it's mostly for documentation.

**Lines 9–12:** C++ standard enforcement. `CXX_STANDARD 17` means the compiler flag is `-std=c++17` (or `/std:c++17` on MSVC).

**Lines 14–16:** Qt automation.
- `CMAKE_AUTOMOC ON` — CMake runs `moc` (Qt Meta-Object Compiler) on any `.h` file with `Q_OBJECT`, `Q_PROPERTY`, etc.
- `CMAKE_AUTORCC ON` — CMake compiles `.qrc` (resource files) into `.cpp` source
- `CMAKE_AUTOUIC ON` — CMake compiles `.ui` (Qt Designer files) into header files

**Lines 18–27:** `find_package(Qt6 6.7 ...)` locates the Qt installation on your machine. If Qt 6.7 is not installed, CMake fails with a clear error. The `COMPONENTS` list declares which Qt modules your app needs.

**Lines 29–38:** Source file declaration. You **must** list every `.cpp` and `.h` file, or CMake won't know to compile it. (A common mistake: add a new file to the project, forget to add it here, and it doesn't compile.)

**Lines 40–56:** `qt_add_executable()` creates the executable and `qt_add_qml_module()` registers QML files so they're compiled into the binary.

**Line 60:** Link libraries. This tells the linker "connect this executable to Qt's Core, Gui, Qml, and Quick libraries."

### Building Locally

To build the Qt app:

```bash
# Create a build directory (out of source)
mkdir build
cd build

# Configure (CMake generates makefiles or Visual Studio project)
cmake ..

# Build
cmake --build . --config Release

# Run
./PeakFettle   # or ./Release/PeakFettle on Windows
```

### Common Build Errors

**Error: `Qt6 not found`**

CMake can't locate Qt 6. Solution:
```bash
# Tell CMake where Qt is installed
cmake -DQt6_DIR=/path/to/Qt6/lib/cmake/Qt6 ..
# e.g., on macOS: /usr/local/opt/qt6/lib/cmake/Qt6
```

**Error: `Unknown type name 'Q_OBJECT'`**

Probably you added a new `.h` file with `Q_OBJECT` macro but didn't add it to `CMakeLists.txt`'s `PEAK_FETTLE_CPP_HEADERS` list. CMake doesn't know to run `moc` on it.

**Error: `moc.exe not found`**

The build environment is missing the Qt toolchain. On Windows, launch the "Qt Command Prompt" from the Qt Creator Start Center, which sets up PATH to include `moc.exe`.

---

## Section 3 — Deep Dive: Expo and EAS

### What Is Expo?

Expo is a **managed framework** for React Native. Instead of building and configuring iOS and Android projects manually (which involves Xcode, Gradle, signing certificates, provisioning profiles), Expo abstracts this away:

- Write JavaScript + React Native components
- Use Expo APIs (camera, notifications, secure storage)
- EAS build takes your code, compiles it with Expo's managed native modules, produces `.ipa` and `.apk`

### Peak Fettle's Expo Config

**File:** `mobile/app.json`

```json
{
  "expo": {
    "name": "Peak Fettle",
    "slug": "peak-fettle",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "automatic",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#0f172a"
    },
    "ios": {
      "supportsTablet": false,
      "bundleIdentifier": "com.peakfettle.app",
      "infoPlist": {
        "ITSAppUsesNonExemptEncryption": false
      }
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#0f172a"
      },
      "package": "com.peakfettle.app"
    },
    "plugins": [
      "expo-router",
      "expo-secure-store",
      "expo-notifications"
    ]
  }
}
```

### Key Fields

**`slug`:** URL-safe app identifier. Used by Expo's update service and in app store URLs.

**`icon` / `splash`:** Asset paths. Must be PNG files. If you update these, **you must commit and push to git** — EAS builds fetch from the remote, not your working tree.

**`ios` / `android`:** Platform-specific config.
- `bundleIdentifier` / `package`: Reverse-domain names (e.g., `com.peakfettle.app`). Must be unique across app stores.
- `supportsTablet: false`: iPhone only (not iPad).
- `ITSAppUsesNonExemptEncryption: false`: For App Store compliance (Peak Fettle doesn't use encryption, so answer false).

**`plugins`:** Native modules to include in the build.
- `expo-router`: File-based routing (like Next.js)
- `expo-secure-store`: Encrypted key/value storage (for tokens)
- `expo-notifications`: Push notifications

### EAS Build Config

**File:** `mobile/eas.json`

```json
{
  "cli": {
    "version": ">= 18.13.0",
    "appVersionSource": "remote"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal"
    },
    "production": {
      "autoIncrement": true
    }
  },
  "submit": {
    "production": {}
  }
}
```

**`cli.version`:** Minimum Expo CLI version required. If you have an older CLI, `eas build` warns you to upgrade.

**`build.development`:** Development builds (local testing, hot reload). Distributed via Expo's internal CDN.

**`build.preview`:** Ad-hoc internal builds (testers, QA). Distributed as `.ipa` / `.apk` files via email or TestFlight link.

**`build.production`:** App Store release builds. `autoIncrement: true` means EAS bumps the version number on each build (1.0.0 → 1.0.1 → 1.0.2).

### Building and Deploying with EAS

To build for internal testing:

```bash
cd mobile

# Requires EAS login (one-time)
eas login

# Build preview .apk for Android
eas build --platform android --profile preview

# Build preview .ipa for iOS (requires Apple ID)
eas build --platform ios --profile preview

# Watch the build in real-time on eas.expo.dev
```

EAS returns a download link to the `.ipa` or `.apk`. Testers install it on their device.

To submit to app stores:

```bash
# Build production .ipa for App Store
eas build --platform ios --profile production

# Submit to App Store (requires App Store Connect credentials)
eas submit --platform ios --latest
```

---

## Section 4 — The Two-Build Problem and OneDrive Corruption

### Why Two Systems Is Painful

**Problem 1: Asset Sync**

Both builds reference the same assets:
- `CMakeLists.txt` refers to `resources/mountain_logo.svg`
- `app.json` refers to `./assets/icon.png`

If you update `icon.png` and forget to git-push, the EAS build (which pulls from GitHub) will either fail with `ENOENT` or build an old version. The Qt app, building locally, has the new icon and works fine. Inconsistency between local and CI builds is hard to debug.

**Problem 2: OneDrive Live-Sync Corruption**

The Peak Fettle repo sits in `…\OneDrive\Documents\Claude\Projects\Peak Fettle`. OneDrive's background sync interferes with git and build artifacts:

- `.git/index` gets truncated mid-write → `bad index file sha1 signature`
- Source files get truncated mid-token, leaving syntax errors
- Qt resource `.qrc` files are modified during build, causing `moc` to fail
- CMake cache becomes corrupted, forcing a clean rebuild

**Documented incident (2026-05-21):** A single sync collision produced:
- 10 source files with truncated tokens (inside strings, comments, object literals)
- Duplicated `StyleSheet.create` blocks with premature `});`
- Comments dropped mid-line, accidentally disabling code after them
- Corrupt `.git` multi-pack-index

### The Real Fix

**Move the repo out of OneDrive** to a non-synced path (e.g., `C:\Users\aavir\dev\Peak Fettle` or `C:\src\peak-fettle`). Use GitHub as the backup.

Mitigation if you must stay on OneDrive:
- Exclude the build directory from sync: Settings → Accounts → Choose folders to sync → uncheck `build/`
- Exclude node_modules: Settings → uncheck `*/node_modules/`
- Exclude `.git`: Settings → uncheck `.git/`

But the real solution is to move the repo.

---

## Section 5 — GitHub Actions CI Pipeline

### Overview

Every push to `main` or `develop` triggers a GitHub Actions workflow. The workflow runs three jobs:

1. **Backend** (peak-fettle-agents/server) — Lint + unit tests
2. **Marketing** (marketing-site) — Lint + production build
3. **Deploy** (Vercel) — Auto-deploy marketing site to production

(Mobile builds are **not** automated on every push; they're triggered manually via EAS CLI.)

### The Backend Job

```yaml
jobs:
  backend:
    name: "Backend — lint & test"
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: peak-fettle-agents/server

    env:
      NODE_ENV:   test
      JWT_SECRET: ${{ secrets.CI_JWT_SECRET || 'ci-only-secret-not-production' }}
      WEB_ORIGIN: http://localhost:3000

    steps:
      - uses: actions/checkout@v4

      - name: Set up Node 20
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
          cache-dependency-path: peak-fettle-agents/server/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Unit tests
        run: npm test
```

**`runs-on: ubuntu-latest`:** The runner is a clean Ubuntu container. No local state. Exactly reproducible.

**`env.JWT_SECRET`:** The test suite sets this to a dummy value. In CI, no real Supabase connection is made — tests mock the database.

**`npm ci`:** "Clean install" — installs exact versions from `package-lock.json` (not `npm install`, which might upgrade).

**`npm run lint`:** Runs ESLint. If linting fails, the job fails and the PR can't merge.

**`npm test`:** Runs Jest. Tests for `requireAuth` middleware (verify JWT, reject refresh tokens) and `/health` endpoint.

### The Health Check Test

From `server/__tests__/health.test.js`:

```javascript
describe('GET /health', () => {
    it('returns HTTP 200 with { ok: true, ts: <number> }', async () => {
        const res = await request(app).get('/health');
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(typeof res.body.ts).toBe('number');
    });

    it('does not require a JWT', async () => {
        const res = await request(app).get('/health');
        expect(res.status).not.toBe(401);
    });
});
```

This test:
1. Starts the server
2. Makes an HTTP GET request to `/health`
3. Asserts the response is 200 and has the correct shape
4. Asserts no JWT is required

If this test fails, the build fails. If you break the health endpoint, CI catches it immediately.

### The requireAuth Test

From `server/__tests__/requireAuth.test.js`:

```javascript
it('returns 401 refresh_token_not_accepted when a refresh token is presented (T-01)', () => {
    const refreshToken = jwt.sign(
        { sub: 'user-abc', type: 'refresh' },
        SECRET,
        { expiresIn: '30d' }
    );
    const req = mockReq(refreshToken);
    const res = mockRes();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'refresh_token_not_accepted' });
    expect(next).not.toHaveBeenCalled();
});
```

This test **specifically guards against a security regression** (T-01 in the feedback report). It ensures:
- A refresh token (valid JWT but with `type: 'refresh'`) is rejected when presented as an access token
- The middleware returns 401, not 200

If someone accidentally removes the refresh-token check from the middleware, **this test fails and CI blocks the merge**.

---

## Section 6 — Advanced Scenario: Multi-File Corruption Recovery

### Scenario

You pull the latest code from GitHub. CMake fails with:

```
error: /path/to/peak-fettle/src/set.cpp:10: expected initializer before 'Set'
```

You open `set.cpp` and see:

```cpp
#include "set.h"

// E-001: RIR clamp between [-1, 10]
class Set {  // <-- syntax error here, but the code looks fine
  ...
```

**What happened:** OneDrive truncated the file mid-token. The actual file is corrupted mid-comment or mid-string above the `class` keyword, but the truncation is not visible in the text editor (it's before the line you're looking at).

### Recovery Steps

**Step 1: Verify the file is corrupted**

```bash
# Check byte count
wc -c src/set.cpp

# Expected (from GitHub): ~850 bytes
# Actual (corrupted): ~200 bytes
```

**Step 2: Restore from git**

```bash
# Fetch the committed version
git show HEAD:src/set.cpp > src/set.cpp

# Verify it compiles
cmake --build build
```

**Step 3: If the committed version is also corrupt**

If the file was corrupted at commit time (rare but possible):

```bash
# Find the last good commit
git log --oneline src/set.cpp | head -20

# Check out the older version
git show <commit-hash>:src/set.cpp > src/set.cpp
```

**Step 4: Full codebase parse sweep**

CMake stops at the first error and hides the rest. If one file is corrupt, others might be too:

```bash
# In the build directory
cmake --debug-output .. 2>&1 | grep error

# Manually check all .cpp and .h files
for file in src/*.cpp src/*.h qml/*.qml; do
    if ! head -c 1 "$file" &>/dev/null; then
        echo "CORRUPTED: $file (empty or unreadable)"
    fi
done
```

---

## Section 7 — Worked Examples

### Example 1: Adding a New Qt Class

You want to add a new `ProgressCalculator` class to the Qt app.

**Files created:**
- `src/ProgressCalculator.h`
- `src/ProgressCalculator.cpp`

**Mistake:** You update the source code but forget to update `CMakeLists.txt`.

**Build fails:**

```
error: undefined reference to `ProgressCalculator::compute(int)'
```

**Why:** CMake didn't know to compile `ProgressCalculator.cpp`. It's not in `PEAK_FETTLE_CPP_SOURCES`.

**Fix:**

Edit `CMakeLists.txt`:

```cmake
set(PEAK_FETTLE_CPP_SOURCES
    src/main.cpp
    src/set.cpp
    src/exercise.cpp
    src/workouttracker.cpp
    src/usermanager.cpp
    src/UnitPreference.cpp
    src/ExerciseLibrary.cpp
    src/EffortPreference.cpp
    src/UserProfile.cpp
    src/StrengthCurve.cpp
    src/ProgressCalculator.cpp   # <-- ADD THIS
)

set(PEAK_FETTLE_CPP_HEADERS
    src/set.h
    src/exercise.h
    src/workouttracker.h
    src/usermanager.h
    src/UnitPreference.h
    src/ExerciseLibrary.h
    src/EffortPreference.h
    src/UserProfile.h
    src/StrengthCurve.h
    src/ProgressCalculator.h     # <-- ADD THIS
)
```

Then rebuild:

```bash
cmake --build build
```

**Lesson:** CMake requires explicit file lists. It does not auto-discover files.

### Example 2: Updating App Icons Without Breaking EAS Builds

You redesign the Peak Fettle icon. New file: `mobile/assets/icon.png` (1024x1024 PNG).

You update `app.json` and test locally with `expo start`. Works great.

You push to GitHub. EAS build is triggered. **Build fails:**

```
error: withIosDangerousBaseMod: ENOENT './assets/icon.png'
```

**Why:** Your local build picks up the new icon from your working directory. EAS pulls from GitHub, but you forgot to git-add and push the file.

**`git status`:**

```
modified:   mobile/app.json
?? mobile/assets/icon.png  <-- untracked!
```

**Fix:**

```bash
cd mobile
git add assets/icon.png app.json
git commit -m "Update Peak Fettle app icon"
git push
```

Now EAS has the icon and the build succeeds.

**Lesson:** EAS builds from the remote, not your working tree. Always verify `git status` shows no untracked asset files before pushing.

### Example 3: Debugging a CI Lint Failure

Your colleague pushes code. GitHub Actions runs and the backend lint job fails:

```
error: Unexpected var statement [no-var]
```

Your colleague says: "It works on my machine!"

They probably have an older ESLint config or a node_modules version mismatch.

**Why CI caught it:** The CI job runs `npm ci`, which installs exact versions from `package-lock.json`. Everyone's CI environment is identical. Your colleague's local node_modules might be outdated.

**Fix:**

```bash
cd peak-fettle-agents/server

# Update your local deps to match CI
npm ci

# Re-run linting
npm run lint

# It now fails locally, matching CI

# Fix the error (don't use var)
# Then run lint again to confirm
npm run lint
```

Then commit and push. CI will pass.

**Lesson:** Always run `npm ci` (not `npm install`) locally to match CI's environment exactly.

---

## Section 8 — Build System Antipatterns

### Antipattern 1: Hardcoding Paths

**Bad:**

```cmake
target_link_directories(/Users/alice/Qt/6.7/lib)
```

This works only on Alice's machine. Everyone else's build fails.

**Good:**

```cmake
find_package(Qt6 6.7 REQUIRED COMPONENTS Core Gui)
target_link_libraries(PeakFettle PRIVATE Qt6::Core Qt6::Gui)
```

`find_package` auto-discovers Qt using the system's package manager or `PATH`.

### Antipattern 2: Mixing Build Outputs

**Bad:**

```bash
# Build in the source directory
cd peak-fettle-agents/server
npm run build
npm test
```

This leaves build artifacts (`node_modules`, `.next`, `dist`) mixed with source. Cleaning is messy. Committing artifacts is easy to forget.

**Good:**

```bash
# Build in a separate directory
mkdir build
cd build
npm --prefix ../peak-fettle-agents/server run build
```

Source tree stays clean. Deleting `build/` fully resets everything.

### Antipattern 3: Environment Secrets in Git

**Bad:**

```bash
# In CI config file (committed to git)
env:
  API_KEY: sk-1234567890abcdef
```

Anyone with repo access has the production API key.

**Good:**

```bash
# In GitHub Settings → Secrets → Actions
# Define API_KEY there; don't commit it
env:
  API_KEY: ${{ secrets.API_KEY }}
```

GitHub provides the secret at runtime. It's never in git.

Peak Fettle does this correctly:

```yaml
env:
  JWT_SECRET: ${{ secrets.CI_JWT_SECRET || 'ci-only-secret-not-production' }}
```

The `|| 'ci-only-secret...'` fallback ensures the job doesn't fail if the secret is not set (though it should be, in production CI).

---

## Section 9 — Bloom L1–L5 Quiz

### L1 — Recall

**Q1.1:** What is CMake's role in Peak Fettle?

**Q1.2:** Name three Qt components that CMake detects with `find_package`.

**Q1.3:** What does `CMAKE_AUTOMOC ON` do?

**Answers:**
- Q1.1: CMake is the build system that translates C++ source code and Qt QML files into a native executable.
- Q1.2: Core, Gui, Quick, QuickControls2, Graphs, Svg (any three).
- Q1.3: It automatically runs the Qt Meta-Object Compiler (`moc`) on files with `Q_OBJECT` macros, generating boilerplate code.

### L2 — Understand

**Q2.1:** Why does Peak Fettle use two different build systems (CMake and Expo)?

**Q2.2:** Explain what `app.json`'s `bundleIdentifier` field means and why it must be unique.

**Q2.3:** In the GitHub Actions workflow, why does the backend job run `npm ci` instead of `npm install`?

**Answers:**
- Q2.1: CMake builds the Qt desktop app (which is native C++ compiled code). Expo/EAS builds the React Native mobile apps (JavaScript bundled into iOS and Android packages). These are fundamentally different build processes and languages.
- Q2.2: The bundle identifier (e.g., `com.peakfettle.app`) is the reverse-domain app ID used by app stores and the OS to uniquely identify the app. It must be unique because Apple and Google require it to be globally unique across all apps on the store.
- Q2.3: `npm ci` ("clean install") installs exact versions from `package-lock.json`, ensuring CI and local environments match. `npm install` might upgrade packages, causing version inconsistencies.

### L3 — Apply

**Q3.1:** You add a new file `src/NewFeature.cpp` and `src/NewFeature.h` to the Qt app. The build fails with "undefined reference to NewFeature::doWork()". Explain the likely cause and how to fix it.

**Q3.2:** You update `mobile/assets/icon.png` and test locally. The app works fine. You push to GitHub and EAS build fails with `ENOENT './assets/icon.png'`. What went wrong?

**Q3.3:** The GitHub Actions backend test job fails with "no-var" linting error, but `npm run lint` passes on your machine. Why?

**Answers:**
- Q3.1: CMake doesn't know to compile the new file. You must add it to `PEAK_FETTLE_CPP_SOURCES` and `PEAK_FETTLE_CPP_HEADERS` in `CMakeLists.txt`, then rebuild with `cmake --build build`.
- Q3.2: You forgot to `git add` and push the new icon file. EAS builds from GitHub (the remote), not your working tree. The icon exists locally but not in the remote repo. Solution: `git add mobile/assets/icon.png`, commit, and push.
- Q3.3: Your local `node_modules` is out of date. Run `npm ci` to install exact versions from `package-lock.json` and match CI's environment.

### L4 — Analyze

**Q4.1:** The health check test (`GET /health`) passes locally but fails in CI with "database connection refused". Explain why the test is designed the way it is (mocking the database) and what would break if the test connected to a real Supabase instance.

**Q4.2:** The requireAuth test verifies that a refresh token is rejected when used as an access token (T-01). Why is this test critical? What attack would happen if this test didn't exist?

**Q4.3:** In `CMakeLists.txt`, `CMAKE_AUTORCC ON` compiles `.qrc` resource files into C++ source. Why is bundling resources into the binary better than loading them from the filesystem at runtime?

**Answers:**
- Q4.1: The test mocks the database using Jest, so it doesn't require a live Supabase connection. If it connected to a real instance, the test would be slow, flaky (network latency), and require credentials to be in CI. Mocking keeps the test fast, reliable, and credential-agnostic. It tests the HTTP handler logic, not the database driver.
- Q4.2: This test guards against a critical security regression. If an attacker obtained a refresh token (which lives 30 days), they could impersonate the user by presenting it as an access token to protected endpoints. Without this test, a developer might accidentally remove the refresh-token check from the middleware, silently enabling this vulnerability. The test makes the check a requirement that cannot be regressed without CI failing.
- Q4.3: Bundling resources into the binary ensures they're always available (not subject to filesystem errors), are protected from tampering, and ship with the app without requiring a separate file structure. Loading from the filesystem adds complexity: where do files live? What happens if they're deleted or corrupted? On mobile, the app bundle is immutable, so bundled resources are the only reliable option.

### L5 — Evaluate

**Q5.1:** Peak Fettle's repo lives on OneDrive and experiences corruption. Evaluate the three options: (A) Move to a non-synced path, (B) Exclude build directories from OneDrive sync, (C) Switch from CMake to a Python-based build system. Which is best? What are the tradeoffs?

**Q5.2:** Consider the GitHub Actions CI pipeline. It lints and tests the backend on every push, but mobile builds are **not** automated — they require manual `eas build` commands. Is this the right decision? Propose a better workflow and justify your reasoning.

**Q5.3:** The test suite mocks the database. In what scenarios might this hide real bugs? Propose a testing strategy that catches issues that mocks miss.

**Answers:**
- Q5.1: **(A) is best.** Moving the repo out of OneDrive eliminates the root cause entirely. (B) is a partial mitigation but doesn't solve the problem completely — OneDrive can still corrupt `.git` internals even if `node_modules` is excluded. (C) is unnecessary and unrelated; the build system itself is fine. Recommendation: Move to `C:\Users\aavir\dev\Peak Fettle` or similar, use GitHub as backup.

- Q5.2: **Automated mobile builds would be better, but require care.** Currently, manual `eas build` is safer (you don't build on every micro-commit), but riskier (easy to forget and deploy outdated code). A better strategy: automatically build for Android on `develop` branch (fast), but require explicit approval for iOS builds (slow, requires macOS). This balances safety and velocity. Alternatively, always build on `main` but only auto-submit to staging stores, requiring manual approval for production.

- Q5.3: Database mocks hide issues like: (1) Unexpected NULL values, (2) Schema validation failures (e.g., too-long strings), (3) Race conditions in concurrent transactions, (4) Missing indexes causing slow queries. Better strategy: Run a **separate test suite** (maybe weekly or pre-production) against a **real test database** (Supabase staging environment). These "integration tests" catch schema/performance issues that unit tests miss. Keep the unit tests (fast, CI on every push) and add integration tests (slower, CI on schedule or pre-deploy).

---

## Section 10 — Interactive Widget: Build System Flow

The following interactive diagram shows how Peak Fettle's two build systems operate in parallel.

```
┌─────────────────────────────────────────────────────────────────────┐
│                  PEAK FETTLE BUILD SYSTEM ARCHITECTURE              │
└─────────────────────────────────────────────────────────────────────┘

GIT PUSH (main or develop)
  │
  ├──────────────────────────────────────────────┐
  │                                              │
  v                                              v
┌──────────────────────────────────────┐  ┌──────────────────────────┐
│  GitHub Actions CI (Automated)       │  │  EAS Mobile Build        │
│  ══════════════════════════════════  │  │  (Manual CLI)            │
│  ├─ Backend Job (Lint + Test)        │  │  ══════════════════════  │
│  │  ├─ npm ci                        │  │  ├─ eas build --platform │
│  │  ├─ npm run lint                  │  │  │    ios --profile prod  │
│  │  ├─ npm test (Jest)               │  │  │                        │
│  │  └─ Gate: Fail if lint or test    │  │  └─ Compiles JS to iOS   │
│  │         breaks                     │  │     + Android .apk       │
│  │                                    │  │                          │
│  ├─ Marketing Job                    │  │  Output: .ipa, .apk      │
│  │  ├─ npm ci (Next.js)              │  │                          │
│  │  ├─ npm run build                 │  │  Who Can Run:            │
│  │  └─ Gate: Fail if build breaks    │  │  ├─ Dev with EAS CLI     │
│  │                                    │  │  ├─ CI with EAS token    │
│  │  (If both pass...)                │  │  └─ Requires manual cmd  │
│  │                                    │  │                          │
│  └─ Deploy Job                       │  │                          │
│     ├─ vercel deploy --prod           │  │                          │
│     └─ Pushes marketing site live     │  │                          │
│                                       │  │                          │
│  Artifact: Cloud deployment           │  │  Artifact: App Store     │
│  (https://peakfettle.com)             │  │  (.ipa, .apk binaries)   │
│                                       │  │                          │
└──────────────────────────────────────┘  └──────────────────────────┘
     (Automatic, no manual step)             (Manual, requires CLI)

┌──────────────────────────────────────────────────────────────────────┐
│  Qt Desktop Build (Not Automated)                                    │
│  ═════════════════════════════════════════════════════════════════  │
│  Developer runs locally (not in CI):                                 │
│  $ mkdir build && cd build                                           │
│  $ cmake ..                                                          │
│  $ cmake --build . --config Release                                  │
│  Output: native executable (Windows, macOS, Linux)                   │
│                                                                       │
│  Reason: Qt build requires full C++ toolchain + Qt libs locally.    │
│          Cross-platform compilation is complex (Qt on CI container). │
│          Qt app is internal (not user-facing yet).                   │
└──────────────────────────────────────────────────────────────────────┘
```

**Key Insight:** The backend and marketing builds are **fully automated** (every push triggers CI). Mobile and Qt builds are **manual** (developer initiates locally or via CLI). This is intentional: CI tests fast things (linting, unit tests). Slower builds (native mobile, native desktop) are on-demand.

---

## Summary and Key Takeaways

1. **CMake** automates C++ compilation for the Qt desktop app. You must list all source files explicitly.

2. **Expo/EAS** abstracts iOS/Android build complexity. Cloud build means you don't need macOS hardware to build iOS apps.

3. **GitHub Actions CI** runs on every push, catching lint and test failures before they reach users.

4. **OneDrive corruption** is a real risk. The solution is to move the repo to a non-synced path, not to patch around it.

5. **Assets are tricky:** EAS pulls from GitHub (the remote), not your working tree. Always commit and push asset changes.

6. **Mocking in tests** keeps CI fast but misses some real-world bugs. Consider integration tests (against real DB) on a schedule.

7. **Explicit over implicit:** CMake requires you to list files. GitHub Actions requires you to commit asset changes. No magic — it's safe and reproducible.

---

## Further Reading

- [CMake Documentation](https://cmake.org/documentation/) — full reference
- [Qt 6 Build System](https://doc.qt.io/qt-6/cmake-manual.html) — Qt-specific CMake features
- [Expo Build Documentation](https://docs.expo.dev/build/setup/) — cloud build setup
- [GitHub Actions Workflow Syntax](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions) — CI config reference
- [Peak Fettle CLAUDE.md](../CLAUDE.md) — project-specific build notes and OneDrive mitigation

---

**Next Lesson:** L24 — Testing & Feedback Loop. How unit tests, integration tests, and persona-based beta feedback feed the development roadmap.
