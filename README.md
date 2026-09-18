# CoinFlow

CoinFlow is a personal finance / expense-tracking Android app (an app that helps you track how
much money you spend and earn, running on Android phones). Its core idea: **you shouldn't
have to manually type in every transaction**. A "transaction" here just means one movement of
money — a payment you made, or money that landed in your account. CoinFlow reads your bank/UPI
SMS notifications on-device (UPI, or "Unified Payments Interface," is the system most Indian
banking and payment apps use to move money instantly — when you pay with it, or when money
moves in or out of your bank account another way, your bank sends you a text message/SMS about
it), detects transactions in them, and turns each one into a one-tap confirmation instead
of a manual entry form.

> Transaction happens → Bank/UPI SMS arrives → CoinFlow detects it → notification → you tap
> "Save" or quickly review it → transaction is recorded.

**Plain-English:** "on-device" means all of this reading and detecting happens locally, on your
own phone's hardware — the SMS text is never sent anywhere else over the internet to be
analyzed.

This document is a map of the codebase for anyone picking it up for the first time (a
"codebase" is just the complete collection of source code files that make up this app). It's
based entirely on what's actually in the repository (a "repository," or "repo," is the folder —
tracked by the version-control tool Git — that holds this whole project's files and their
history of changes) — nothing here is aspirational or guessed.

---

## 1. Project overview

### What it does

