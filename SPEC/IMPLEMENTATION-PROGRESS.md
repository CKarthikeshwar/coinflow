# CoinFlow — Implementation Spec: Progress Log

Running log of work on the technical half of `SPEC-implementation.md`, phase by phase, per
`SPEC/IMPLEMENTATION-PLAN.md`. Newest entries at the top of each phase.

> **2026-09-01 — ALL PHASES COMPLETE. `SPEC-implementation.md` is FROZEN (v1).**
> Part I (§1–§15) + Part II (§16–§37) done and consistent with `SPEC-UI-UX.md` (v1) + `SPEC/idea.md`.
> `SPEC/PLAN.md` §11 final-review pass recorded in `SPEC-implementation.md` §36. Next track:
> feature implementation (`SPEC/PLAN.md` §9), one feature at a time — outside this plan.

---

## Phase 5 — Notifications, errors, security, testing, release; freeze

**Status:** ✅ Done (2026-09-01)
**Produced:** `SPEC-implementation.md` §31 Notifications · §32 Error handling · §33 Security &
privacy · §34 Testing strategy · §35 Build & release · **§36 Specification status (freeze)** ·
§37 Change log (post-freeze). Added decisions **D34–D35** to §1. Rewrote the top status blockquote
(DRAFT → FROZEN v1), updated the Contents TOC and §15 Q8. Ticked Phase 5 in
`SPEC/IMPLEMENTATION-PLAN.md` §3 and marked the plan complete.

### Decisions locked (now D34–D35 in `SPEC-implementation.md` §1)

| # | Decision |
|---|---|
| D34 | **Crash reporting = Sentry (`@sentry/react-native ~8.24.0`), opt-in / default OFF.** `Sentry.init()` only when `crashReportingEnabled` (default `false`) → nothing transmits by default, About copy stays literally true, no onboarding disclosure. `beforeSend` + `beforeBreadcrumb` scrub via `scrubText()` and **fail closed**; financial-route breadcrumbs dropped; strict allowed-payload allowlist. Source maps / R8 mapping on the `production` profile only. P-9 amendment (D21). |
| D35 | **Testing = Jest (`jest-expo`) unit on `src/domain` (parser corpus = centrepiece + F1 acceptance bar) + RNTL per-screen V-3 states + Maestro J2/J4/J9 — not Detox.** CI = `tsc` + `expo lint` + `jest` only (no native/emulator/Maestro). Release = EAS `production` (autoIncrement, remote version), R8/ProGuard + resource shrink, `console.*` stripped, signed APK via EAS internal distribution (no Play track, D20). `test-id` = `screen:element`; traceability grid contract in §34.4. |

### Open sub-questions — resolved (user-confirmed)

- **Crash-reporting default** → **opt-in, OFF by default** (user picked "Opt-in" over
  "on-with-opt-out"). Keeps `idea.md`'s on-device positioning intact; solo dev flips it on for
  their own field testing.
- **Crash SDK** → **Sentry** (`@sentry/react-native`), as pencilled in D21 — best SDK-57 support,
  Expo config plugin, `beforeSend` scrub, free tier is plenty for one user.
- **E2E runner** → **Maestro** (YAML flows, no instrumented build) over Detox — matches the plan's
  lean and a solo Android-only project.

### Shape of what was specified

- **§31** — one `txn-review` HIGH channel; two categories `txn-known` (Save·Add·Discard) /
  `txn-new` (Add·Discard) + the known-vs-new switch; content builder (title/body/`data` payload
  carries **ids only**, no money); single-vs-group posting decision inside `SMS_INGEST_TASK`
  step 7; `NOTIFICATION_RESPONSE_TASK` handling `SAVE`/`DISCARD` headless (rolls back atomically)
  + foreground `ADD`/body-tap via the §28.3 deep-link table; stale-tap routing table; permission-off
  = silent (live `getPermissionsAsync`, never a stored flag); reboot recovery = JS
  `reconcileNotifications()` on launch/foreground + step-8 self-heal (**no `BOOT_COMPLETED`
  receiver** — keeps the native surface "SMS bridge only", D24); `src/services/notifications/*`
  file list.
