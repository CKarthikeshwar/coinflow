# CoinFlow

CoinFlow is a personal finance / expense-tracking Android app. Its core idea: **you shouldn't
have to manually type in every transaction**. CoinFlow reads your bank/UPI SMS notifications
on-device, detects transactions in them, and turns each one into a one-tap confirmation instead
of a manual entry form.

> Transaction happens → Bank/UPI SMS arrives → CoinFlow detects it → notification → you tap
> "Save" or quickly review it → transaction is recorded.

This document is a map of the codebase for anyone picking it up for the first time. It's based
entirely on what's actually in the repository — nothing here is aspirational or guessed.

---

## 1. Project overview

### What it does

- **Automatic detection** — reads incoming SMS, works out whether money was debited or
  credited, the amount, the account/merchant, and the payment method (UPI/card/bank
  transfer/wallet), then posts a notification.
- **One-tap confirm, or quick review** — if you've confirmed a transaction from that same
  account before, the notification's "Save" button records it immediately with the category you
  used last time. Otherwise you get a short review sheet.
- **Manual entry** — for cash payments or anything SMS can't catch, you can add a transaction
  by hand.
- **A learning "account memory"** — the app remembers which category/note/payment method you
  picked for a given account, and reuses it automatically next time — never guessed from
  keywords, only from what you've actually confirmed before.
- **Categories** — 9 default categories plus an "Uncategorized" bucket; you can create, rename,
  reorder, and delete your own.
- **Transaction list** — a searchable, filterable, day-grouped ledger of everything recorded.
- **Analytics** — running balance, this month's/week's income vs. spending with
  month-over-month change, a category breakdown, a daily spend chart, and your biggest expenses.
- **Review Queue** — an inbox of SMS-detected transactions still waiting for you to confirm or
  dismiss.
- **Data controls** — export everything as JSON or CSV via the OS share sheet, or wipe the app
  back to a fresh install.
- **Privacy by design** — the app makes **no network requests at all** by default. The only
  exception is optional, opt-in crash reporting (off unless you turn it on in Settings), and
  even then reports are scrubbed of anything that looks like money, an account, or a UPI id
  before they're sent. Raw SMS text is never stored anywhere, ever — only the fields parsed out
  of it.

### What it's built with

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

**Platform: Android only.** The app needs to read SMS on-device, which is not something iOS or
the web allow. iOS is a stub target for later; the web build exists only so you can preview
UI in a browser — every real screen shows an "Android only" message there instead.

---

## 2. Installation

### Prerequisites

