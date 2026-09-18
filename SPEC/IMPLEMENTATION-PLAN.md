# CoinFlow — Implementation Spec: Build Plan

> **What this is.** This document is a "plan for writing a plan" — a **meta-plan**.
> **Plain-English:** it does not itself describe how the app's code works; it describes,
> step by step, how the *real* technical document (`SPEC-implementation.md`) will get written.
> Specifically, it plans out producing the *technical half* of `SPEC-implementation.md`
> (everything `SPEC/PLAN.md` §8 calls for and the current draft doesn't have yet). This
> planning pass is **Phase 0** and is done. Phases 1–5 each land a coherent slice of the spec
> and are each sized to about half a working session (roughly half a day of focused work) —
> run them one at a time, not all at once.
>
> **Frozen inputs, do not reopen here:** `SPEC/idea.md` (product scope — what the app is
> supposed to do), `SPEC-UI-UX.md` (visual + screen spec, v1 frozen — what it looks like and
> how it behaves on screen), `SPEC-implementation.md` §1–§15 (product / behavior — the parts
> of the technical spec already written). "Frozen" means these documents are considered
> final and settled; they are not to be second-guessed or edited while working through this
> plan. If something in this plan seems to conflict with one of those frozen documents, that
> is treated as a **change-request** (a formal "we may need to change something that was
> already agreed" flag, defined in `SPEC/PLAN.md` §10) — not something to quietly fix on the
> side without telling anyone.
>
> **After Phase 5:** feature implementation (`SPEC/PLAN.md` §9 — actually writing the app's
> features in code) is a separate track (a separate stream of work that happens later) — one
> feature at a time, with `UI-0xx → IMP-0xx → component → test` traceability (meaning: every
> piece of code written can be traced back to a specific UX requirement (`UI-0xx`) and a
> specific implementation requirement (`IMP-0xx`), and has a test proving it works).

---

## 0. Decisions locked in Phase 0

These are copied into `SPEC-implementation.md` §1 (Decisions log) as D14–D21 and resolve most of
its §15 open questions. ("Decisions log" is exactly what it sounds like — a running numbered
list of firm choices, D1, D2, D3…, so nobody has to re-argue them later. "Open questions" are the
opposite: things still undecided, each with its own number, Q1, Q2, Q3….)

### Product scope

| # | Decision | Notes |
|---|---|---|
| **D14** | **Analytics period: Month *and* Week both ship in V1.** | Confirms D11. Week reuses the month aggregation code (the calculations that add up numbers into totals); Phase 3 specs ISO-week boundaries (ISO 8601 is the international standard that says every week starts on Monday and is numbered 1–52/53 — using it avoids ambiguity about which day a week "starts" on) and decides whether the comparison line reads "vs last week" or a generic "vs previous period". Resolves §15 Q5. |
| **D15** | **No "exclude from totals" toggle in V1.** Deferred to a later version. | V1 (version 1, the first shipped release) accepts the P-8 inaccuracy (self-transfers count as spending). The model (the shape/structure of the data, i.e. what fields a "transaction" record has) keeps `type` so real Transfer/Refund types land later with no migration (a **migration** is a scripted change to the shape of a database — e.g. adding a new column — that upgrades existing saved data safely instead of throwing it away; "no migration" here means the field is already in place, so nothing needs to change later). Resolves §15 Q1 / Q6 (toggle part). |
| **D16** | **Settings › Account rules screen ships in V1** with read + edit + delete. | It's the only window (way for the user to see and control) into why auto-categorisation behaves as it does. Lowest priority — build it last. Resolves §15 Q3. |
| **D17** | **Export = JSON full backup + CSV transactions.** JSON carries transactions + custom categories + account rules; CSV is transactions only, for spreadsheets. **No import / restore in V1** (Future). | Resolves §15 Q4. **Plain-English:** JSON and CSV are two common file formats for saving structured data to a file — JSON preserves nested detail and app-specific structure (good for a full backup), CSV is a simple flat table of rows and columns that spreadsheet programs like Excel can open directly. |

### Architecture

("Architecture" means the big-picture shape of how the software's pieces fit together and talk
to each other — which part does what, and how data flows between them.)

| # | Decision | Notes |
|---|---|---|
| **D18** | **SMS pipeline: JS-owned, thin native bridge.** A small local Expo module (Kotlin) registers the SMS broadcast receiver and forwards incoming messages to a headless JS / TaskManager task; **all** parsing, DB writes, notification posting and notification-action handling live in JS/TS. | One testable codebase for parsing. **Contingency (documented in Phase 1, not built):** a hybrid where native posts the notification immediately for cold-start latency / OEM-battery-killer resilience — adopt only if field testing shows dropped events. **Plain-English, term by term:** a **native module** is a small chunk of code written directly for the phone's own platform (here, Kotlin — Android's native programming language) that JavaScript can call into, used when something isn't possible in JS/TypeScript alone (like registering to be notified the instant a text message arrives). A **broadcast receiver** is an Android OS mechanism: apps can register to be woken up and handed data whenever a particular system-wide event happens — here, "a new SMS arrived". A **headless JS task** (also called a **background task**) is JavaScript code that runs without any visible screen or UI, often while the app is fully closed — "headless" as in no visible "head" (screen) attached. `TaskManager` is the Expo/React-Native library that lets JS register and run these background tasks. "JS-owned, thin native bridge" means: the native Kotlin code is deliberately kept tiny and just relays the raw SMS text over to JavaScript, where all the real logic (reading the text, deciding it's a transaction, saving it, showing a notification, handling notification button taps) lives — so almost the entire pipeline is in one language (JS/TypeScript) that's easier to test. The rejected alternative ("hybrid") would have the native Kotlin side post the notification itself, immediately, before JS even wakes up — faster on a cold start (the very first run after the phone/app was fully shut down, which is naturally slower) and more resistant to Android phone manufacturers' aggressive battery-saving features that can kill background JS before it runs; that fallback is written down as a plan but not built unless real-world testing shows messages are being missed. |
| **D19** | **Persistence: `expo-sqlite` + Drizzle ORM.** Typed schema, generated migrations, live/reactive queries; raw SQL still available for analytics aggregation. On-device only (D10). | Rejected: hand-written SQL (boilerplate, manual migrations); WatermelonDB (heavy, unused sync engine). **Plain-English, term by term:** "persistence" is the general term for saving data so it survives after the app closes (as opposed to data that lives only in memory and disappears). **SQLite** is a lightweight, file-based database engine that runs directly inside the app (no separate server) — `expo-sqlite` is the Expo library that gives JS/TypeScript access to it on the phone. An **ORM** (Object-Relational Mapper) is a library that lets you describe and query a database using normal programming-language code/objects instead of writing raw SQL text by hand — **Drizzle** is the specific ORM chosen here. A "typed schema" means the shape of every database table is written once in TypeScript, and the type-checker then catches mistakes (like typos in column names) before the app even runs. "Generated migrations" means Drizzle's tooling (`drizzle-kit`) can automatically write the migration scripts for you by comparing the old and new schema, instead of a person hand-writing them. "Live/reactive queries" are database reads that automatically re-run and update the on-screen UI the moment the underlying data changes — no manual refresh needed. "Raw SQL" is the database's own native query language, written directly as text; it's kept available as an escape hatch for the more complex aggregate calculations analytics needs. SQL itself stands for Structured Query Language, the standard language for asking a database questions. "On-device only" (per decision D10, made earlier and referenced here) means all data lives solely on the user's phone — nothing is uploaded to any server. WatermelonDB was rejected as "heavy" (adds a lot of overhead) with an "unused sync engine" — it's built around syncing data between a phone and a server, a feature this offline-only app has no use for. |
| **D20** | **Distribution: direct install.** EAS-built APK, side-loaded or via EAS internal distribution. **Not** the Play Store. | `READ_SMS` / `RECEIVE_SMS` are Play-restricted and expense tracking is not an approved use — Play would mean rejection or an SMS-less build. Direct install matches `idea.md`'s "creator's own everyday use case". Play Store + SMS-less fallback = Future. **Plain-English, term by term:** "distribution" here means how the finished app actually reaches a phone. An **APK** (Android Package) is the installable file format for Android apps — think of it like a `.exe` on Windows. **EAS** (Expo Application Services) is Expo's cloud build service that compiles the app into that APK file. "Side-loaded" means installing the APK file directly onto a phone (e.g. by downloading it and tapping install) instead of going through an app store. "EAS internal distribution" is Expo's own lightweight system for sharing a build with a small group of people (e.g. via a link) without publishing it publicly. This is explicitly **not** going through the Google Play Store, because the `READ_SMS` and `RECEIVE_SMS` Android permissions (which let the app read text messages — essential to this app's whole purpose) are restricted by Google Play's policies to only a narrow set of approved app categories, and "personal expense tracker" isn't one of them; submitting would mean either the app gets rejected, or it would have to ship a version stripped of the SMS-reading feature that's central to the product. |
| **D21** | **Security: baseline + crash reporting only.** Baseline (always on): app-private storage, `android:allowBackup=false`, no network. **Add:** crash reporting — stack traces only, **no** breadcrumbs from financial screens, **no** transaction/SMS content, **no** PII, with a Settings opt-out. **Not in V1:** biometric / PIN app lock, SQLCipher DB encryption (both Future). | P-9 is amended for the crash-reporting carve-out. Phase 5 picks the SDK (Software Development Kit — a packaged library plus tools for a particular service, here a crash-reporting service) and the default (on-with-opt-out vs opt-in). **Plain-English, term by term:** "app-private storage" means the app's saved data lives in a folder on the phone that only this app can read — other apps can't peek into it. `android:allowBackup=false` is a setting in the Android app manifest (the app's configuration/metadata file) that stops Android's automatic cloud-backup system from ever copying this app's private data off the device. "No network" means the app never makes any internet requests — this is a hard privacy guarantee since it stores financial data. "Crash reporting" means a third-party service automatically collects and reports data when the app crashes, to help find and fix bugs. A **stack trace** is the technical record of exactly which lines of code were running, in order, at the moment of a crash — useful for debugging, but on its own it reveals no user data. A **breadcrumb** (in crash-reporting jargon) is a trail of small logged events ("user tapped X", "screen Y opened") kept around so that when a crash happens, the reporting tool can show what led up to it — the decision here is to record none of these from screens that show financial information, so no money details leak into crash reports even indirectly. **PII** stands for Personally Identifiable Information (anything that could identify a specific real person — name, phone number, etc.) — none of that is ever sent. A **biometric / PIN app lock** is a lock screen requiring a fingerprint/face scan or PIN code just to open the app — not included in V1. **SQLCipher** is an encrypted variant of SQLite that scrambles the whole database file on disk — also not included in V1. Both are marked "Future" (planned for a later version, not V1). |

**Still open (low stakes, parked):** §15 Q7 — duplicate handling stays manual-only for V1 (D8) unless
Phase 3's parser work surfaces a reason to revisit. ("Parked" means intentionally set aside for
now rather than decided — it may get picked up again later.)