- **§32** — 4 principles (tasks never crash the app; no financial data in any log/crash payload;
  P-4 actionable; verbose = dev-only); `src/lib/log.ts` + `redactError` + `scrubText` redaction
  policy with explicit allowed / never lists; a **20-row failure matrix** (E1–E20: native receiver
  throw → render crash) each with user-facing behaviour + logging; error boundaries (root +
  per-screen + sheet); the actionable-copy table (no red, neutral alert glyph only).
- **§33** — storage (app-private SQLite, `allowBackup=false`, export via cache dir + delete in
  `finally`); the no-network assertion + how it's verified (manifest checklist, a grep test over
  `src/**` for `fetch`/`XHR`/`WebSocket` outside `src/services/crash/`, IMP-045 manual); SMS
  handling (P-9 — body never persisted, `smsRef` = sender+timestamp only, `READ_SMS` justified by
  direct-install D20); the **P-9 crash-reporting amendment table** (D34 detail — init gate,
  `beforeSend`/`beforeBreadcrumb`, allowed payload, release plumbing); release hardening (R8,
  Hermes, console-strip, no `FLAG_SECURE` in V1); the final permission table.
- **§34** — tooling + CI (no native build in CI); unit-test suite table (parser corpus,
  normalization, categorization, analytics math, formatter, periods, undo, dedupe — target 100 %
  of `src/domain`); RNTL component tests keyed to the §30 V-3 states; Maestro J2/J4/J9 flow specs;
  the traceability matrix column contract + `test-id` convention + ~20 seed rows mapping
  `IMP-0xx` → test kind → location; the "not automated in V1" manual-QA list.
- **§35** — required `app.json` changes (package name, plugin list + order, `allowBackup`,
  `userInterfaceStyle:"dark"`, Sentry DSN); EAS profile table (`development` = only Metro build +
  E2E target; `preview` = field-test / D18 metric; `production` = shipped APK); prebuild/plugin
  order (CNG, `android/` not committed, module in `modules/`); versioning (remote
  `appVersionSource`); the direct-install distribution workflow; `reset-project` caveat; a
  16-item pre-release checklist.
- **§36** — the `SPEC/PLAN.md` §11 final-review pass (Product / UX / UI / Technical /
  Specification, each ✓ with section pointers); the from-here change protocol.
- **§37** — empty post-freeze change-log stub.

### Freeze

`SPEC-implementation.md` top blockquote: **DRAFT → FROZEN (v1) — 2026-09-01.** No CR was needed
against `SPEC-UI-UX.md` this phase (the notification surface §6.15, the V-3 states, and the
security posture were all already covered by the frozen UI/UX spec; opt-in-OFF crash reporting
needs no onboarding change).

### Log

- **2026-09-01** — Started Phase 5. Re-read the plan's Phase 5 section + `SPEC-implementation.md`
  §10 (notifications behaviour), §11 (permissions), §12 (persistence & data mgmt), §13 (IMP-0xx),
  §14 (future scope), §15 (open questions), §17.1–§17.6 (native trigger + headless tasks +
  walkthroughs + module plan), §28.3 (deep links), §30 (screen specs); `SPEC-UI-UX.md` §6.15
  (notification), §6.16 (global components), §7 (UI-0xx); `SPEC/PLAN.md` §8 + §11; `app.json`.
- **2026-09-01** — Asked the user the three Phase 5 sub-questions → opt-in/OFF · Sentry · Maestro.
- **2026-09-01** — Wrote §31–§37; added D34–D35; froze the doc; updated the TOC, §15 Q8, the plan
  §3, and this log.

---

## Phase 4 — Navigation, components, screen wiring

**Status:** ✅ Done (2026-09-01)
**Produced:** `SPEC-implementation.md` §28 Navigation · §29 Component architecture + `theme.ts`
rewrite · §30 Screen specs (data + state binding). Done in **one pass** (not split 4a/4b). Added
decisions **D32–D33**; §16 addendum (§28.0) for `lucide-react-native` + `expo-linear-gradient`.
Ticked Phase 4 in `SPEC/IMPLEMENTATION-PLAN.md` §3.

### Decisions locked (now D32–D33 in `SPEC-implementation.md` §1)