- Node.js (see `package.json`'s tooling; a recent LTS works)
- A Java 17 JDK + Android Studio / the Android SDK, if you're building locally
- An Android phone or emulator to actually test on (SMS detection needs a real phone or a way
  to inject test SMS — an emulator can't receive real SMS)

The repo already has a full, step-by-step walkthrough of the one-time computer/phone setup at
**`docs/local-android-build.md`** — that's the most detailed and accurate installation guide in
this project; read it if this is your first time building an Android app on your machine.

**Important:** this app cannot run in **Expo Go**. It has a custom native module
(`modules/coinflow-sms/`), so you need a **development build** (`expo run:android`) or an EAS
development/internal build instead.

### Install dependencies

```bash
npm install
```

### Run it

```bash
npm run android      # builds a dev client, installs it on a connected device/emulator, starts Metro
```

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

### Build a release APK / production build

- **Locally**: `docs/local-android-build.md` Part 5 covers producing a `.apk` file from a local
  build.
- **Cloud (EAS)**: `eas.json` defines `development`, `preview`, and `production` build profiles
  for `eas build`. There's also an `eas submit` profile for Play Store submission.

---

## 3. APK — download link

**[Download the latest APK](https://github.com/CKarthikeshwar/coinflow/releases/latest/download/coinflow.apk)**

That link always points to whichever release is newest — it never needs updating by hand. A new
signed APK is built and published automatically every time a version tag (`v1.2.3`) is pushed;
see `.github/workflows/release.yml` and the "Cutting a release" section in
`docs/sentry-and-ci.md` for exactly how that pipeline works and what one-time setup it needs.

---

## 4. Codebase structure

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
├─ SPEC/, SPEC-UI-UX.md, SPEC-implementation.md   # Design/process history (see Notes below)
├─ design-prototype/               # Static HTML prototypes used before any real screen was built
├─ docs/                           # local-android-build.md, sentry-and-ci.md
└─ e2e/                            # A Maestro end-to-end test flow
```

---

## 5. Where to make changes

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

---

## 6. How the app works

### The core flow: SMS → notification → confirmed transaction

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

### Manual entry flow

Tapping the tab bar's "+" opens the same Add/Edit/Confirm sheet
(`src/features/transactions/transaction-sheet.tsx`) in `'add'` mode instead of `'confirm'` mode
— it's one shared component for all three cases, because they share almost every field and
behavior.

### Why data updates everywhere automatically

`src/db/client.ts` opens SQLite with `enableChangeListener: true`. Every `use*` hook in
`src/db/repositories/` is built on Drizzle's `useLiveQuery`, which means **any** write from
**anywhere** — the UI, or the background SMS task — makes every screen currently reading that
data re-render with the new value. Nothing in this codebase manually "refetches" data.

### The "account memory" that makes detection feel smart

There's no keyword-based guessing and no machine learning. The only thing that pre-fills a
category is: *"have I confirmed a transaction from this exact account before, and what did I
pick?"* That's `src/db/repositories/account-rules.ts` — one row per normalized account, updated
every time you confirm a transaction with an account attached. See
`src/domain/normalize.ts` for how a messy bank SMS account string becomes a stable comparison
key, and `src/domain/categorize.ts` for how a rule turns into a pre-filled category.

### App startup sequence

1. `index.js` imports `src/services/tasks` (registers background task handlers) **before**
   `expo-router` even mounts — this is what makes background SMS handling work even when the
   JS engine was started specifically to run a background task, not to show the UI.
2. `src/app/_layout.tsx` waits for fonts to load, then renders `<MigrationGate>`.
3. `<MigrationGate>` (`src/db/migration-gate.tsx`) runs SQLite migrations, seeds default
   categories, and purges old soft-deleted rows — the native splash screen stays up the whole
   time.
4. Once that's done, `RootNavigator` (`src/features/app-shell/root-navigator.tsx`) decides
   whether to show onboarding (first launch) or the main app tabs.

---

## 7. Beginner guide — recommended reading order

If you want to actually learn this codebase rather than just look things up, read in this
order:

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
   sheets actually get shown; the trickiest, most carefully-commented UI-plumbing in the app.
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
- **No light theme.** The app is dark-mode-only right now (`useColorScheme()` always returns
  `'dark'`); the hook exists specifically so a light theme could be added later without
  touching every call site.
- **iOS is a stub.** `npm run ios` exists, but SMS detection (the app's core feature) is
  Android-only by design — there's no timeline for iOS support implied anywhere in the repo.
- **Two things the code documents as known gaps, found while writing these comments:**
  - `src/db/maintenance.ts`'s `runLaunchMaintenance` function is unused dead code — the startup
    logic it was meant to bundle is actually run inline, in a different file
    (`src/db/migration-gate.tsx`).
  - `src/services/notifications/reconcile.ts`'s "restore a lost notification" self-heal only
    currently runs when a new SMS arrives — not on every app launch/foreground the way its own
    design comment describes. A notification lost to a device reboot won't reappear until the
    next SMS comes in (the underlying suggestion is never lost, just its notification).
- **Android notification grouping doesn't visually stack**, due to a library limitation — each
  detected transaction shows as its own notification rather than collapsing under the "N to
  review" summary. Documented as an accepted gap in `src/services/notifications/post.ts`.
- **Split expenses / reimbursements** (`SPEC/idea.md`'s "Version 1.5") are not built — the
  current version only handles individual transactions.
- **`SPEC-implementation.md`** (in the repo root) is a very large, chronological build log —
  useful as a detailed historical record of *why* a specific decision was made, but not meant
  to be read start-to-finish. `SPEC/traceability.md` is a more structured pass/fail matrix of
  which features are actually done.
- **`design-prototype/`** contains static HTML mockups used to nail down the visual design
  *before* any real screen was built — not live code, just historical reference.