---

## 1. Chosen stack (Phase 1 pins exact versions + writes the rationale)

The **"stack"** (short for "tech stack") is just the full list of frameworks, libraries and tools
the app is built out of — this section is that list, plus *why* each one was picked over the
alternatives ("rationale").

Runtime is fixed by the repo: **Expo SDK ~57.0.18 · React Native 0.86.3 · React 19.2 · expo-router ~57**,
TypeScript strict, `experiments.reactCompiler` + `typedRoutes` on.
**Plain-English:** Expo is the overall framework/toolkit this app is built with, on top of React
Native (the underlying framework for writing mobile apps in JavaScript/TypeScript that run as real
native Android/iOS apps), which is in turn built on React (the component-based UI library
originally made for websites). `expo-router` is Expo's file-based navigation system — it turns the
files under `src/app/` into the app's screens/routes automatically. "TypeScript strict" means the
type-checker (which catches whole categories of bugs before the app even runs, by checking that
values are used consistently with their declared types) is turned up to its strictest, most
error-catching setting. `experiments.reactCompiler` and `typedRoutes` are two optional, currently
labelled-experimental Expo/React features that are switched on for this project (the reactCompiler
auto-optimizes component re-rendering; typedRoutes makes navigating between screens type-checked
too, so a typo in a route name is caught by the compiler instead of only failing at runtime).
Per `AGENTS.md`, every library below is **re-checked against the v57 docs in Phase 1** before it's
pinned (i.e., before its exact version number is locked in and committed to) — because, as
`AGENTS.md` warns, Expo SDK 57 changed many APIs from earlier versions, so old knowledge/memory
about how a library works can't be trusted without checking the current docs first.

