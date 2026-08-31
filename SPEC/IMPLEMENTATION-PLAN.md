# CoinFlow — Implementation Spec: Build Plan

> **What this is.** The meta-plan for producing the *technical half* of
> `SPEC-implementation.md` (everything `SPEC/PLAN.md` §8 calls for and the current draft
> doesn't have yet). This planning pass is **Phase 0** and is done. Phases 1–5 each land a
> coherent slice of the spec and are each sized to about half a working session — run them one
> at a time.
>
> **Frozen inputs, do not reopen here:** `SPEC/idea.md` (product scope), `SPEC-UI-UX.md`
> (visual + screen spec, v1 frozen), `SPEC-implementation.md` §1–§15 (product / behavior).
> A conflict with any of those is a change-request per `SPEC/PLAN.md` §10, not a quiet fix.
>
> **After Phase 5:** feature implementation (`SPEC/PLAN.md` §9) is a separate track — one
> feature at a time, with `UI-0xx → IMP-0xx → component → test` traceability.

---

## 0. Decisions locked in Phase 0

These are copied into `SPEC-implementation.md` §1 (Decisions log) as D14–D21 and resolve most of
its §15 open questions.

### Product scope

| # | Decision | Notes |
|---|---|---|
| **D14** | **Analytics period: Month *and* Week both ship in V1.** | Confirms D11. Week reuses the month aggregation code; Phase 3 specs ISO-week boundaries and decides whether the comparison line reads "vs last week" or a generic "vs previous period". Resolves §15 Q5. |
| **D15** | **No "exclude from totals" toggle in V1.** Deferred to a later version. | V1 accepts the P-8 inaccuracy (self-transfers count as spending). The model keeps `type` so real Transfer/Refund types land later with no migration. Resolves §15 Q1 / Q6 (toggle part). |
| **D16** | **Settings › Account rules screen ships in V1** with read + edit + delete. | It's the only window into why auto-categorisation behaves as it does. Lowest priority — build it last. Resolves §15 Q3. |
| **D17** | **Export = JSON full backup + CSV transactions.** JSON carries transactions + custom categories + account rules; CSV is transactions only, for spreadsheets. **No import / restore in V1** (Future). | Resolves §15 Q4. |

### Architecture

| # | Decision | Notes |
|---|---|---|
| **D18** | **SMS pipeline: JS-owned, thin native bridge.** A small local Expo module (Kotlin) registers the SMS broadcast receiver and forwards incoming messages to a headless JS / TaskManager task; **all** parsing, DB writes, notification posting and notification-action handling live in JS/TS. | One testable codebase for parsing. **Contingency (documented in Phase 1, not built):** a hybrid where native posts the notification immediately for cold-start latency / OEM-battery-killer resilience — adopt only if field testing shows dropped events. |
| **D19** | **Persistence: `expo-sqlite` + Drizzle ORM.** Typed schema, generated migrations, live/reactive queries; raw SQL still available for analytics aggregation. On-device only (D10). | Rejected: hand-written SQL (boilerplate, manual migrations); WatermelonDB (heavy, unused sync engine). |
| **D20** | **Distribution: direct install.** EAS-built APK, side-loaded or via EAS internal distribution. **Not** the Play Store. | `READ_SMS` / `RECEIVE_SMS` are Play-restricted and expense tracking is not an approved use — Play would mean rejection or an SMS-less build. Direct install matches `idea.md`'s "creator's own everyday use case". Play Store + SMS-less fallback = Future. |
| **D21** | **Security: baseline + crash reporting only.** Baseline (always on): app-private storage, `android:allowBackup=false`, no network. **Add:** crash reporting — stack traces only, **no** breadcrumbs from financial screens, **no** transaction/SMS content, **no** PII, with a Settings opt-out. **Not in V1:** biometric / PIN app lock, SQLCipher DB encryption (both Future). | P-9 is amended for the crash-reporting carve-out. Phase 5 picks the SDK and the default (on-with-opt-out vs opt-in). |

**Still open (low stakes, parked):** §15 Q7 — duplicate handling stays manual-only for V1 (D8) unless
Phase 3's parser work surfaces a reason to revisit.

---

## 1. Chosen stack (Phase 1 pins exact versions + writes the rationale)

Runtime is fixed by the repo: **Expo SDK ~57.0.18 · React Native 0.86.3 · React 19.2 · expo-router ~57**,
TypeScript strict, `experiments.reactCompiler` + `typedRoutes` on. Per `AGENTS.md`, every library
below is **re-checked against the v57 docs in Phase 1** before it's pinned.

| Concern | Choice | Rejected / notes |
|---|---|---|
| Database | `expo-sqlite` + **Drizzle ORM** + `drizzle-kit` | D19 |
| Reactive reads | Drizzle live queries | TanStack Query unnecessary for a local DB |
| Ephemeral UI state | **Zustand** (sheet drafts, keypad buffer, filter draft, onboarding step) | Redux / Jotai overkill |
| Navigation | `expo-router` tabs/stack + **`@gorhom/bottom-sheet` v5** for every sheet | native modals can't do the docked-keypad + collapse-on-scroll + discard-confirm (§6.4, motion §3.5) |
| Long lists | **`@shopify/flash-list` v2** | 2,000+ rows (§6.7) |
| Charts | **`react-native-svg` + `d3-shape` / `d3-scale`**, hand-rolled | bespoke greyscale arc gauge, donut, dashed mean line, outlier clipping — Victory/Skia too heavy for this |
| Animation | `react-native-reanimated` v4 + `react-native-worklets` | already installed |
| Notifications | `expo-notifications` + `expo-task-manager` (background response handler) | — |
| SMS ingest | **custom local Expo module** (Kotlin) + a config plugin (manifest receiver + permissions) | D18; requires a dev client, not Expo Go |
| Fonts | `expo-font`, bundled **Manrope** + **Geist** TTFs, system-stack fallback | §3.2 |
| Dates | **`date-fns`** (tree-shakeable) | Luxon heavier; Temporal polyfill premature |
| IDs | `expo-crypto` `randomUUID()` | — |
| Crash reporting | **Sentry** (`@sentry/react-native` + Expo plugin) — scrubbed per D21 | final SDK choice confirmed in Phase 5 |
| Testing | `jest-expo` + `@testing-library/react-native` + **Maestro** (one E2E flow) | Detox heavier |
| Lint / format | `expo lint` (ESLint) + Prettier; keep the repo's organize-imports-on-save |

---

## 2. Phase breakdown

Each phase writes new numbered sections into `SPEC-implementation.md` (§16+), keeping §1–§15
intact and adding a table of contents. Each phase ends by updating §1 (Decisions log) if anything
shifted and ticking the phase off in §3 below.

### Phase 1 — Foundations: stack, architecture, project structure
**Produces:** §16 Technology Stack · §17 System Architecture · §18 Project Structure.

- Pin every dependency to a v57-compatible version; one-line rationale each; record what was
  rejected and why.
- **Architecture:** the layer diagram — native SMS bridge → headless JS task → parser →
  repository → SQLite; UI → repository / live queries → SQLite; notifications module. Then
  data-flow walkthroughs for: (a) SMS arrives while app killed, (b) user taps **Save** on the
  notification while app killed, (c) user opens the app with 5 pending, (d) manual add.
- **Background execution model:** what runs in the headless task, its time budget, behaviour if
  killed mid-run, idempotency / dedupe of the SMS→Suggestion write, cold-start vs warm.
- **Contingency design (D18):** the hybrid native-posts-notification fallback, written down but
  not built.
- **Project structure:** `src/` layout, the expo-router route tree with its group structure, the
  `.web` platform-file policy, path aliases, where the native module lives, how it's excluded
  from web.
- **Native module + config plugin plan:** what the Kotlin module exposes, `BroadcastReceiver`
  registration, which permissions the plugin injects, the dev-client requirement.

**Open sub-questions for this phase**

- `src/` layout: feature-first (`src/features/transactions/…`) vs layer-first (`src/db`,
  `src/services`, `src/ui`) — lean feature-first with shared `src/ui` + `src/lib`.
- Headless JS vs `expo-task-manager` background task vs a foreground service for the SMS handler
  — needs a v57-docs check on Android 14/15 foreground-service-type rules.
- Does "Save from notification while killed" actually need the JS runtime, or can the native
  module cache the matched `AccountRule` and write via a minimal native SQLite call? Decide here
  — it sets the module's surface area.

---

### Phase 2 — Data & persistence
**Produces:** §19 Data Models (final) · §20 Persistence & migrations · §21 Data-access layer ·
§22 Application State.

- Promote the §6 sketch to final: every entity, field, type (**integer paise everywhere**),
  nullability, enum values, defaults, timestamps.
- **Drizzle schema:** tables, PKs/FKs, indices (`occurredAt` desc; `type + occurredAt` for
  analytics; `account`/`normalizedKey` for rule lookup), an **FTS5** virtual table for search
  (note / description / account) with sync triggers, a KV/settings table.
- **Migrations:** `drizzle-kit` generate, migrations bundled, run-on-launch, failure handling,
  and how the background task behaves when a migration is pending (run it, or defer and skip the
  write).
- **Seed data:** the 9 default categories (icon, order, protected flags) + the Uncategorized
  system row; the curated SMS sender-pattern seed set.
- **Repository API:** per entity, the method list with signatures and the screen/feature each
  query backs; the live-query hooks; which write paths are reachable from the background task.
- **Application state:** SQLite-derived vs Zustand-ephemeral vs persisted prefs
  (`onboardingDone`, `bannerDismissed`, category-order override, `crashReportingEnabled`);
  how a background write reaches an open screen (live query re-emits).

**Open sub-questions**

- Undo (§6.7, P-3): soft-delete (`deletedAt`) on `Transaction` + a purge on next launch — confirm,
  and confirm `Suggestion` dismiss is a plain hard-delete.
- Confirm **no float** anywhere in the money pipeline — INTEGER paise from parse to display.
- Verify FTS5 is in the `expo-sqlite` build; fallback is a normalized search column + `LIKE`.

---

### Phase 3 — Business logic
**Produces:** §23 SMS parsing · §24 Account normalization · §25 Categorization ·
§26 Analytics computation · §27 Formatting / time / undo / running balance.

- **Parser:** sender allowlist (format + seed); the "is this a transaction SMS" gate; per-field
  extractors as declarative rules — amount (Indian grouping + paise), direction (keyword sets),
  counterparty (VPA / "to X" / "at X"), method hints (UPI / card / IMPS·NEFT·RTGS → Bank
  transfer / wallet names → Wallet); explicit ignore rules (OTP, promo, balance-only,
  collect / request money, foreign currency). Output = a `ParseResult` (fields + which parsed).
  **No confidence score.**
- **Test corpus plan:** a fixtures file of anonymised real-shape SMS → expected `ParseResult`;
  target coverage (major banks + UPI apps). This is the spec's primary unit-test asset.
- **Normalization:** the exact algorithm (lower-case; strip punctuation / `*` / trailing
  reference-order digits; collapse whitespace) with a worked input→key table including the
  near-miss cases from §8.
- **Categorization:** exact-key `AccountRule` lookup; upsert on save/edit (`hitCount++`,
  `lastNote`, `lastPaymentMethod`, `categoryId` when not Uncategorized, `updatedAt`);
  last-write-wins; a cleared note clears `lastNote`. Nothing fuzzy, no ML.
- **Analytics:** for every F9 metric, the exact computation and where it runs (SQL vs JS) —
  Spent / Income, Balance, savings rate (guard Income = 0), by-category (Uncategorized included,
  share of spend), largest (top 5), daily series (per local day, zero-filled), mean (Spent ÷
  days; days-elapsed for the current month), **median** (of the daily series, in JS), MoM deltas,
  the "This month" arc fill = Balance ÷ Income clamped [0,1], and the "Day by day" outlier
  scaling rule. Same set for the **Week** period (D14) — ISO-week boundaries.
- **Cross-cutting:** money formatter (`₹` prefix, Indian grouping, always-present sign, thin
  space, paise only when non-zero); relative-vs-absolute dates (V-2); local calendar-day
  boundary helper; month/week period math; the Undo mechanism (soft-delete window, timer,
  restore, purge); the all-time running balance (Σ income − Σ expense, may be negative).

**Open sub-questions**

- **Week comparison target (D14):** does the "Mean / Median" tile comparison read "vs last week"
  in Week mode, or stay "vs last month" always? This touches `SPEC-UI-UX.md` §6.10 — flag to the
  user; default proposal is a generic "vs previous period".
- Parser rule format: pure extractor functions vs a data table of regexes + a small interpreter
  — lean hybrid (data for senders + keywords, code for assembly).
- How much sender/keyword seed to ship vs learn — V1 ships a curated seed; expansion is Future.

---

### Phase 4 — Navigation, components, screen wiring
**Produces:** §28 Navigation · §29 Component architecture + `theme.ts` rewrite · §30 Screen specs
(data + state binding). *May split into 4a (nav + theme + sheet system) and 4b (component
contracts + screen wiring) if it runs long.*

- **Route tree:** the `(tabs)` group, each tab file, the pushed pages (Review Queue, Details,
  Categories, Settings + 6 subpages), and the sheet layer. Decide + spec how `@gorhom` sheets
  are mounted once at root and invoked imperatively from anywhere (a sheet registry/context) vs
  expo-router modal routes.
- **Deep links:** `coinflow://` routes for notification taps — single suggestion → Confirmation
  sheet; group → Review Queue; stale/confirmed → Details; dismissed/deleted → Home. Cold-start
  deep-link handling.
- **`theme.ts` rewrite (§3.7):** the §3.1 token ramp, the radial ground, `Fonts` (Manrope /
  Geist + system fallback), the Lucide wrapper (`strokeWidth 1.6`), `ThemedText` type roles from
  §3.2, `ThemedView` surfaces, the expanded `ThemeColor` union.
- **Component catalog:** §3.6's ~45 components → files under `src/ui` and `src/features/*`, each
  with a prop contract; full signatures for the reused primitives (Button, Card, Sheet,
  KeypadSheet, AmountInput, NumericKeypad, SegmentedControl, SelectorRow, TextField, Chip,
  StatTile, TransactionCard, DayGroupHeader, the Analytics chart trio, ConfirmDialog,
  UndoSnackbar, PermissionBanner, EmptyState, Skeleton, ErrorState, AccountAutocomplete,
  CategoryPickerSheet, FilterBlocks, …).
- **Per-screen wiring:** for each of the ~24 screens — the repo queries it reads, the stores it
  touches, its V-3 states (skeleton shape / empty copy + CTA / error), the `UI-0xx` + `IMP-0xx`
  it satisfies, nav in/out.

**Open sub-questions**

- Sheet system: full `@gorhom` + a custom registry, vs expo-router native modals with `@gorhom`
  only for the keypad sheet. The docked-keypad behaviour (§6.4) probably forces full `@gorhom` —
  confirm.
- `NativeTabs` (`expo-router/unstable-native-tabs`) vs a custom tab bar for the raised centre
  **Add** "FAB notch" (§8 flags a native-tabs constraint). iOS is Future, so a custom bar is
  likely — decide.
- Reduce-Motion plumbing: one hook vs per-component checks.

---

### Phase 5 — Notifications, errors, security, testing, release; freeze
**Produces:** §31 Notifications · §32 Error handling · §33 Security & privacy · §34 Testing
strategy · §35 Build & release. **Ends by freezing `SPEC-implementation.md`.**

- **Notifications:** `expo-notifications` channel(s); notification categories with the
  Save / Add / Discard actions; the known-vs-new-account action-set switch; the background
  response handler (`TaskManager`) that writes from the rule while killed; group/summary for 2+;
  stale-tap routing; permission-off = silent (queue + badge only); restore-after-reboot
  (re-post from persisted Suggestions). Reconcile with D18's headless task.
- **Error-handling matrix:** every failure mode (receiver exception, parse throw, DB write fail,
  migration fail, notification post fail, permission denied / permanently-denied, corrupt DB,
  export write fail) → user-facing behaviour (P-4 actionable) → logging policy (**no financial
  data, no SMS body in logs**; dev-only verbose). The receiver/task must never crash the app.
- **Security & privacy:** storage location + `allowBackup=false`; the no-network assertion and
  how it's verified; the export share-sheet flow; the **P-9 amendment** for crash reporting
  (Sentry config: `beforeSend` scrub, no breadcrumbs on financial screens, no PII, Settings
  opt-out, and the default — decide on-with-opt-out vs opt-in); R8 / ProGuard for release; the
  exact allowed crash payload.
- **Testing strategy:** Jest units (the parser corpus is the centrepiece; the normalization
  table; analytics math; formatter; period math; undo); RNTL for the V-3 states per screen;
  Maestro flows for J2 (core loop), J4 (manual add), J9 (delete/undo); the
  `IMP-0xx → test-id → status` matrix; a minimal CI note (typecheck + lint + jest).
- **Build & release:** EAS profiles (dev client already; `preview` internal APK; `production`);
  `app.json` changes (Android permissions, the SMS config plugin, package name,
  `allowBackup=false`); the direct-install / EAS internal-distribution workflow; versioning
  (remote `appVersionSource`); the `reset-project` caveat.
- **Freeze:** run `SPEC/PLAN.md` §11 against both specs; mark `SPEC-implementation.md` frozen.

**Open sub-questions**

- Crash-reporting default: on with a Settings opt-out (useful, less private) vs opt-in (private,
  rarely enabled) — flag to the user.
- Final crash SDK: Sentry vs a lighter option (GlitchTip / Bugsnag / minimal).
- Maestro vs Detox for the one E2E flow — Maestro recommended (lighter).

---

## 3. Progress

| Phase | Status |
|---|---|
| 0 — Planning & decisions | **Done** |
| 1 — Foundations | **Done** — `SPEC-implementation.md` §16–§18; decisions D22–D25 added |
| 2 — Data & persistence | **Done** — `SPEC-implementation.md` §19–§22; decisions D26–D28 added |
| 3 — Business logic | **Done** — `SPEC-implementation.md` §23–§27; decisions D29–D31; CR-1 on `SPEC-UI-UX.md` §6.10 |
| 4 — Navigation, components, wiring | Pending |
| 5 — Notifications, errors, security, testing, release | Pending |

## 4. How to run a phase

1. Re-read this file's phase section + the frozen-spec sections it names.
2. Resolve that phase's open sub-questions with the user first.
3. Write the `SPEC-implementation.md` sections.
4. Update §1 (Decisions log) if anything shifted; tick the phase off in §3 above.

## 5. Explicitly out of scope for this plan

- Feature implementation (`SPEC/PLAN.md` §9) — a separate track after Phase 5.
- V1.5 split expenses, iOS, cloud sync, budgets, historical SMS import — Future
  (`SPEC-implementation.md` §14).
- Any change to `SPEC-UI-UX.md` — frozen; a conflict is a change-request (`SPEC/PLAN.md` §10).
</content>
</invoke>