| # | Decision |
|---|---|
| D32 | **`SheetRegistry` API** (root-mounted, imperative `open`/`close`/`requestClose` with a dirty-guard) + **custom `CoinFlowTabBar`** (raised centre Add opens `sheets.open('add')`), confirming D25 · **one `useReducedMotion()` hook** + `resolveMotion()` feeding reanimated motion factories. |
| D33 | **`theme.ts` rewrite** — `Colors.dark` = §3.1 ramp (`Colors.light` mirrors it; `use-color-scheme` pins `'dark'`); `CategoryPalette` scoped to Analytics "Where it went" only; `<AppBackground>` = `react-native-svg` `<RadialGradient>` (LinearGradient fallback); `Fonts.sans=Geist` / `Fonts.display=Manrope`; `src/ui/icon.tsx` wraps `lucide-react-native` @ `strokeWidth 1.6`; `ThemedText`/`ThemedView` → `src/ui/` with §3.2 roles / §3.1 surfaces. |

### Open sub-questions — resolved

- **Sheet system** → root-mounted `@gorhom` `SheetRegistry` (already D25; API specified in §28.2).
- **Tab bar** → custom `CoinFlowTabBar`, not `NativeTabs` (already D25; §29.4).
- **Reduce-Motion plumbing** → one `useReducedMotion()` hook + motion factories (§28.4 / §29.5),
  taken inline (low-stakes).

### Shape of what was specified

- **§28** — final route tree (Stack/Tabs/Redirect/onboarding group; `headerShown:false`
  everywhere; native push transition; cross-fade tab switch); the `SheetRegistry` type +
  `<SheetHost>` + snap points + the keypad↔OS-keyboard swap mechanism; the notification
  deep-link table + cold-start/warm handling; Reduce-Motion hook + `resolveMotion`.
- **§29** — the concrete `theme.ts` (token names, `CategoryPalette`, `Radius`, `Elevation`,
  `Fonts`); `<AppBackground>` (svg radial); `src/ui/icon.tsx` (`IconName` union + the confirmed
  default-category glyph map); `ThemedText` role table + `ThemedView` surfaces; a ~45-row
  **component catalog** (file · key props · used-by · notes) covering all of §3.6; the motion
  factories.
- **§30** — a data/state binding block for all ~22 screens: repo hooks read · stores touched ·
  actions/writes · V-3 state deltas · the `UI-0xx` / `IMP-0xx` each satisfies · nav in/out.

### Carried into Phase 5

Notification surface build (channels, categories, action-set switch, headless response handler) →
**§31**. Error-state copy matrix → **§32**. Per-screen `test-id` map for `IMP-0xx → test` →
**§34**. `date-fns` locale wiring + Hermes `Intl` grouping shim (from Phase 3) land when the
formatter components are actually built.

---

## Phase 3 — Business logic

**Status:** ✅ Done (2026-09-01)
**Produced:** `SPEC-implementation.md` §23 SMS parsing · §24 Account normalization · §25 Categorization ·
§26 Analytics computation · §27 Formatting / time / undo / running balance. Added decisions
**D29–D31** to §1. Raised **CR-1** against `SPEC-UI-UX.md` (§6.10 item 3, the §6.10 states line,
`UI-055`, and a new §9 "Change log"). Ticked Phase 3 in `SPEC/IMPLEMENTATION-PLAN.md` §3.

### Decisions locked (now D29–D31 in `SPEC-implementation.md` §1)

| # | Decision |
|---|---|
| D29 | **Parser = hybrid (data tables + code), no confidence score.** `ParseResult` union: `transaction{ fields, parsedFlags, warnings }` or `ignored{ reason }`. `occurredAt` = SMS timestamp, no in-body date parsing in V1. Sender seed = curated code constant, not a table, expansion Future. Corpus fixture file is the primary unit-test asset. |
| D30 | **Account matching = exact `normalizedKey` equality only in V1.** §24.1 algorithm (lower-case; strip punctuation / `*` / trailing ref-order digits / company suffixes; preserve VPA structure). Near-misses → separate rules. No fuzzy / substring / ML. |
| D31 | **Analytics Week-mode comparison = previous ISO week ("Last week"); Month mode unchanged ("Last month").** Resolves D14. → **CR-1** on `SPEC-UI-UX.md` §6.10 / `UI-055` (wording only). Money format: hand-rolled Indian grouping (not `Intl`), paise only when non-zero, thin-space sign. |