- **Automatic detection** — reads incoming SMS, works out whether money was debited (taken out
  of your account — a payment) or credited (added to your account — income or a refund), the
  amount, the account/merchant, and the payment method (UPI/card/bank
  transfer/wallet), then posts a notification (the little alert that pops up in your phone's
  notification shade/tray, even if you're not currently looking at the app).
- **One-tap confirm, or quick review** — if you've confirmed a transaction from that same
  account before, the notification's "Save" button records it immediately with the category you
  used last time. Otherwise you get a short review sheet (a panel that slides up from the bottom
  of the screen, asking you to fill in or check a couple of details before it's saved).
- **Manual entry** — for cash payments or anything SMS can't catch, you can add a transaction
  by hand.
- **A learning "account memory"** — the app remembers which category/note/payment method you
  picked for a given account, and reuses it automatically next time — never guessed from
  keywords, only from what you've actually confirmed before.
- **Categories** — labels like "Food" or "Travel" used to group transactions. There are 9
  default categories plus an "Uncategorized" bucket; you can create, rename,
  reorder, and delete your own.
- **Transaction list** — a searchable, filterable, day-grouped ledger (a running record/log,
  like a diary of every transaction) of everything recorded.
- **Analytics** — running balance, this month's/week's income vs. spending with
  month-over-month change, a category breakdown, a daily spend chart, and your biggest expenses.
- **Review Queue** — an inbox of SMS-detected transactions still waiting for you to confirm or
  dismiss.
- **Data controls** — export everything as JSON or CSV via the OS share sheet (JSON and CSV are
  two common plain-text file formats for exporting data; the "OS share sheet" is the standard
  Android popup that lets you send a file to another app — email, Google Drive, WhatsApp, and
  so on), or wipe the app back to a fresh install.
- **Privacy by design** — the app makes **no network requests at all** by default (a "network
  request" is any time an app reaches out to the internet — CoinFlow simply doesn't, so your
  data has nowhere to leak to). The only
  exception is optional, opt-in crash reporting (software that automatically reports back to the
  developer when the app crashes, so bugs can be fixed — off unless you turn it on in Settings),
  and even then reports are scrubbed of anything that looks like money, an account, or a UPI id
  before they're sent. Raw SMS text is never stored anywhere, ever — only the fields parsed out
  of it (i.e. only the amount, date, and similar individual details extracted from the message —
  never the message's original wording).

### What it's built with

The table below lists the main building blocks. If you're new to app development, don't worry
about memorizing these — the explanations after the table walk through the ones that matter
most for understanding this project.

| Layer | Technology |
|---|---|
| Framework | [Expo](https://expo.dev) SDK 57, React Native 0.86, React 19 |
| Navigation | `expo-router` (file-based) |
| Language | TypeScript (strict mode) |
| Database | `expo-sqlite`, queried through [Drizzle ORM](https://orm.drizzle.team/) |
| State (in-memory UI only) | [Zustand](https://zustand-demo.pmnd.rs/) |
| Native SMS access | A custom local native module (Kotlin) — `modules/coinflow-sms/` |
| Notifications | `expo-notifications` |
| Background execution | `expo-task-manager` + a React Native "headless JS task" |
| Charts | `d3-shape` / `d3-scale`, drawn with `react-native-svg` |
| Icons | `lucide-react-native` |
| Crash reporting (opt-in only) | `@sentry/react-native` |
| Testing | Jest + `@testing-library/react-native` |

A few of these terms, explained:

- **Framework** — a framework is a pre-built foundation of code that handles the repetitive,
  hard-to-get-right parts of building an app (drawing things on screen, responding to taps,
  talking to the phone's operating system), so the app's own code can focus on what makes
  *this* app different. [Expo](https://expo.dev) is the framework CoinFlow is built on, and
  React Native is the underlying library Expo builds on top of for describing UI in code.
  React is the JavaScript library both of those are built on. "SDK 57" / "0.86" / "19" are just
  version numbers of each.
- **`expo-router` (file-based navigation)** — "navigation" is how the app moves between
  screens. "File-based" means which screens exist, and how you get to them, is determined by
  the actual files and folders under `src/app/` — create a file there, and it becomes a screen
  you can navigate to, similar to how pages on a website often map to files on a server.
- **TypeScript (strict mode)** — TypeScript is JavaScript with an added layer that checks, before
  the app even runs, that the right *kind* of value (a number, a piece of text, etc.) is being
  used in the right place, catching a whole category of bugs early. "Strict mode" means this
  checking is turned up to its most thorough setting.
- **Database, `expo-sqlite`, Drizzle ORM** — the database is where all your transactions,
  categories, and settings are actually stored on the phone, persisting even after you close the
  app. `expo-sqlite` is the specific, lightweight, on-device database engine used (SQLite is one
  of the most common embedded databases in the world). An **ORM** ("Object-Relational Mapper")
  is a tool that lets code work with database rows as ordinary TypeScript objects/functions
  instead of writing raw database query language by hand — [Drizzle](https://orm.drizzle.team/)
  is the ORM used here.
- **State (in-memory UI only), Zustand** — "state" is any piece of information the app is
  currently holding onto to render the UI correctly (e.g., "which tab is selected," "what text
  has been typed into this box so far"). [Zustand](https://zustand-demo.pmnd.rs/) is a small
  library for managing that kind of state. "In-memory UI only" is an important distinction here:
  Zustand state disappears the moment the app closes — it is *not* where real, permanent data
  (like your transactions) lives; that's the database's job.
- **Native SMS access, native module** — "native" code is code written in the phone's own
  platform language (here, Kotlin, Android's native programming language) rather than in
  JavaScript/TypeScript. Reading incoming SMS requires asking the Android operating system
  directly, which is outside what Expo/React Native offer out of the box, so this project ships
  its own small custom native module (`modules/coinflow-sms/`) to bridge that gap.
- **Background execution, "headless JS task"** — "background execution" means running code
  while the app isn't open on screen (e.g., because a new SMS just arrived while you were using
  a different app). A **headless JS task** is a JavaScript task that runs without any visible
  screen/UI attached to it — "headless" as in no visible "head" (window) — used here so incoming
  SMS can be processed even if CoinFlow isn't the app you're currently looking at.

  > **ELI5:** picture a night-shift worker at a factory who has no office, no desk, and no
  > lights turned on for them. They're woken up only when a specific alarm goes off (an
  > incoming SMS), they do one specific job in the dark (read the message, figure out what it
  > means, write it down), and then go back to sleep. They never need the building's main lights
  > (the app's visible screen) turned on to do their job — that's what makes it "headless."
- **Charts, `react-native-svg`** — SVG ("Scalable Vector Graphics") is a way of drawing shapes
  (lines, arcs, curves) with code instead of a fixed image file, which is what the Analytics
  screen's charts are built from.

**Platform: Android only.** The app needs to read SMS on-device, which is not something iOS
(Apple's phone operating system) or the web (running in a browser) allow — those platforms
simply don't let any app read another app's or the system's text messages, for privacy/security
reasons enforced by Apple and by browsers. iOS is a stub target for later (a "stub" is
placeholder scaffolding that exists but isn't a real, working version yet); the web build exists
only so you can preview UI in a browser — every real screen shows an "Android only" message
there instead.

---

## 2. Installation

This section walks through getting the project onto your computer and running on a phone. If
you've never set up a software project before, read every explanation below — none of these
steps are optional, and skipping the "why" tends to make later error messages confusing.

### Prerequisites

"Prerequisites" means things you need installed and ready *before* any of the commands below
will work.

- **Node.js** (see `package.json`'s tooling; a recent LTS works) — Node.js is a program that
  lets JavaScript/TypeScript code run directly on your computer (outside of a web browser),
  which is what all the developer tools in this project (`npm`, Metro, TypeScript, Jest, etc.)
  are built on. "LTS" stands for "Long-Term Support" — the stable, recommended release line, as
  opposed to the newest experimental one.
- **A Java 17 JDK + Android Studio / the Android SDK**, if you're building locally — the "JDK"
  (Java Development Kit) and "Android SDK" (Software Development Kit) are the tools that
  actually compile Android's native (Kotlin/Java) code and assemble an installable Android app
  package. Android Studio is Google's official development tool for Android and is the easiest
  way to get the Android SDK installed and configured. You only need these if you're building
  the app yourself on your own machine, as opposed to just downloading the pre-built APK from
  section 3 below.
- **An Android phone or emulator** to actually test on. An **emulator** is a simulated Android
  phone that runs as a window on your computer, useful for most testing — but SMS detection
  specifically needs a real phone, or some other way to inject/send a test SMS into it, because
  a plain emulator has no real phone-network connection to receive genuine text messages.

The repo already has a full, step-by-step walkthrough of the one-time computer/phone setup at
**`docs/local-android-build.md`** — that's the most detailed and accurate installation guide in
this project; read it if this is your first time building an Android app on your machine.

**Important:** this app cannot run in **Expo Go**. Expo Go is a generic, pre-built app (available
on the Play Store/App Store) that can run *most* Expo projects instantly, without you compiling
anything yourself — normally a huge shortcut for trying out an Expo app. But CoinFlow has a
custom native module (`modules/coinflow-sms/`, the Kotlin SMS-reading code mentioned above), and
Expo Go only contains the standard set of native code Expo ships with — it has no way to include
this project's own extra native code. So instead you need a **development build** — a custom
version of Expo Go, built specifically for this one project, that *does* include its native
code — produced by running `expo run:android`, or by requesting an EAS development/internal
build instead (EAS is explained in the "Build a release APK" section below).

### Install dependencies

"Dependencies" are all the other pieces of code (libraries) this project relies on but didn't
write itself — everything listed in `package.json`. This command downloads all of them:

```bash
npm install
```

`npm` ("Node Package Manager") is the tool, bundled with Node.js, that downloads and manages
these dependencies.

### Run it

```bash
npm run android      # builds a dev client, installs it on a connected device/emulator, starts Metro
```

**Plain-English:** this one command (a) compiles the native Android project and the custom SMS
module into a "dev client" (the development build described above), (b) installs that onto
whichever Android device/emulator is currently connected to your computer, and (c) starts
**Metro**, the bundler/dev server that packages up all the JavaScript/TypeScript code and feeds
it live to the running app — so when you edit code, the app can update without a full rebuild.

Other useful scripts (from `package.json`):

```bash
npm run start         # Metro dev server only (use once you already have a dev build installed)
npm run ios           # iOS is a stub target — not the primary supported platform yet
npm run web           # preview only — every real screen just shows "Android only" here
npm run lint          # expo lint
npm run typecheck     # tsc --noEmit
npm test              # jest (unit tests)
npm run test:watch
npm run test:ci        # jest --ci --coverage
```

A quick gloss on the less obvious ones:

- **`npm run lint`** — "linting" scans the code for style problems and likely mistakes (e.g.
  unused variables) without actually running it. `expo lint` is Expo's wrapper around the
  underlying linting tool, ESLint.
- **`npm run typecheck`** — runs the TypeScript compiler (`tsc`) in "no emit" mode, meaning it
  only checks that all the types line up correctly and reports errors, without producing any
  output files.
- **`npm test` / `test:watch` / `test:ci`** — these run the project's automated tests using
  **Jest**, a JavaScript/TypeScript testing tool: `npm test` runs them once, `test:watch` keeps
  re-running them automatically as you edit files, and `test:ci` (the version used in automated
  CI — see below) runs them once plus measures "coverage" (what percentage of the code the
  tests actually exercise).

### Build a release APK / production build

An **APK** (Android Package) is the actual installable file format for Android apps — the thing
you'd send to someone, or upload to the Play Store, as opposed to a development build meant only
for the person actively coding.

- **Locally**: `docs/local-android-build.md` Part 5 covers producing a `.apk` file from a local
  build.
- **Cloud (EAS)**: `eas.json` defines `development`, `preview`, and `production` build profiles
  for `eas build`. **EAS** ("Expo Application Services") is Expo's own cloud build service — it
  compiles the app on Expo's servers instead of your own computer, which avoids needing Android
  Studio/the Android SDK installed locally at all. A "build profile" is just a named preset of
  build settings (e.g. `development` vs `production`) that `eas build` can be told to use.
  There's also an `eas submit` profile for Play Store submission (uploading a finished build to
  the Google Play Store for publishing).

---

## 3. APK — download link

If you just want to install and use the app — not build or edit it — this is the only link you
need:

**[Download the latest APK](https://github.com/CKarthikeshwar/coinflow/releases/latest/download/coinflow.apk)**

That link always points to whichever release is newest — it never needs updating by hand. A
**signed** APK (one cryptographically stamped with a private key that proves it really came from
this project, which Android requires before it will let you install an app from outside the
Play Store) is built and published automatically every time a version tag (a labeled snapshot of
the code at a specific version, written as `v1.2.3`) is pushed; see `.github/workflows/release.yml`
(a **CI/CD** — "Continuous Integration/Continuous Deployment" — configuration file: a recipe of
steps that runs automatically on a server whenever certain things happen, like pushing a version
tag, rather than a person having to build and upload the release by hand each time) and the
"Cutting a release" section in `docs/sentry-and-ci.md` for exactly how that pipeline works and
what one-time setup it needs.

---

## 4. Codebase structure

The diagram below is a "file tree" — a text sketch of the project's folders (ending in `/`) and
files, indented to show what's nested inside what, with a `#` comment after many entries
explaining what that file/folder is for. This is the map of literally everything in the
project; the explanations in the rest of this document zoom into specific parts of it.

```
coinflow/
├─ index.js                     # Real app entry point (see "How the app works" below)
├─ app.json                     # Expo config: name, package id, plugins, permissions
├─ eas.json                     # EAS Build/Submit profiles
├─ drizzle.config.ts            # Tells drizzle-kit where the schema is and where to write migrations
│
├─ modules/coinflow-sms/        # Custom native module: the only way this app reads SMS
│  ├─ src/index.ts              #   JS wrapper (isSupported / getPermissionsAsync / requestPermissionsAsync)
│  └─ android/.../*.kt          #   Kotlin: SmsReceiver, the headless-task bridge, the permissions module
│
├─ src/
│  ├─ app/                      # expo-router screens (routes) — thin, mostly wiring
│  │  ├─ (onboarding)/          #   First-run flow: welcome → permissions → category review
│  │  ├─ (tabs)/                #   Home, Transactions, Analytics, Settings tabs
│  │  ├─ transaction/[id].tsx   #   Transaction Details (dynamic route)
│  │  ├─ review-queue.tsx       #   Pending SMS-detected suggestions
│  │  ├─ categories.tsx, account-rules.tsx, payment-methods.tsx,
│  │  │  sms-notifications.tsx, data.tsx, about.tsx   # Settings subpages
│  │  └─ *.web.tsx              #   Web build's replacement for each screen ("Android only" notice)
│  │
│  ├─ features/                 # The actual screen content, grouped by feature
│  │  ├─ app-shell/             #   Root navigator, the one shared bottom-sheet host, tab bar,
│  │  │                          #   notification routing, root error boundary
│  │  ├─ transactions/          #   Add/Edit/Confirm sheet, filter sheet, undo snackbar wiring
│  │  ├─ categories/            #   Category picker + editor sheets
│  │  ├─ settings/               #   Account rule editor, JSON/CSV/raw-DB export
│  │  ├─ analytics/              #   Balance arc, category donut, daily chart, stat tiles
│  │  ├─ onboarding/             #   Onboarding-specific UI (graphics, step dots, permission card)
│  │  ├─ home/                   #   Home screen's balance hero + action strip
│  │  └─ detection/              #   The suggestion card shown in the Review Queue
│  │
│  ├─ db/                        # Everything database-related
│  │  ├─ schema.ts               #   The 5 tables: categories, transactions, accountRules, suggestions, appSettings
│  │  ├─ client.ts               #   The one shared SQLite connection
│  │  ├─ migrations/              #   Generated (by drizzle-kit) but committed SQL migrations
│  │  ├─ migration-gate.tsx       #   Blocks the app from rendering until migrations finish
│  │  ├─ seed.ts / seed-data.ts   #   Default category seeding
│  │  ├─ fts.ts                   #   Full-text-search availability check
│  │  ├─ maintenance.ts           #   Purge old soft-deleted rows, "Clear all data"
│  │  └─ repositories/            #   The ONLY place the app runs queries — one file per table
│  │
│  ├─ domain/                     # Pure business logic — no React/Expo imports, fully unit-testable
│  │  ├─ parser/                  #   SMS → structured transaction fields (the core "smarts")
│  │  ├─ categorize.ts            #   Decides pre-filled category from a learned account rule
│  │  ├─ normalize.ts             #   Turns a messy SMS account string into a stable lookup key
│  │  ├─ analytics.ts             #   Pure math behind the Analytics tab
│  │  ├─ period.ts                #   Month/week calendar-period logic
│  │  └─ format/                  #   Money and date/time display formatting
│  │
│  ├─ services/                   # Background work and integrations
│  │  ├─ sms.ts                   #   Safe wrapper over the native SMS module
│  │  ├─ tasks/                   #   Background task registration + the SMS-ingest pipeline
│  │  ├─ notifications/           #   Building, posting, and responding to notifications
│  │  └─ crash/                   #   Opt-in, privacy-scrubbing Sentry setup
│  │
│  ├─ stores/                     # Zustand — small, in-memory-only UI state (never persisted)
│  ├─ hooks/                      # useTheme, useColorScheme, useLiveQuery, usePermissionStatus
│  ├─ constants/                  # Design tokens (theme.ts), fonts, category icons, SMS sender allowlist
│  ├─ ui/                         # Reusable building blocks: Button, Card, TextField, Icon, etc.
│  └─ lib/log.ts                  # The one place logs can (optionally) reach Sentry from
│
├─ SPEC/                          # idea, plan, frozen SPEC-UI-UX.md + SPEC-implementation.md, traceability (see Notes below)
├─ design-prototype/               # Static HTML prototypes used before any real screen was built
├─ docs/                           # local-android-build.md, sentry-and-ci.md
└─ e2e/                            # A Maestro end-to-end test flow
```

A handful of terms used inside that tree, in case they're new:

- **Routes / route groups** (`src/app/`) — in `expo-router`, each file under `src/app/` is a
  "route": a distinct screen you can navigate to, the same way each page of a website has its
  own URL. A folder name in parentheses, like `(onboarding)/` or `(tabs)/`, is a "route group" —
  it organizes related screens together without adding that folder's name to the actual
  on-screen navigation path.
- **Dynamic route** (`transaction/[id].tsx`) — square brackets in a filename mean that part of
  the path is a variable/placeholder, not fixed text; `[id].tsx` matches a transaction detail
  screen for *any* transaction id (e.g. transaction `42`, transaction `107`, etc.) using one
  shared file.
- **Migrations** (`src/db/migrations/`) — a migration is a small, saved script of database
  changes (like "add this new column") that brings an existing database up to date with the
  latest schema, without erasing the data already in it. `drizzle-kit` (mentioned in section 5
  below) is the tool that generates these automatically by comparing the current schema to the
  previous one.
- **FTS5** (`src/db/fts.ts`) — "Full-Text Search," version 5: a feature built into SQLite that
  lets you efficiently search across free-form text (e.g. transaction notes) rather than only
  exact matches.
- **Repository** (`src/db/repositories/`) — the "repository pattern" is a common design
  approach where all the actual database-query code for one type of data (e.g. transactions)
  lives in exactly one file, and everything else in the app goes through that file instead of
  writing its own queries — see section 5 below for why that matters here.
- **Domain logic** (`src/domain/`) — "domain logic" (also called "business logic") means the
  core rules and calculations of what the app is actually *for* — parsing an SMS, deciding a
  category, computing analytics — written so it has no dependency on React, Expo, or any UI
  framework, which is what makes it straightforward to unit-test (see `npm test` above) in
  isolation.
- **Headless JS task registration** (`src/services/tasks/`) — see the "headless JS task"
  explanation in section 1; this folder is where those background tasks get registered/wired up
  with `expo-task-manager` and where the actual SMS-processing pipeline that a headless task
  runs is defined.

---

## 5. Where to make changes

The table below is a quick lookup: find the row closest to what you're trying to do, and it
points at the file(s) responsible. A few of the ideas it refers to (routing, sheets, the
repository pattern, `drizzle-kit`) are explained in the paragraphs right after the table if
they're new to you.

| I want to change... | Go to |
|---|---|
| **What a screen looks like / its layout** | `src/app/<screen>.tsx` for the screen shell, but the actual visible content is usually in a matching `src/features/<area>/*.tsx` component it renders |
| **A reusable visual component** (a button, card, icon set, colors, spacing) | `src/ui/*.tsx` for components, `src/constants/theme.ts` for colors/spacing/type tokens |
| **Navigation / which screens exist** | `src/app/` file structure defines the routes (expo-router file-based routing); `src/features/app-shell/root-navigator.tsx` decides which route groups are reachable (onboarding vs. the main app) |
| **A bottom sheet's behavior** (Add/Edit/Confirm, Filter, category pickers) | The sheet body lives in `src/features/<area>/*-sheet.tsx`; it's rendered by `src/features/app-shell/sheet-host.tsx`, and opened from anywhere via `useSheetRegistry` in `src/stores/` |
| **Database schema** (add/change a column or table) | `src/db/schema.ts`, then run `drizzle-kit generate` (see `drizzle.config.ts`) to create a migration in `src/db/migrations/` |
| **How data is read or written** | `src/db/repositories/*.ts` — this is the *only* place that should run a database query. Never query the database directly from a screen or component |
| **SMS detection logic** (what counts as a transaction, how amount/direction/account are read) | `src/domain/parser/` — `parse-sms.ts` is the entry point, `extract.ts` has the actual regex-based field readers, `ignore-rules.ts` decides what to discard (OTPs, promos, etc.) |
| **Which SMS senders are trusted** | `src/constants/sms-senders.ts` |
| **Notification content / actions** | `src/services/notifications/content.ts` (text), `categories.ts` (which buttons show), `post.ts` (actually posting) |
| **What happens when a notification button is tapped** | `src/services/notifications/respond.ts` (Save/Discard) and `src/features/app-shell/notification-router.tsx` (Add/tap-to-open) |
| **In-progress form state** (what's typed before saving) | `src/stores/*.ts` — one small Zustand store per form/sheet |
| **Money/date display formatting** | `src/domain/format/money.ts` and `src/domain/format/when.ts` |
| **App-wide state that must survive across screens but isn't "real" data** | A new file in `src/stores/` — but check first whether it should actually be a database table instead |
| **Authentication** | There isn't any. CoinFlow has no accounts, login, or backend — everything is local to the device |
| **Any outgoing network/API call** | There aren't any in normal operation. The only network code in the whole app is the opt-in crash reporter (`src/services/crash/`) — this is enforced by an actual test, `src/__tests__/no-network.test.ts` |
| **Crash reporting behavior / privacy scrubbing** | `src/services/crash/index.ts` (Sentry setup + scrubbing) and `src/lib/log.ts` (the app's logger, which decides what's even allowed to reach Sentry) |
| **The native SMS receiver itself** (rare — this is native Android code) | `modules/coinflow-sms/android/src/main/java/expo/modules/coinflowsms/` (Kotlin) — changing this requires a full native rebuild (`expo run:android`), not just a JS reload |

A few of the table's terms, unpacked:

- **A "bottom sheet"** is a panel that slides up from the bottom edge of the screen and sits on
  top of the current screen (the Add/Edit/Confirm form, filters, category pickers all work this
  way here) — a common mobile-UI pattern for a short, focused task without fully navigating away
  from where you were.
- **`drizzle-kit generate`** is a command-line tool (part of the Drizzle ORM ecosystem mentioned
  in section 1) that looks at `src/db/schema.ts`, compares it to the last-generated version, and
  writes out a new migration file automatically — you don't hand-write the database-change SQL
  yourself.
- **"The only place that should run a database query"** (`src/db/repositories/*.ts`) — this is
  the repository pattern mentioned in section 4: centralizing all database access in one file
  per table makes it much easier to reason about, test, and change how data is stored later,
  since nothing outside that file needs to know the details.
- **"A JS reload"** vs. **"a full native rebuild"** — when you edit ordinary
  JavaScript/TypeScript code, Metro (see section 2) can push the change into the already-running
  app in seconds. Editing native Kotlin/Java code has no such shortcut — Android has to
  recompile and reinstall the whole app, which is what `expo run:android` does from scratch.
- **"No accounts, login, or backend"** / **"no outgoing network/API call"** — "authentication"
  is the general term for logging in/proving who you are; a "backend" is a server somewhere on
  the internet that an app talks to; an "API call" is one specific request an app sends to such
  a server. CoinFlow has none of these — there's nothing to log into and no server anywhere it
  talks to, which is also *why* it's able to make the strong "no network requests" privacy claim
  in section 1. `src/__tests__/no-network.test.ts` is an automated test (part of `npm test`)
  that actively checks this stays true, rather than just relying on nobody accidentally adding
  a network call later.

---

## 6. How the app works

### The core flow: SMS → notification → confirmed transaction

This diagram traces one SMS all the way from arriving on the phone to becoming a saved
transaction, top to bottom, naming the exact file responsible for each step:

```
SMS arrives on the phone
        ↓
SmsReceiver.kt (native, modules/coinflow-sms/android)
  — the only code guaranteed to run even if the app is fully closed
        ↓
CoinflowSmsHeadlessTaskService.kt boots a headless (no UI) JS engine
        ↓
src/services/tasks/sms-ingest.ts  →  smsIngestTask()
  1. is the sender a known bank/payment app?          (src/constants/sms-senders.ts)
  2. parseSms(body)                                    (src/domain/parser/)
  3. is this actually a transaction, not a promo/OTP/balance check?
  4. has this exact SMS already been processed? (dedupe check)
  5. save a "Suggestion" row                           (src/db/repositories/suggestions.ts)
  6. look up the account's learned category            (src/db/repositories/account-rules.ts)
  7. post a notification                               (src/services/notifications/)
        ↓
User taps "Save" (known account) or opens the app to review
        ↓
src/services/notifications/respond.ts  or  src/features/transactions/transaction-sheet.tsx
        ↓
A real "transaction" row is written                    (src/db/repositories/transactions.ts)
        ↓
Every screen watching that data re-renders automatically (useLiveQuery — no manual refetch anywhere)
```

A couple of the steps above, unpacked:

- **"the only code guaranteed to run even if the app is fully closed"** — Android will actually
  launch this small piece of native code in response to an incoming SMS even if you've swiped
  CoinFlow away and it isn't running at all; that's what lets detection work without you having
  the app open.
- **A "dedupe check"** ("dedupe" = de-duplicate) makes sure the exact same SMS is never turned
  into two separate suggestions — for instance if it somehow got delivered/processed twice.
- **A "Suggestion" row** — "row" is database terminology: a database table is like a
  spreadsheet, and a "row" is one entry/record in it — here, one pending SMS-detected
  transaction waiting in the Review Queue.
- **"no manual refetch anywhere"** — is explained just below, in "Why data updates everywhere
  automatically."

### Manual entry flow

Tapping the tab bar's "+" opens the same Add/Edit/Confirm sheet
(`src/features/transactions/transaction-sheet.tsx`) in `'add'` mode instead of `'confirm'` mode
— it's one shared component for all three cases, because they share almost every field and
behavior.

### Why data updates everywhere automatically

`src/db/client.ts` opens SQLite with `enableChangeListener: true` (a setting that makes SQLite
actively announce every time a row changes, rather than the app having to ask "did anything
change?" over and over). Every `use*` hook in `src/db/repositories/` is built on Drizzle's
`useLiveQuery`. A **hook**, in React terms, is a function (conventionally named starting with
`use`) that a screen calls to tap into some piece of live data or behavior; `useLiveQuery`
specifically means "give me this data, and automatically re-run this query and hand me the fresh
result whenever the underlying data changes." Put together, this means **any** write from
**anywhere** — the UI, or the background SMS task — makes every screen currently reading that
data re-render (redraw itself with the latest values) with the new value. Nothing in this
codebase manually "refetches" data (i.e. no screen has to remember to go re-ask the database
"has anything changed?" — it's notified automatically instead).

### The "account memory" that makes detection feel smart

There's no keyword-based guessing and no machine learning (machine learning being the technique
of training a statistical model on lots of examples — this app deliberately doesn't use that
approach; everything it does is traceable, explainable logic). The only thing that pre-fills a
category is: *"have I confirmed a transaction from this exact account before, and what did I
pick?"* That's `src/db/repositories/account-rules.ts` — one row per **normalized** account
(explained next), updated
every time you confirm a transaction with an account attached. See
`src/domain/normalize.ts` for how a messy bank SMS account string becomes a stable comparison
key — "normalizing" means converting inconsistent, real-world text (a bank might refer to the
same account slightly differently across different SMS messages) into one consistent, comparable
form, so the app can reliably recognize "this is the same account as last time" — and
`src/domain/categorize.ts` for how a rule turns into a pre-filled category.

### App startup sequence

This is what happens, in order, from the moment you tap the CoinFlow icon:

1. `index.js` imports `src/services/tasks` (registers background task handlers) **before**
   `expo-router` even mounts (before the screen-navigation system even starts up) — this is what
   makes background SMS handling work even when the JS engine was started specifically to run a
   background task, not to show the UI. In other words, the app is set up to handle a background
   SMS the same way whether it's already open or being started from scratch just to process
   that one message.
2. `src/app/_layout.tsx` (the "root layout" — the outermost wrapper every screen in the app
   renders inside of) waits for fonts to load, then renders `<MigrationGate>`.
3. `<MigrationGate>` (`src/db/migration-gate.tsx`) runs SQLite migrations (applies any pending
   database-structure updates — see the "Migrations" gloss in section 4), seeds default
   categories (creates the starting set of categories the very first time the app runs, so
   you're not staring at an empty list), and purges old soft-deleted rows (a "soft delete" means
   a row is marked as deleted rather than immediately erased, so it can potentially still be
   recovered for a while; "purging" is the later, permanent cleanup of those) — the native splash
   screen (the logo screen Android shows while an app is still starting up, before it has
   anything to actually display) stays up the whole time, so you never see a half-loaded app.
4. Once that's done, `RootNavigator` (`src/features/app-shell/root-navigator.tsx`) decides
   whether to show onboarding (the first-run introduction/setup flow, shown only the very first
   time you open the app) or the main app tabs.

---

## 7. Beginner guide — recommended reading order

If you want to actually learn this codebase rather than just look things up, read in this
order. Where a term below was already explained higher up in this document (e.g. "domain,"
"repository," "headless task," "hook"), it isn't re-explained here — search back up if you need
a reminder.

1. **`SPEC/idea.md`** — the product vision in plain English. Read this first; it explains *why*
   the app works the way it does.
2. **`src/db/schema.ts`** — the 5 database tables. Once you know the data model, everything else
   makes more sense.
3. **`src/domain/parser/parse-sms.ts`** and **`extract.ts`** — the "brain" of automatic
   detection. Small, pure, heavily commented, no framework noise to wade through.
4. **`src/services/tasks/sms-ingest.ts`** — see the full detection pipeline end-to-end in one
   function.
5. **`src/db/repositories/transactions.ts`** — how a transaction actually gets written, and what
   gets derived automatically.
6. **`src/features/transactions/transaction-sheet.tsx`** — the single most important UI
   component; used for Add, Edit, *and* Confirm.
7. **`src/features/app-shell/sheet-host.tsx`** and **`root-navigator.tsx`** — how screens and
   sheets actually get shown; the trickiest, most carefully-commented UI-plumbing in the app
   ("plumbing" here meaning the structural, behind-the-scenes wiring that makes the visible UI
   work, as opposed to the visible UI itself).
8. **`src/services/notifications/`** (read the 6 files in order: `channel.ts`, `categories.ts`,
   `content.ts`, `post.ts`, `respond.ts`, `deep-link.ts`) — how a detected transaction becomes a
   notification and back again.
9. **`src/domain/analytics.ts`** + **`src/db/repositories/analytics.ts`** — once you're
   comfortable with the data model, see how it's turned into the numbers on the Analytics tab.
10. From there, browse `src/ui/` and `src/features/` — they're small, single-purpose files that
    should each make sense on their own once you have the data model and core flow down.

Every file above (and every other file in `src/` and `modules/coinflow-sms/`) now has a
comment block at the top explaining its purpose, what calls it, what it depends on, and
anything non-obvious about it — start there before diving into any file's actual code.

---

## 8. Notes — limitations, deferred items, and things worth knowing

- **No import, only export.** You can get your data out (JSON/CSV/raw database copy), but
  there's no way to import data back in, in this version.
- **No light theme.** Most apps offer both a light ("normal," bright background) and dark
  (dark background, light text) color scheme; CoinFlow is dark-mode-only right now
  (`useColorScheme()` always returns `'dark'`); the hook exists specifically so a light theme
  could be added later without touching every call site (every place in the code that calls it).
- **iOS is a stub.** `npm run ios` exists, but SMS detection (the app's core feature) is
  Android-only by design — there's no timeline for iOS support implied anywhere in the repo.
- **Two things the code documents as known gaps, found while writing these comments:**
  - `src/db/maintenance.ts`'s `runLaunchMaintenance` function is unused **dead code** (code that
    still exists in the project but is never actually called/run by anything, usually left
    behind after logic was moved elsewhere) — the startup
    logic it was meant to bundle is actually run inline (directly, in place, rather than by
    calling out to this separate function), in a different file
    (`src/db/migration-gate.tsx`).
  - `src/services/notifications/reconcile.ts`'s "restore a lost notification" **self-heal**
    (logic meant to automatically detect and fix a problem on its own, without a person having
    to notice and intervene) only
    currently runs when a new SMS arrives — not on every app launch/foreground (returning to the
    app from the background) the way its own
    design comment describes. A notification lost to a device reboot (the phone restarting)
    won't reappear until the
    next SMS comes in (the underlying suggestion is never lost, just its notification).
- **Android notification grouping doesn't visually stack**, due to a library limitation — each
  detected transaction shows as its own notification rather than collapsing under the "N to
  review" summary. Documented as an accepted gap in `src/services/notifications/post.ts`.
- **Split expenses / reimbursements** (`SPEC/idea.md`'s "Version 1.5") are not built — the
  current version only handles individual transactions.
- **`SPEC/SPEC-implementation.md`** is a very large, chronological build log —
  useful as a detailed historical record of *why* a specific decision was made, but not meant
  to be read start-to-finish. `SPEC/traceability.md` is a more structured pass/fail matrix
  (a table cross-checking each planned feature against whether it was actually completed) of
  which features are actually done.
- **`design-prototype/`** contains static HTML mockups (non-functional visual drafts — plain
  HTML/CSS pages built just to show what a screen should look like, with no real underlying app
  logic behind them) used to nail down the visual design
  *before* any real screen was built — not live code, just historical reference.