| Concern | Choice | Rejected / notes |
|---|---|---|
| Database | `expo-sqlite` + **Drizzle ORM** + `drizzle-kit` | D19 — see D19 above for what SQLite and an ORM are. |
| Reactive reads | Drizzle live queries | TanStack Query (a popular library for fetching and caching remote-server data) is unnecessary here since there's no remote server to talk to — this is a purely local database. |
| Ephemeral UI state | **Zustand** (sheet drafts, keypad buffer, filter draft, onboarding step) | Redux / Jotai overkill. **Plain-English:** "state" in UI programming means all the data a screen needs to remember while it's open (what the user has typed, which tab is selected, etc). "Ephemeral" state is temporary and UI-only — it doesn't need to be saved permanently to the database, just held in memory while the relevant screen/sheet is open (e.g. what the user has typed into a not-yet-saved amount-entry keypad). **Zustand** is a small, simple state-management library (a tool for storing and sharing this kind of in-memory data across components) — chosen here instead of the heavier alternatives Redux or Jotai, which the author judged as more machinery than this app's simple ephemeral-state needs justify ("overkill"). |
| Navigation | `expo-router` tabs/stack + **`@gorhom/bottom-sheet` v5** for every sheet | native modals can't do the docked-keypad + collapse-on-scroll + discard-confirm (§6.4, motion §3.5). **Plain-English:** a "sheet" here is a panel that slides up from the bottom of the screen (as opposed to a full-screen page). `@gorhom/bottom-sheet` is a well-regarded third-party library for building these, chosen over the operating system's own built-in "native modal" popups because it supports the specific fancy behaviors this app's design needs (a numeric keypad docked to the bottom of a sheet, the sheet collapsing as the user scrolls, and asking to confirm before discarding an unsaved sheet) that plain native modals can't do. |
| Long lists | **`@shopify/flash-list` v2** | 2,000+ rows (§6.7). **Plain-English:** a plain scrolling list in React Native renders every row's UI even off-screen, which gets slow with thousands of items; `FlashList` is a library built to efficiently render only what's visible, keeping long lists (here, transaction lists that could grow past 2,000 rows) smooth. |
| Charts | **`react-native-svg` + `d3-shape` / `d3-scale`**, hand-rolled | bespoke greyscale arc gauge, donut, dashed mean line, outlier clipping — Victory/Skia too heavy for this. **Plain-English:** SVG (Scalable Vector Graphics) is a way of drawing shapes/graphics with code rather than pixels — `react-native-svg` brings that drawing capability to React Native. `d3-shape`/`d3-scale` are small utility libraries (from the well-known D3 data-visualization toolkit) that handle the math of turning raw numbers into chart shapes/positions. "Hand-rolled" means the charts are custom-built from these low-level pieces rather than using an off-the-shelf charting library, because the design calls for very specific ("bespoke," i.e. custom-made) visuals — a grayscale gauge shaped like an arc, a donut chart, a dashed line marking the mean/average, and special handling for clipping outlier data points — that ready-made chart libraries like Victory or Skia-based ones don't support well enough to be worth their extra weight/complexity. |
| Animation | `react-native-reanimated` v4 + `react-native-worklets` | already installed. **Plain-English:** Reanimated is the standard React Native library for smooth, high-performance animations; "worklets" are small snippets of JS code that Reanimated can run directly on the UI rendering thread (rather than the normal JS thread) so animations don't stutter even if the rest of the app's JS is busy. |
| Notifications | `expo-notifications` + `expo-task-manager` (background response handler) | — |
| SMS ingest | **custom local Expo module** (Kotlin) + a config plugin (manifest receiver + permissions) | D18; requires a dev client, not Expo Go. "SMS ingest" means the part of the app that takes in incoming text messages. **Plain-English:** a **config plugin** is an Expo mechanism for automatically injecting custom native configuration (like Android manifest permissions or a receiver registration) into the generated native Android project during the build, so a developer doesn't have to hand-edit native files. A **dev client** is a custom version of the Expo "Go" app-runner rebuilt to include this project's own native code (like the Kotlin SMS module) — required here because Expo Go (the generic, published app most Expo projects preview in) doesn't and can't include this project's custom native module. |
| Fonts | `expo-font`, bundled **Manrope** + **Geist** TTFs, system-stack fallback | §3.2. TTF = TrueType Font, a common font file format; "bundled" means the font files ship inside the app itself rather than being downloaded; a "system-stack fallback" is a backup list of the phone's own built-in fonts to use if, for any reason, the bundled custom fonts fail to load. |
| Dates | **`date-fns`** (tree-shakeable) | Luxon heavier; Temporal polyfill premature. **Plain-English:** these are all JavaScript libraries for date/time math (adding days, formatting, comparing dates), since JavaScript's own built-in `Date` is notoriously awkward to use correctly. "Tree-shakeable" means a build tool can automatically strip out the unused parts of the library, keeping the final app smaller — `date-fns` supports this well. Luxon is a heavier alternative that was passed over. "Temporal" is a newer, not-yet-fully-available JavaScript date/time standard; a "polyfill" is code that fills in a missing browser/JS feature so it can be used before it's officially supported everywhere — judged "premature" (too early) to rely on here. |
| IDs | `expo-crypto` `randomUUID()` | — A **UUID** (Universally Unique Identifier) is a long randomly-generated ID value used to uniquely label a database record, generated here via Expo's cryptography library. |
| Crash reporting | **Sentry** (`@sentry/react-native` + Expo plugin) — scrubbed per D21 | final SDK choice confirmed in Phase 5. "Scrubbed" means sensitive data is filtered/stripped out before anything is sent, per the privacy rules locked in as decision D21 above. |
| Testing | `jest-expo` + `@testing-library/react-native` + **Maestro** (one E2E flow) | Detox heavier. **Plain-English:** Jest is a JavaScript testing framework that runs individual "unit tests" (small, isolated checks of one function/piece of logic); `jest-expo` adapts it for Expo projects. `@testing-library/react-native` is a companion library for testing React Native components' rendered behavior. **E2E** stands for "end-to-end" — a test that drives the actual running app through a full real user flow from start to finish (e.g. tapping through several screens), as opposed to testing one function in isolation. Maestro and Detox are two competing tools for writing these E2E tests; Maestro was chosen as the lighter-weight option. |
| Lint / format | `expo lint` (ESLint) + Prettier; keep the repo's organize-imports-on-save | **Plain-English:** a **linter** (ESLint here) automatically scans code for likely bugs, style violations, and bad patterns. A **formatter** (Prettier here) automatically rewrites code's whitespace/line-breaks/quote-style to a single consistent look, so developers don't argue about formatting by hand. |

---

## 2. Phase breakdown

Each phase writes new numbered sections into `SPEC-implementation.md` (§16+), keeping §1–§15
intact and adding a table of contents. Each phase ends by updating §1 (Decisions log) if anything
shifted and ticking the phase off in §3 below. (A **phase**, in this document, is one self-contained
chunk of planning work — Phases 1 through 5 are meant to be tackled one at a time, in order, each
producing its own set of finished spec sections.)

### Phase 1 — Foundations: stack, architecture, project structure
**Produces:** §16 Technology Stack · §17 System Architecture · §18 Project Structure.

- Pin every dependency to a v57-compatible version; one-line rationale each; record what was
  rejected and why. (A "dependency" is any external library/package the app relies on; "pinning"
  means locking it to one exact, known-working version number rather than letting it drift.)