### Open sub-questions — resolved

- **Week comparison target (D14)** → dynamic label per mode: "Last week" vs previous ISO week in
  Week mode, "Last month" vs previous calendar month in Month mode (user-confirmed). Applied as CR-1.
- **Parser rule format** → hybrid: data for senders + keyword sets + VPA shapes, code for assembly
  (plan's lean; folded into D29).
- **Sender/keyword seed size** → V1 ships a curated code constant; device-driven expansion is
  Future (plan's lean; folded into D29).

### CR-1 (change-request against the frozen UI/UX spec, per `SPEC/PLAN.md` §10)

`SPEC-UI-UX.md` §6.10 only specified "Last month ₹…" on the Mean/Median tiles; Week mode (D14,
ships V1) needs its own comparison. Spec updated **first**: §6.10 item 3 + the states line +
`UI-055` now say the label is period-aware; a new **§9 Change log** records CR-1. No layout or
component change — same tile, dynamic string.

### Shape of what was specified

- **§23** — `parseSms(RawSms): ParseResult`; the 5-stage pipeline (sender gate → ignore gate →
  extraction → transaction gate → output); the sender-ID match rule; the ordered ignore table
  (otp / promo / balance-only / request-money / foreign-currency / not-yet-settled); per-field
  extractors (amount→paise-as-integer regex + parsing rule, direction keyword sets, account
  VPA/"to X"/UPI-ref, method hints); the `ParseResult` type; the test-corpus plan.
- **§24** — the 7-step `normalize()` algorithm, a worked input→key table incl. §8 near-misses,
  exact-match-only rule.
- **§25** — `resolveCategoryForAccount` (never guess), the notification known-vs-new decision,
  the save/edit upsert semantics (keep learned category when new save is Uncategorized),
  Uncategorized = `categoryId IS NULL`.
- **§26** — exact SQL + JS split for every F9 metric: core aggregates, running balance, MoM
  deltas, by-category (Uncategorized bucket), largest 5, daily series (JS bucket + zero-fill),
  mean (days-elapsed), median (of zero-filled series), arc fill clamp, outlier scaling, Week mode
  (ISO week, previous-ISO-week comparison).
- **§27** — `formatMoney` (Indian grouping hand-rolled, thin-space sign, paise-when-nonzero),
  `formatWhen` / `formatDayHeader`, the period/boundary helpers (`dayIndex`, `monthPeriod`,
  `isoWeekPeriod`, `previousPeriod`, `stepPeriod`), the Undo constants + flow (no DB timer), the
  running-balance helper.

### Carried into later phases

`date-fns` locale wiring + Hermes `Intl` grouping shim → **Phase 4 (§29)** when components consume
the formatters. Final `SENDER_SEED` contents → curated during feature implementation; device-driven
expansion is Future. Keyword tuning from the first real-SMS field test → post-launch.

### Log

- **2026-09-01** — Started Phase 3. Re-read the plan's Phase 3 section + `SPEC-implementation.md`
  §7 (SMS detection & parsing), §8 (account memory), §9 (analytics computation), §19–§22 (Phase 2),
  and `SPEC-UI-UX.md` §5 (V-1 money, V-2 dates), §6.10 (Analytics), §6.2 (Home tiles).
- **2026-09-01** — Asked the user the Week-comparison sub-question → dynamic per-mode label.
  Applied CR-1 to `SPEC-UI-UX.md` (§6.10 ×2, `UI-055`, new §9 change log).
- **2026-09-01** — Wrote §23–§27; added D29–D31; ticked Phase 3.

---

## Phase 2 — Data & persistence

**Status:** ✅ Done (2026-09-01)
**Produced:** `SPEC-implementation.md` §19 Data models (final) · §20 Persistence & migrations ·
§21 Data-access layer · §22 Application state. Added decisions **D26–D28** to §1; §16 addendum
(§18.6) for `expo-file-system` + `expo-sharing`. Ticked Phase 2 in `SPEC/IMPLEMENTATION-PLAN.md` §3.

### Decisions locked (now D26–D28 in `SPEC-implementation.md` §1)

| # | Decision |
|---|---|
| D26 | **Undo = soft-delete (`transaction.deletedAt`) + purge-on-launch** (~60 s grace). **`suggestion` dismiss = hard `DELETE`**; `suggestion.status` is `pending` \| `confirmed` only (`confirmed` kept ~24 h for stale-notification routing, then purged). |
| D27 | **Search = FTS5 external-content `transaction_fts` + AFTER INSERT/UPDATE/DELETE sync triggers**, shipped as a hand-written migration. SDK 57 `expo-sqlite` `enableFTS` is on by default (verified in the v57 docs). Fallback: maintained `searchText` column + `LIKE`. |
| D28 | **Money = INTEGER paise end-to-end**, zero float. Timestamps = INTEGER epoch-ms UTC, local-day/week/month math in a domain helper. IDs = `expo-crypto` UUID text; enums = TEXT + Drizzle enum guards. |

### Open sub-questions — resolved

- **Undo backing** → soft-delete + purge-on-launch (user-confirmed).
- **Suggestion dismiss** → hard delete (user-confirmed); `status` drops the `dismissed` value.
- **FTS5 availability** → present in SDK 57 by default (`enableFTS`); FTS5 is the primary path,
  `LIKE` is the documented fallback.
- **No-float pipeline** → confirmed as D28.

### Shape of what was specified

- **§19** — final tables: `transaction`, `category`, `account_rule` (natural PK `normalizedKey`),
  `suggestion`, `app_setting` (KV), `transaction_fts` (FTS5). Every field: type / null / default /
  notes; all indices; the `account_rule` upsert SQL; the §19.0 conventions block.
- **§20** — one `openDatabaseSync` handle (WAL, FK on, `enableChangeListener`); `drizzle-kit`
  generate → committed migrations → bundled → `useMigrations` in a `<MigrationGate>` that holds
  first paint; migration-error screen (no wipe); **headless task runs `ensureMigrated()` before
  any write** (Phase 1 open item resolved); idempotent seed (10 category rows w/ proposed Lucide
  icons, `ON CONFLICT(key) DO NOTHING`); purge-on-launch; Clear-all-data; Export (JSON+CSV via
  `expo-file-system` + `expo-sharing`).
- **§21** — repository API per entity: method / kind / screen it backs / headless-reachable flag.
  `*Sync` variants for the paths the SMS + notification tasks use; live `use*` hooks on
  `useLiveQuery`; `analyticsRepo` is raw SQL (statements deferred to §26).
- **§22** — three state tiers: SQLite-derived (only source of truth, no optimistic cache) ·
  6 Zustand ephemeral stores (draft, keypad, filter draft, onboarding, sheet registry, undo) ·
  `app_setting` persisted prefs. Permission status is read live from the OS, never stored.
  Cross-context update = headless write → `expo-sqlite` change event → `useLiveQuery` re-emit.

### Carried into later phases

Proposed default-category Lucide icons re-confirmed against the final wrapper → **Phase 4 (§29)**.
Analytics SQL + JS mean/median/zero-fill → **Phase 3 (§26)**. `normalize()` algorithm feeding
`normalizedAccountKey` / `normalizedKey` → **Phase 3 (§24)**. `SheetRegistry` / draft-store API
surface, Reduce-Motion hook → **Phase 4 (§28–§29)**.

### Log

- **2026-09-01** — Started Phase 2. Re-read the plan's Phase 2 section + `SPEC-implementation.md`
  §6 (data model sketch), §7–§9, §12, §13 (IMP-0xx), and §16–§18 from Phase 1.
- **2026-09-01** — Verified FTS5 + sync APIs + change listener in `expo-sqlite` SDK 57 docs.
- **2026-09-01** — Resolved the three open sub-questions with the user; wrote §19–§22; added
  D26–D28 and the §18.6 addendum; ticked Phase 2.

---

## Phase 1 — Foundations (stack, architecture, project structure)

**Status:** ✅ Done (2026-09-01)
**Produced:** `SPEC-implementation.md` §16 Technology stack · §17 System architecture · §18 Project
structure. Added a Contents/TOC block and decisions **D22–D25** to §1. Ticked Phase 1 in
`SPEC/IMPLEMENTATION-PLAN.md` §3.

### Decisions locked (now D22–D25 in `SPEC-implementation.md` §1)

| # | Decision |
|---|---|
| D22 | **Source layout: feature-first** — `src/features/*` over shared `src/ui` · `src/domain` (pure TS) · `src/db` · `src/services` · `src/stores`. `ui`/`domain`/`db` never import from `features`. |
| D23 | **SMS-while-killed: native manifest `BroadcastReceiver` → headless JS task.** All parsing / DB / notification in JS. `expo-background-task` rejected (15-min floor, dead when app killed). |
| D24 | **Notification `Save` while killed: all-JS headless notification-response task.** Native module surface stays "SMS receiver bridge only". |
| D25 | **Sheets = root-mounted `@gorhom` `SheetRegistry`, not `expo-router` modal routes; custom tab bar, not `NativeTabs`** (raised centre Add "FAB notch", greyscale pill; iOS is Future). |

### Stack pinned (see §16 for rationale + rejected alternatives)

- **Data:** `expo-sqlite ~57.0.2` · `drizzle-orm 0.45.2` · `drizzle-kit 0.31.10` (dev)
- **State:** `zustand 5.0.15` (ephemeral only); persisted prefs → a SQLite `app_setting` KV table
- **UI infra:** `@gorhom/bottom-sheet 5.2.14` · `@shopify/flash-list 2.0.2` · `react-native-svg 15.15.4` · `d3-shape 3.2.0` · `d3-scale 4.0.2`
- **Detection:** `modules/coinflow-sms` (in-repo Kotlin module) · `expo-notifications ~57.0.15` · `expo-task-manager ~57.0.14` · `expo-dev-client ~57.0.16` (dev) · `expo-build-properties ~57.0.15`
- **Utils / obs:** `date-fns 4.4.0` · `expo-crypto ~57.0.2` · `@sentry/react-native 8.24.0` (final pin in Phase 5)
- **Testing:** `jest-expo 57.0.5` · `@testing-library/react-native 14.0.1` · Maestro (external)
- **Rejected:** `expo-background-task` (interval floor + dies on kill), NativeWind/Tamagui, TanStack Query, Redux/Jotai, WatermelonDB, Victory/Skia, Luxon, Detox, `react-native-mmkv`

### Risks flagged for install-time re-verification (§16.7)

- `@gorhom/bottom-sheet@5` vs `react-native-reanimated@4.5.1` + worklets on new arch
- `@shopify/flash-list@2.0.2` vs React 19.2 (recycling smoke test on 2,000 rows)
- Drizzle `useLiveQuery` over `expo-sqlite` change listeners on SDK 57
- FTS5 presence in the `expo-sqlite` build (search) — fallback `LIKE`; **decided in Phase 2**

### Carried into later phases

Migration-pending behaviour in a headless task, FTS5 vs `LIKE` → **Phase 2 (§20)**. Permission-request
mechanism, Reduce-Motion plumbing, `SheetRegistry` API, deep-link URL shapes, `theme.ts` rewrite,
component contracts, per-screen wiring → **Phase 4 (§28–§30)**. Notification channel/category IDs,
final crash SDK + default + `beforeSend` scrub, the D18 contingency hybrid (documented, not built) →
**Phase 5 (§31, §33)**.

### Log

- **2026-09-01** — Started Phase 1. Read the frozen inputs it depends on: `SPEC/IMPLEMENTATION-PLAN.md`
  (Phase 1 section + Phase 0 decisions D14–D21), `SPEC-implementation.md` §1–§15, `SPEC-UI-UX.md`
  §3 (design system) / §4 (navigation) / §6 (screens) / §8 (resolved decisions), `SPEC/PLAN.md`,
  `SPEC/idea.md`, and the repo's `package.json` / `app.json` / `tsconfig.json` / `eas.json` /
  current `src/` tree.
- **2026-09-01** — Researched the v57 background-execution story (per `AGENTS.md`): `expo-background-task`
  (WorkManager) has a **15-minute minimum interval** and **does not run when the app is killed** —
  unusable for the SMS core loop. Confirms D18's direction: a manifest-registered native
  `BroadcastReceiver` is the wake trigger, headless JS does the work.
- **2026-09-01** — Resolved the three Phase 1 open sub-questions with the user (see decisions below).