- **Architecture:** the layer diagram — native SMS bridge → headless JS task → parser →
  repository → SQLite; UI → repository / live queries → SQLite; notifications module. Then
  data-flow walkthroughs for: (a) SMS arrives while app killed, (b) user taps **Save** on the
  notification while app killed, (c) user opens the app with 5 pending, (d) manual add.
  **Plain-English:** a "layer diagram" is a picture showing the app broken into stacked
  layers/stages, each one handing data to the next — here: the native SMS bridge (the Kotlin
  code that first catches an incoming text) hands off to the headless JS task, which hands off to
  the parser (the logic that reads the raw SMS text and figures out it's a transaction), which
  hands off to the repository (see the "data-access layer" explanation in Phase 2 below — the
  code layer whose job is reading/writing the database), which finally writes to SQLite (the
  actual database file). Separately, the visible app screens (the "UI") also read from that same
  repository/live-queries/SQLite layer to display data, and there's a notifications module that
  shows Android notifications. A "data-flow walkthrough" is a step-by-step trace of exactly what
  happens to a piece of data as it moves through that whole layered pipeline, for a specific
  real-world scenario — like each of the four bullet-pointed scenarios listed here (e.g. what
  exactly happens, layer by layer, when a text message arrives while the app has been fully
  closed/"killed" by the phone).
- **Background execution model:** what runs in the headless task, its time budget, behaviour if
  killed mid-run, idempotency / dedupe of the SMS→Suggestion write, cold-start vs warm.
  **Plain-English:** "background execution" is any code that runs while the app isn't the thing
  currently on screen (or isn't running at all) — Android limits how long and how often this is
  allowed, hence "time budget" (how much runtime the OS will grant before forcibly stopping it).
  "Killed mid-run" means the phone's OS terminates the background task partway through — the plan
  needs to define what happens then (e.g. does a half-finished database write get left in a bad
  state?). **Idempotency** is the property that doing an operation multiple times has the same
  effect as doing it once — important here so that if the same SMS is accidentally processed
  twice (e.g. because the task got killed and restarted), it doesn't create two duplicate
  transaction entries; **dedupe** (deduplication) is the closely related process of detecting and
  discarding such duplicates. "SMS→Suggestion write" refers to the database write that turns a
  parsed SMS into a "Suggestion" record (an auto-detected, not-yet-confirmed transaction awaiting
  the user's one-tap approval). "Cold-start vs warm" distinguishes the task running for the very
  first time after being fully shut down (cold — slower, has to reinitialize everything) versus
  running again shortly after while some setup is still in memory (warm — faster).
- **Contingency design (D18):** the hybrid native-posts-notification fallback, written down but
  not built. (A **contingency** is a backup plan prepared in advance in case the primary plan
  doesn't work out — see D18 above for what this fallback actually does.)
- **Project structure:** `src/` layout, the expo-router route tree with its group structure, the
  `.web` platform-file policy, path aliases, where the native module lives, how it's excluded
  from web. **Plain-English:** "project structure" means how the source code files and folders
  are organized. The "route tree" is the nested folder/file structure under `src/app/` that
  `expo-router` reads to automatically build the app's navigable screens — a "group" in that tree
  is a folder used purely for organizing routes without adding an extra segment to the URL/path.
  "`.web` platform-file policy" is the convention (already described in `CLAUDE.md`) of writing a
  `foo.web.tsx` file alongside `foo.tsx` when a screen/component needs to behave differently on
  the web version of the app. "Path aliases" are shortcuts like `@/*` configured so imports can
  say `@/components/Button` instead of a long relative path like `../../../components/Button`.
  "Excluded from web" means making sure the Android-only native SMS module's code is never
  included when building the website version of the app (since browsers can't read SMS at all).
- **Native module + config plugin plan:** what the Kotlin module exposes, `BroadcastReceiver`
  registration, which permissions the plugin injects, the dev-client requirement. ("Exposes"
  means which functions/capabilities the native Kotlin code makes callable from the JavaScript
  side. See D18 above for `BroadcastReceiver`, and the stack table above for "config plugin" and
  "dev client".)

**Open sub-questions for this phase**

- `src/` layout: feature-first (`src/features/transactions/…`) vs layer-first (`src/db`,
  `src/services`, `src/ui`) — lean feature-first with shared `src/ui` + `src/lib`. **Plain-English:**
  "feature-first" organizes folders by product feature (all of a feature's files — its screens,
  logic, and styles — living together in one folder); "layer-first" instead organizes folders by
  technical role (all database code in one folder, all UI code in another, etc.), regardless of
  which feature it belongs to. The leaning here is toward feature-first, with only the genuinely
  shared/reusable pieces split out into common `src/ui` and `src/lib` folders.
- Headless JS vs `expo-task-manager` background task vs a foreground service for the SMS handler
  — needs a v57-docs check on Android 14/15 foreground-service-type rules. (A **foreground
  service** is Android's mechanism for a task that keeps running with a persistent, user-visible
  notification, exempting it from some of the background-execution limits — one of three
  candidate technical approaches being weighed for how the SMS-handling code actually runs.)
- Does "Save from notification while killed" actually need the JS runtime, or can the native
  module cache the matched `AccountRule` and write via a minimal native SQLite call? Decide here
  — it sets the module's surface area. (The **JS runtime** is the JavaScript engine that has to be
  spun up to run any JS/TypeScript code at all — spinning it up from nothing costs time, so this
  question asks whether tapping "Save" on a notification, while the app is fully closed, can skip
  that cost entirely by having the small native Kotlin module directly look up the already-known
  matching `AccountRule` — see Phase 3 for what that is — and write straight to SQLite itself,
  without ever waking up JavaScript. "Surface area" means how much responsibility/functionality
  the native module ends up having to take on.)

---

### Phase 2 — Data & persistence
**Produces:** §19 Data Models (final) · §20 Persistence & migrations · §21 Data-access layer ·
§22 Application State.

- Promote the §6 sketch to final: every entity, field, type (**integer paise everywhere**),
  nullability, enum values, defaults, timestamps. **Plain-English:** an **entity** is one kind of
  "thing" the app's database keeps track of (e.g. a Transaction, a Category, an Account Rule) —
  each entity has **fields** (the individual pieces of data it stores, like `amount` or
  `createdAt`), and each field has a **type** (what kind of value it can hold — a number, text,
  true/false, etc.). "Integer paise everywhere" is a deliberate money-handling rule: instead of
  storing rupee amounts as decimal numbers like `₹42.50` (which computers can represent
  imprecisely — the classic floating-point rounding-error problem), every amount is stored as a
  whole number of paise (1 rupee = 100 paise), e.g. `4250`, which is exact and can't drift due to
  rounding. **Nullability** is whether a field is allowed to be empty/absent (`null`) or must
  always have a value. **Enum values** ("enum" = enumeration) are a fixed, pre-defined list of
  allowed values for a field — e.g. a `type` field might only ever be `"expense"`, `"income"`, or
  `"transfer"`, nothing else. **Defaults** are the value a field gets automatically if nothing is
  explicitly provided when a record is created. **Timestamps** are fields recording exactly when
  something happened (e.g. `createdAt`, `occurredAt`).
- **Drizzle schema:** tables, PKs/FKs, indices (`occurredAt` desc; `type + occurredAt` for
  analytics; `account`/`normalizedKey` for rule lookup), an **FTS5** virtual table for search
  (note / description / account) with sync triggers, a KV/settings table. **Plain-English, term
  by term:** a database **table** is one grid of rows and columns, one per entity (e.g. a
  `transactions` table). A **PK** (Primary Key) is the field that uniquely identifies each row in
  a table (no two rows can share one). An **FK** (Foreign Key) is a field in one table that points
  to a PK in another table, linking related records together (e.g. a transaction pointing to its
  category). An **index** is an extra, behind-the-scenes structure the database maintains so that
  looking things up by a particular field (or combination of fields) is fast even with lots of
  rows — instead of the database having to scan every single row, it can jump straight to the
  matches; "`occurredAt` desc" means an index sorted with the most recent date first ("desc" =
  descending), since that's how transactions are almost always displayed. **FTS5** (Full-Text
  Search, version 5) is a special SQLite feature/extension for fast free-text searching across
  text fields (like a note or description) — much faster than a plain scan-every-row text search.
  A **virtual table** is FTS5's way of exposing that search index as if it were an ordinary
  table you can query. A **sync trigger** is a small piece of database logic that automatically
  keeps the FTS5 search table up to date whenever the real underlying data changes (so the search
  index never goes stale). A **KV table** (Key-Value table) is a simple table of `key → value`
  pairs used to store miscellaneous small settings, the way a global settings dictionary would.
- **Migrations:** `drizzle-kit` generate, migrations bundled, run-on-launch, failure handling,
  and how the background task behaves when a migration is pending (run it, or defer and skip the
  write). (See D19 above for what a migration is. "Bundled" means the migration files ship inside
  the app package itself. "Run-on-launch" means migrations execute automatically the moment the
  app starts, before anything else needs the database. "Failure handling" covers what the app
  should do if a migration errors out partway. "Pending" means a migration is due to run but
  hasn't yet — the plan decides whether the background SMS task should run it itself, or instead
  wait/skip its write until the main app has had a chance to migrate.)
- **Seed data:** the 9 default categories (icon, order, protected flags) + the Uncategorized
  system row; the curated SMS sender-pattern seed set. (**Seed data** is starter/default data
  that's pre-loaded into the database the first time the app runs, rather than the user having to
  create it themselves — here, the 9 built-in spending categories, a protected "Uncategorized"
  fallback category that can't be deleted, and a hand-picked ("curated") starting list of known
  bank/UPI SMS sender name patterns the parser recognizes out of the box.)
- **Repository API:** per entity, the method list with signatures and the screen/feature each
  query backs; the live-query hooks; which write paths are reachable from the background task.
  **Plain-English:** a **repository** is the data-access layer — the one dedicated layer of code
  whose job is talking to the database on behalf of the rest of the app, so no other part of the
  app writes raw database queries directly (screens just call repository methods like
  "getTransactionsForMonth()"). An **API** here means the set of functions/methods this
  repository layer exposes for other code to call. A **method signature** is the formal
  description of a function — its name, what parameters it takes, and what it returns. A
  **live-query hook** is a React "hook" (a reusable piece of logic a component can plug into)
  that wraps one of Drizzle's live/reactive queries so a screen's UI updates automatically when
  the underlying data changes. "Write paths reachable from the background task" means: of all
  the ways data can get written to the database, which specific ones can be triggered by the
  headless background SMS task (as opposed to only being reachable from the normal, on-screen
  app).
- **Application state:** SQLite-derived vs Zustand-ephemeral vs persisted prefs
  (`onboardingDone`, `bannerDismissed`, category-order override, `crashReportingEnabled`);
  how a background write reaches an open screen (live query re-emits). **Plain-English:**
  "application state" is the umbrella term for all the data the running app is currently holding,
  and this bullet sorts it into three buckets: data that lives in and comes from SQLite (the
  permanent database); short-lived, in-memory-only data managed by Zustand (see the stack table
  above); and small persisted preferences (settings that need to survive an app restart, like
  whether onboarding is finished, or whether a dismissible banner should stay hidden, but that
  aren't really "financial data" worth a full database table). "How a background write reaches an
  open screen" describes the mechanism by which, if the background SMS task silently saves a new
  Suggestion while the user already has the app open on some screen, that screen's UI updates to
  show it — via the live query "re-emitting" (automatically pushing out its updated result) the
  moment the underlying table changes.

**Open sub-questions**

- Undo (§6.7, P-3): soft-delete (`deletedAt`) on `Transaction` + a purge on next launch — confirm,
  and confirm `Suggestion` dismiss is a plain hard-delete. **Plain-English:** a **soft delete** is
  when "deleting" a record doesn't actually erase it from the database — it just stamps it with a
  `deletedAt` timestamp and the app's normal queries treat it as gone, while the raw data is still
  physically there and can be brought back (this is what makes an "Undo" button possible after
  deleting a transaction). A **purge** is the later, permanent, un-undoable removal of those
  soft-deleted rows — done here on the next app launch, once undo is no longer possible/relevant.
  A **hard delete**, by contrast, removes the row from the database immediately and permanently,
  with no undo — that's how dismissing a Suggestion (an unconfirmed transaction the app detected)
  is planned to work, since there's no undo requirement for that action.
- Confirm **no float** anywhere in the money pipeline — INTEGER paise from parse to display. (A
  **float** — floating-point number — is the standard way computers represent decimal numbers,
  but it can introduce tiny rounding errors, which is unacceptable for money; see the "integer
  paise" explanation above. This checks that rule is honored at every single step, from the SMS
  parser all the way to what's rendered on screen.)
- Verify FTS5 is in the `expo-sqlite` build; fallback is a normalized search column + `LIKE`. (In
  case the FTS5 search feature described above turns out not to be available in this project's
  build of `expo-sqlite`, the backup plan is a plain text column with the searchable text
  cleaned/standardized — "normalized" — plus SQL's basic `LIKE` operator for simple, if slower,
  text matching.)

---

### Phase 3 — Business logic
**Produces:** §23 SMS parsing · §24 Account normalization · §25 Categorization ·
§26 Analytics computation · §27 Formatting / time / undo / running balance.

> **Plain-English:** "business logic" is the term for the rules and calculations that encode
> what the app is actually *for* — as opposed to how it's stored (Phase 2) or how it's drawn on
> screen (Phase 4). This is the phase that plans out the "brains" of the app: how it reads a text
> message and figures out it's a payment, how it guesses a category, and how it crunches the
> numbers for the analytics screens.

- **Parser:** sender allowlist (format + seed); the "is this a transaction SMS" gate; per-field
  extractors as declarative rules — amount (Indian grouping + paise), direction (keyword sets),
  counterparty (VPA / "to X" / "at X"), method hints (UPI / card / IMPS·NEFT·RTGS → Bank
  transfer / wallet names → Wallet); explicit ignore rules (OTP, promo, balance-only,
  collect / request money, foreign currency). Output = a `ParseResult` (fields + which parsed).
  **No confidence score.** **Plain-English, term by term:** the **parser** is the piece of logic
  that reads a raw incoming SMS text and extracts structured information from it (amount, who it
  was paid to, etc). An **allowlist** ("sender allowlist") is a list of the only sender IDs/names
  that are trusted enough to even attempt parsing (as opposed to a "blocklist," which would list
  senders to reject) — "format + seed" means the list is defined partly by matching a pattern/
  shape and partly by a starting pre-loaded list. A "gate" is a first pass/check that decides
  whether to bother processing a message at all — is this even a transaction-related SMS, or
  clearly something else (spam, OTP, etc)? An **extractor** is a small piece of logic that pulls
  one specific field (like the amount) out of the message text. "Declarative rules" means these
  extractors are written as data describing *what* pattern to match, rather than as a long
  step-by-step procedural recipe for *how* to find it — easier to read, review, and extend.
  "Indian grouping" refers to the Indian numbering convention for writing large numbers (e.g.
  `1,00,000` instead of the Western `100,000`), which the amount extractor must understand.
  "Direction" (a "keyword set") means figuring out whether money moved out (debit/expense) or in
  (credit/income) based on which keywords appear (like "debited" vs "credited"). A
  **counterparty** is the other party in the transaction — the person/merchant paid or paid by —
  detected here via a **VPA** (Virtual Payment Address, the `name@bank` style ID used for UPI
  payments — UPI is India's Unified Payments Interface, the standard instant bank-transfer
  system), or via phrase patterns like "to X" / "at X" in the message. "Method hints" are clues
  in the text about how the payment was made — UPI, card, or bank-transfer codes like IMPS/NEFT/
  RTGS (all interbank transfer systems in India), or named wallet apps. "Ignore rules" list
  categories of message the parser should deliberately skip and not treat as a transaction —
  one-time-password (OTP) codes, promotional texts, messages that just state an account balance
  without describing a new transaction, "collect/request money" requests (which aren't
  completed payments yet), and transactions in a foreign currency (out of scope for V1). The
  parser's output, a **`ParseResult`**, is a structured bundle recording every field it managed
  to extract plus which ones it succeeded at — deliberately with **no confidence score** (no
  numeric "how sure am I" percentage attached; the design instead is a simple binary "did we
  parse each field or not").
- **Test corpus plan:** a fixtures file of anonymised real-shape SMS → expected `ParseResult`;
  target coverage (major banks + UPI apps). This is the spec's primary unit-test asset.
  **Plain-English:** a **test corpus** is a curated collection of example inputs used to check
  that code behaves correctly. A **fixtures file** is the actual file holding those example
  inputs (here, realistic-looking but "anonymised" — with any real personal detail scrubbed out —
  SMS texts) paired with the exact `ParseResult` the parser is expected to produce for each one;
  automated tests then run the real parser against every example and check the output matches.
  "Target coverage" states the goal for how broad this example set should be — spanning messages
  from major Indian banks and UPI apps, not just one.
- **Normalization:** the exact algorithm (lower-case; strip punctuation / `*` / trailing
  reference-order digits; collapse whitespace) with a worked input→key table including the
  near-miss cases from §8. **Plain-English:** **normalization** is the process of taking messy,
  inconsistently-formatted text (like a merchant/counterparty name that might appear slightly
  differently in every SMS) and reducing it to one clean, consistent form (a "key") so the app can
  reliably recognize "this is the same account/merchant as before" — the exact steps here are:
  make everything lower-case, strip out punctuation and asterisks and trailing digits that are
  just a transaction reference number (not part of the actual name), and collapse repeated
  spaces down to one. A "worked input→key table" is a concrete example table showing sample raw
  inputs next to the normalized key each one produces, including tricky "near-miss" cases
  (inputs that look almost — but not quite — the same, and need to be handled carefully so they
  don't wrongly get merged or wrongly get treated as different).
- **Categorization:** exact-key `AccountRule` lookup; upsert on save/edit (`hitCount++`,
  `lastNote`, `lastPaymentMethod`, `categoryId` when not Uncategorized, `updatedAt`);
  last-write-wins; a cleared note clears `lastNote`. Nothing fuzzy, no ML. **Plain-English:**
  **categorization** is the process of automatically assigning a spending category (like "Food"
  or "Transport") to a detected transaction. An `AccountRule` is a saved record that says "any
  transaction from this normalized counterparty key should get this category" — built up over
  time from the user's own past choices. "Exact-key lookup" means the app matches on the *exact*
  normalized key, with no fuzzy/approximate matching. **Upsert** is a common database term
  meaning "update the row if it already exists, otherwise insert a new one" (a portmanteau of
  "update" + "insert") — done here every time the user saves or edits a transaction, incrementing
  a hit counter (`hitCount++`, tracking how many times this rule has matched) and remembering the
  most recent note and payment method used, plus the chosen category (unless it was left as the
  generic "Uncategorized"), and updating a last-modified timestamp. "Last-write-wins" is the
  conflict rule for what happens if the same rule gets upserted from two different edits — simply,
  whichever edit happened most recently overwrites the rest. "Nothing fuzzy, no ML" emphasizes
  there's no approximate string-matching and no machine learning / AI model involved anywhere in
  this — it's simple, deterministic, exact-match rule lookups only.
- **Analytics:** for every F9 metric, the exact computation and where it runs (SQL vs JS) —
  Spent / Income, Balance, savings rate (guard Income = 0), by-category (Uncategorized included,
  share of spend), largest (top 5), daily series (per local day, zero-filled), mean (Spent ÷
  days; days-elapsed for the current month), **median** (of the daily series, in JS), MoM deltas,
  the "This month" arc fill = Balance ÷ Income clamped [0,1], and the "Day by day" outlier
  scaling rule. Same set for the **Week** period (D14) — ISO-week boundaries. **Plain-English,
  term by term:** "F9" is the feature-number ID for the app's analytics feature, referenced from
  elsewhere in the spec set — each of its "metrics" (the specific numbers/charts it shows) needs
  its calculation spelled out exactly, and whether that calculation happens as a SQL database
  query or as plain JavaScript code after fetching the raw rows. "Savings rate" is
  (Income − Spent) ÷ Income as a percentage — "guard Income = 0" means the calculation must
  specially handle the case of zero income to avoid a divide-by-zero error/crash. "By-category"
  breaks total spending down per category, explicitly including the catch-all "Uncategorized"
  bucket, and computing each category's share (percentage) of total spending. "Largest (top 5)"
  is simply the five biggest individual transactions in the period. A "daily series" is spending
  broken into one number per calendar day across the period; "zero-filled" means days with no
  transactions still get an explicit `0` entry rather than being missing, so charts don't have
  gaps; "per local day" means using the phone's own local timezone/calendar day boundaries, not
  UTC. **Mean** is the everyday average (total spent ÷ number of days — using the number of days
  *elapsed so far* if the period is the still-ongoing current month, not the full month length).
  **Median** is the middle value of the daily series when sorted — a different kind of average
  that's less skewed by one or two unusually large days, calculated in JS rather than SQL. **MoM**
  stands for Month-over-Month — how a metric changed compared to the previous month (a
  **delta** is the technical/math term for "the difference/change" between two values). The
  "This month" arc fill describes a gauge-style chart element whose fill amount is Balance ÷
  Income, mathematically clamped to the range [0, 1] — "**clamped**" means forcibly capped so the
  value can never go below 0 or above 1, even if the raw math would produce something outside
  that range (e.g. negative balance). The "outlier scaling rule" is a special adjustment for the
  daily bar chart so that one exceptionally large day's spending doesn't visually flatten all the
  other, smaller bars into invisibility. All of this same list of calculations also needs to be
  defined for the **Week** period, decision D14 above, using ISO-week boundaries (see the D14
  explanation earlier for what "ISO-week" means).
- **Cross-cutting:** money formatter (`₹` prefix, Indian grouping, always-present sign, thin
  space, paise only when non-zero); relative-vs-absolute dates (V-2); local calendar-day
  boundary helper; month/week period math; the Undo mechanism (soft-delete window, timer,
  restore, purge); the all-time running balance (Σ income − Σ expense, may be negative).
  **Plain-English:** "cross-cutting" concerns are small pieces of shared logic used all over the
  app rather than belonging to one specific feature. The money formatter turns a raw paise
  integer into the actual display string the user sees — with a `₹` symbol, Indian-style digit
  grouping (see the parser section above), always showing a `+`/`−` sign, a subtle "thin space"
  character for visual spacing, and only showing paise digits when they're non-zero (e.g. `₹50`
  rather than `₹50.00`). "Relative-vs-absolute dates" (cross-referencing UX-requirement V-2)
  means deciding when to show a date as relative ("2 days ago") versus an absolute calendar date
  ("14 Sep"). A "local calendar-day boundary helper" is shared utility code that consistently
  answers "what day does this timestamp fall on, in the phone's local time" — needed by several
  features (like the zero-filled daily series above). "Month/week period math" is shared logic
  for computing the start/end of a given month or week. The **Undo mechanism** ties back to the
  soft-delete idea from Phase 2 — it needs a defined time window during which undo is possible, a
  timer that counts that window down, the actual "restore" action that un-deletes the row, and
  the later "purge" that permanently removes it once the window has passed. The Σ symbol (sigma)
  is mathematical notation for "sum of" — so "the all-time running balance = Σ income − Σ
  expense" means: add up every income transaction ever recorded, subtract the sum of every
  expense transaction ever recorded; this running total is explicitly allowed to go negative.

**Open sub-questions**

- **Week comparison target (D14):** does the "Mean / Median" tile comparison read "vs last week"
  in Week mode, or stay "vs last month" always? This touches `SPEC-UI-UX.md` §6.10 — flag to the
  user; default proposal is a generic "vs previous period". (A "tile" is one of the small
  summary-stat boxes shown on the analytics screen.)
- Parser rule format: pure extractor functions vs a data table of regexes + a small interpreter
  — lean hybrid (data for senders + keywords, code for assembly). **Plain-English:** a **regex**
  (regular expression) is a compact pattern-matching syntax used to search for and extract text
  matching a particular shape (e.g. "a rupee amount followed by digits"). This question is
  choosing between writing the parser as plain hand-written extractor functions in code, versus
  driving it from a table of regex patterns read by a small generic "interpreter" (a piece of
  code that reads that data table and carries out the matching described in it) — the leaning is
  a hybrid: the raw sender names and keyword lists live as plain data, while the logic that
  assembles the final result from matches is regular code.
- How much sender/keyword seed to ship vs learn — V1 ships a curated seed; expansion is Future.

---

### Phase 4 — Navigation, components, screen wiring
**Produces:** §28 Navigation · §29 Component architecture + `theme.ts` rewrite · §30 Screen specs
(data + state binding). *May split into 4a (nav + theme + sheet system) and 4b (component
contracts + screen wiring) if it runs long.*

> **Plain-English:** this phase plans the *visual/interactive* layer — the actual screens,
> reusable UI building blocks ("components"), and how the user moves between screens
> ("navigation"). **Component architecture** means how the UI is broken down into reusable,
> named pieces (buttons, cards, list rows, etc.) that get combined to build every screen, rather
> than writing every screen's UI from scratch each time.

- **Route tree:** the `(tabs)` group, each tab file, the pushed pages (Review Queue, Details,
  Categories, Settings + 6 subpages), and the sheet layer. Decide + spec how `@gorhom` sheets
  are mounted once at root and invoked imperatively from anywhere (a sheet registry/context) vs
  expo-router modal routes. **Plain-English:** "the `(tabs)` group" is the folder in the route
  tree (see Phase 1) that defines the app's main bottom-tab screens. A "pushed page" is a screen
  that slides in on top of the current one when navigated to (as opposed to a tab you switch
  between) — here that's the Review Queue (where pending detected transactions are confirmed),
  a transaction Details page, a Categories management page, and Settings plus its six subpages.
  The "sheet layer" refers to the bottom-sheet popups (see the stack table above) sitting on top
  of everything else. "Mounted once at root" means the sheet components are created a single
  time at the very top of the app (rather than fresh each time), and then "invoked imperatively"
  — meaning any part of the code can just call a function like `openSheet('addTransaction')` to
  make one appear, instead of it being tied to a specific navigation route. A **registry** (or
  **context**, a React mechanism for sharing a piece of state/functionality across the whole
  app without passing it down manually through every component) is the shared place that keeps
  track of, and lets any component trigger, these globally-available sheets. The alternative
  being weighed is using expo-router's own "modal routes" feature instead.
- **Deep links:** `coinflow://` routes for notification taps — single suggestion → Confirmation
  sheet; group → Review Queue; stale/confirmed → Details; dismissed/deleted → Home. Cold-start
  deep-link handling. **Plain-English:** a **deep link** is a special URL-like address (here,
  ones starting with the app's own custom `coinflow://` scheme) that, when opened, takes the user
  directly to a specific screen/state inside the app — used here so that tapping a notification
  jumps straight to the relevant screen: a single detected transaction opens its confirmation
  sheet directly, several at once open the Review Queue list, one that's already stale/expired or
  already confirmed opens its Details page, and one that was dismissed/deleted just falls back to
  the Home screen. "Cold-start deep-link handling" covers the trickier case where the app wasn't
  running at all when the notification was tapped, so it has to launch fresh *and* immediately
  navigate to the right place, rather than just switching screens in an already-running app.
- **`theme.ts` rewrite (§3.7):** the §3.1 token ramp, the radial ground, `Fonts` (Manrope /
  Geist + system fallback), the Lucide wrapper (`strokeWidth 1.6`), `ThemedText` type roles from
  §3.2, `ThemedView` surfaces, the expanded `ThemeColor` union. **Plain-English:** `theme.ts` is
  the single file holding the app's design tokens (see `CLAUDE.md`'s Theming section — the
  shared source of truth for colors, spacing, and fonts used everywhere, instead of scattering
  raw hex codes/numbers throughout the codebase). A "token ramp" is a graduated scale of related
  values (e.g. a set of grays from lightest to darkest) defined once and reused. "Radial ground"
  refers to a specific background visual treatment (a radial-gradient backdrop) defined in the
  design spec. The **Lucide wrapper** is a thin custom component wrapping the Lucide icon
  library so every icon in the app consistently uses the same stroke thickness (`strokeWidth
  1.6`) without every call site having to repeat that setting. `ThemedText`/`ThemedView` are the
  app's base text/surface components (mentioned in `CLAUDE.md`) that automatically apply the
  correct theme colors/fonts — "type roles" are the named text-style variants they support (like
  "heading" or "caption"), and "surfaces" are the named background-style variants. A
  `ThemeColor` **union** (a TypeScript term for "one of several allowed named options") is the
  full list of valid color-token names the rest of the code is allowed to reference.
- **Component catalog:** §3.6's ~45 components → files under `src/ui` and `src/features/*`, each
  with a prop contract; full signatures for the reused primitives (Button, Card, Sheet,
  KeypadSheet, AmountInput, NumericKeypad, SegmentedControl, SelectorRow, TextField, Chip,
  StatTile, TransactionCard, DayGroupHeader, the Analytics chart trio, ConfirmDialog,
  UndoSnackbar, PermissionBanner, EmptyState, Skeleton, ErrorState, AccountAutocomplete,
  CategoryPickerSheet, FilterBlocks, …). **Plain-English:** a **component catalog** is the full
  inventory list of every distinct, reusable UI piece the design calls for (about 45 of them),
  each one mapped to the actual source file it will live in. A **prop contract** ("props" =
  properties passed into a component) is the formal specification of what inputs a component
  accepts and what it does with them — similar to a function signature, but for a UI component.
  "Primitives" here means the most basic, most-reused building-block components (buttons, cards,
  text fields, etc.) that everything else is built from — these get their full detailed
  signatures written out because so much else depends on them.
- **Per-screen wiring:** for each of the ~24 screens — the repo queries it reads, the stores it
  touches, its V-3 states (skeleton shape / empty copy + CTA / error), the `UI-0xx` + `IMP-0xx`
  it satisfies, nav in/out. **Plain-English:** "wiring" a screen means connecting its visual
  layout to real, live data and behavior — which repository queries (see Phase 2) it reads data
  from, which Zustand stores it reads/writes ephemeral state to, and its "V-3 states" (a
  UX-spec convention covering the three states any data-driven screen can be in: a loading
  **skeleton** — a gray placeholder shape shown while data is still loading — an **empty state**
  with explanatory copy and a call-to-action (**CTA**, a button/prompt nudging the user toward an
  action) when there's genuinely no data yet, and an **error state** if something went wrong).
  Each screen is also mapped to exactly which UX requirements (`UI-0xx`) and implementation
  requirements (`IMP-0xx`) it fulfills, plus how the user navigates into and out of it.

**Open sub-questions**

- Sheet system: full `@gorhom` + a custom registry, vs expo-router native modals with `@gorhom`
  only for the keypad sheet. The docked-keypad behaviour (§6.4) probably forces full `@gorhom` —
  confirm.
- `NativeTabs` (`expo-router/unstable-native-tabs`) vs a custom tab bar for the raised centre
  **Add** "FAB notch" (§8 flags a native-tabs constraint). iOS is Future, so a custom bar is
  likely — decide. **Plain-English:** `NativeTabs` is an experimental (hence "unstable") Expo
  Router feature that renders the bottom tab bar using the phone's own native OS tab-bar
  component instead of a custom-drawn one. A **FAB** (Floating Action Button) is the common
  mobile-UI pattern of a prominent, usually circular button that floats above the rest of the
  layout for the app's primary action — here it's raised up out of, and cuts a "notch" into, the
  tab bar itself for the central "Add transaction" button, a visual effect the built-in
  `NativeTabs` component isn't flexible enough to produce, which is why a fully custom-built tab
  bar (`CoinFlowTabBar`, per `CLAUDE.md`) is the likely choice instead.
- Reduce-Motion plumbing: one hook vs per-component checks. (**Reduce Motion** is an accessibility
  setting — found on both Android and iOS — that a user turns on to minimize or disable
  animations, e.g. for motion sensitivity. "Plumbing" means the underlying wiring/mechanism for
  checking and respecting that setting throughout the app; the question is whether to centralize
  that check in one shared hook that every animated component uses, or have each component check
  it individually.)

---

### Phase 5 — Notifications, errors, security, testing, release; freeze
**Produces:** §31 Notifications · §32 Error handling · §33 Security & privacy · §34 Testing
strategy · §35 Build & release. **Ends by freezing `SPEC-implementation.md`.** ("Freezing" a
spec means formally declaring it finished/final and not to be casually changed further — future
changes would need to go through the formal change-request process instead.)

- **Notifications:** `expo-notifications` channel(s); notification categories with the
  Save / Add / Discard actions; the known-vs-new-account action-set switch; the background
  response handler (`TaskManager`) that writes from the rule while killed; group/summary for 2+;
  stale-tap routing; permission-off = silent (queue + badge only); restore-after-reboot
  (re-post from persisted Suggestions). Reconcile with D18's headless task. **Plain-English,
  term by term:** a **notification channel** is an Android grouping mechanism that lets a user
  control notification behavior (sound, importance) per category of notification from an app.
  "Notification categories with actions" means the notification itself has tappable buttons
  built in (Save / Add / Discard) without even opening the app. The "known-vs-new-account
  action-set switch" means the buttons shown can differ depending on whether the detected
  transaction's counterparty already has a saved `AccountRule` (known) or not (new — where maybe
  a category needs picking first). The "background response handler" is the code (registered via
  `TaskManager`, see D18 above) that runs when the user taps one of those notification buttons
  while the app is fully closed — writing the transaction straight from the matched rule without
  needing to open the app UI. "Group/summary for 2+" describes Android's notification-grouping
  feature: when 2 or more detected transactions are pending at once, they're collapsed into one
  grouped notification with a summary line instead of flooding the notification tray individually.
  "Stale-tap routing" is what happens if the user taps a notification for a transaction that's no
  longer actionable (e.g. already confirmed or expired) — see the "Deep links" bullet in Phase 4
  above for where each case routes to. "Permission-off = silent" means if the user has denied
  Android's notification permission, detected transactions are still saved quietly in the
  background (queued) and shown via an in-app badge count, just without any pop-up notification.
  "Restore-after-reboot" covers what happens when the phone restarts — Android normally clears
  pending notifications, so this re-creates ("re-posts") them from the Suggestion records that
  are still safely stored in the database.
- **Error-handling matrix:** every failure mode (receiver exception, parse throw, DB write fail,
  migration fail, notification post fail, permission denied / permanently-denied, corrupt DB,
  export write fail) → user-facing behaviour (P-4 actionable) → logging policy (**no financial
  data, no SMS body in logs**; dev-only verbose). The receiver/task must never crash the app.
  **Plain-English:** an **error-handling matrix** is a table systematically listing every way
  something could go wrong ("failure mode") down one side, and for each one, exactly what the
  app should visibly do about it and exactly what gets written to its internal logs. "Receiver
  exception" is an unexpected error thrown inside the native broadcast receiver (see D18) itself.
  "Parse throw" is an error thrown while the SMS parser is trying to read a message. "DB write
  fail" / "migration fail" are self-explanatory database-layer failures. "Permission denied /
  permanently-denied" distinguishes a user saying "no" once (askable again later) from Android's
  "don't ask again" permanent denial. "Corrupt DB" is the rare case where the SQLite file itself
  becomes unreadable/damaged. "Export write fail" is when saving a JSON/CSV export file fails.
  "P-4 actionable" cross-references a product principle (P-4) requiring that whatever the user
  sees when something fails must give them something concrete they can actually *do* about it,
  not just a vague "something went wrong." The logging policy is strict: logs must never contain
  financial figures or the actual SMS text content, and any more detailed/verbose logging only
  happens in development builds, never in what ships to the user. The very last sentence is a
  hard requirement: no matter what error occurs inside the SMS receiver or background task, it
  must be caught and handled gracefully — it can never be allowed to crash the whole app.
- **Security & privacy:** storage location + `allowBackup=false`; the no-network assertion and
  how it's verified; the export share-sheet flow; the **P-9 amendment** for crash reporting
  (Sentry config: `beforeSend` scrub, no breadcrumbs on financial screens, no PII, Settings
  opt-out, and the default — decide on-with-opt-out vs opt-in); R8 / ProGuard for release; the
  exact allowed crash payload. **Plain-English, term by term:** see D21 above for
  `allowBackup=false`, breadcrumbs, and PII. The "no-network assertion" is the claim that the app
  never makes internet calls — "how it's verified" means the plan must describe how to actually
  prove/test that claim (e.g. checking no networking code exists, or monitoring network traffic
  during testing) rather than just asserting it. The "export share-sheet flow" is how a user
  actually gets their exported JSON/CSV file off the phone — using Android's built-in "share"
  system dialog (letting them send it to email, cloud storage, etc.). The **P-9 amendment** means
  product-principle P-9 (presumably a strict "no third-party data sharing" privacy principle) is
  being formally adjusted to carve out an exception specifically for scrubbed crash reports. In
  Sentry's configuration, `beforeSend` is a hook function that runs on every crash report right
  before it's sent, letting the app scrub/strip out anything sensitive first. **R8** and
  **ProGuard** are Android build-time tools that shrink, optimize, and obfuscate (scramble
  the naming of) an app's compiled code for its release build — making the shipped APK smaller
  and harder to reverse-engineer. The "crash payload" is the actual bundle of data a crash report
  sends — the plan needs to nail down precisely what is and isn't allowed in it.
- **Testing strategy:** Jest units (the parser corpus is the centrepiece; the normalization
  table; analytics math; formatter; period math; undo); RNTL for the V-3 states per screen;
  Maestro flows for J2 (core loop), J4 (manual add), J9 (delete/undo); the
  `IMP-0xx → test-id → status` matrix; a minimal CI note (typecheck + lint + jest).
  **Plain-English:** "Jest units" are the individual unit tests (see the stack table above)
  covering the app's core logic — with the SMS-parser test corpus (Phase 3) as the single most
  important one, alongside tests for the normalization table, the analytics math, the money
  formatter, month/week period math, and the undo mechanism. **RNTL** is shorthand for
  `@testing-library/react-native` (see the stack table) — used here specifically to test that
  each screen correctly shows its three V-3 states (skeleton/empty/error, see Phase 4). "Maestro
  flows" are full end-to-end tests (see the stack table) covering specific real user journeys
  identified elsewhere in the spec by their journey IDs: J2 (the "core loop" — the main everyday
  usage cycle), J4 (adding a transaction manually), and J9 (deleting one and undoing that
  delete). The `IMP-0xx → test-id → status` matrix is a tracking table mapping every
  implementation requirement to the specific test that verifies it and whether that test is
  passing. **CI** stands for Continuous Integration — automated checks (here: type-checking,
  linting, and running the Jest tests) that run automatically, e.g. whenever code is pushed, to
  catch problems early.
- **Build & release:** EAS profiles (dev client already; `preview` internal APK; `production`);
  `app.json` changes (Android permissions, the SMS config plugin, package name,
  `allowBackup=false`); the direct-install / EAS internal-distribution workflow; versioning
  (remote `appVersionSource`); the `reset-project` caveat. **Plain-English:** an **EAS profile**
  (see D20 above for what EAS is) is a named configuration describing how to build the app for a
  particular purpose — here, a `dev client` profile (already set up, for development), a
  `preview` profile producing an internally-shareable APK for testing, and a `production` profile
  for the real release build. `app.json` is Expo's main project-configuration file — this bullet
  lists what needs to be set there: the Android permissions the app requests, the SMS config
  plugin (see the stack table), the app's unique package name/identifier, and the
  `allowBackup=false` privacy setting (see D21). The "direct-install / EAS internal-distribution
  workflow" is the concrete step-by-step process for getting a built APK onto a real phone (see
  D20). "Versioning" concerns how the app's version number is tracked and incremented — a remote
  `appVersionSource` means Expo's cloud service (rather than the local `app.json` file) is the
  authoritative source for the current build number. The `reset-project` caveat is a warning
  related to the `npm run reset-project` command mentioned in `CLAUDE.md`, which is destructive
  (it wipes and rescaffolds the app's source) and needs a documented warning about that.
- **Freeze:** run `SPEC/PLAN.md` §11 against both specs; mark `SPEC-implementation.md` frozen.

**Open sub-questions**

- Crash-reporting default: on with a Settings opt-out (useful, less private) vs opt-in (private,
  rarely enabled) — flag to the user. ("Opt-out" means the feature starts turned on for everyone,
  and a user has to actively find the setting to disable it; "opt-in" means it starts off, and a
  user has to actively enable it — opt-in is more private but far fewer people end up turning it
  on, meaning far less crash data actually reaches the developers.)
- Final crash SDK: Sentry vs a lighter option (GlitchTip / Bugsnag / minimal). (These are all
  competing crash-reporting services/products, similar in purpose to Sentry — see the stack
  table above.)
- Maestro vs Detox for the one E2E flow — Maestro recommended (lighter).

---

## 3. Progress

This table is the tracker for which phases have actually been finished, and exactly which spec
sections and decisions each one produced (it's kept up to date as each phase completes, per the
"tick the phase off" instruction in §4 below).

| Phase | Status |
|---|---|
| 0 — Planning & decisions | **Done** |
| 1 — Foundations | **Done** — `SPEC-implementation.md` §16–§18; decisions D22–D25 added |
| 2 — Data & persistence | **Done** — `SPEC-implementation.md` §19–§22; decisions D26–D28 added |
| 3 — Business logic | **Done** — `SPEC-implementation.md` §23–§27; decisions D29–D31; CR-1 on `SPEC-UI-UX.md` §6.10 |
| 4 — Navigation, components, wiring | **Done** — `SPEC-implementation.md` §28–§30; decisions D32–D33 (done in one pass, not split 4a/4b) |
| 5 — Notifications, errors, security, testing, release | **Done** — `SPEC-implementation.md` §31–§35; decisions D34–D35; §36 final-review pass. **`SPEC-implementation.md` FROZEN (v1, 2026-09-01).** |

**All phases complete.** Next track: feature implementation (`SPEC/PLAN.md` §9) — separate from this plan.

## 4. How to run a phase

This is the repeatable checklist for actually working through one phase of this plan (used for
all five phases above, now all completed):

1. Re-read this file's phase section + the frozen-spec sections it names.
2. Resolve that phase's open sub-questions with the user first.
3. Write the `SPEC-implementation.md` sections.
4. Update §1 (Decisions log) if anything shifted; tick the phase off in §3 above.

## 5. Explicitly out of scope for this plan

("Out of scope" means these are things this plan deliberately does *not* cover — either because
they belong to a different, later stage of work, or because they're frozen and off-limits, or
because they're deferred to a future version of the app.)

- Feature implementation (`SPEC/PLAN.md` §9) — a separate track after Phase 5.
- V1.5 split expenses, iOS, cloud sync, budgets, historical SMS import — Future
  (`SPEC-implementation.md` §14). ("V1.5" denotes a planned future version after the initial V1
  release; "Future" throughout this document is the standard label for something intentionally
  deferred past V1, not abandoned.)
- Any change to `SPEC-UI-UX.md` — frozen; a conflict is a change-request (`SPEC/PLAN.md` §10).
