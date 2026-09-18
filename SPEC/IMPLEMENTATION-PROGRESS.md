# CoinFlow — Implementation Spec: Progress Log

Running log of work on the technical half of `SPEC-implementation.md`, phase by phase, per
`SPEC/IMPLEMENTATION-PLAN.md`. Newest entries at the top of each phase.

**Reading this document (for anyone new to the project):** this is a work diary for the
*technical* half of CoinFlow's implementation spec (`SPEC-implementation.md`). Building that spec
was split into 5 "phases" (Phase 1 through Phase 5, each covering a different chunk of the
technical design — data storage, business logic, screens, notifications, and so on). For each
phase, this log records: which parts of the spec got written, which open questions got answered
and how, and a running "Log" of dated steps. Entries are listed with the newest phase first
(Phase 5 at the top of the file, Phase 1 at the bottom), and within a phase the most recent log
line is also listed first.

A few recurring symbols and abbreviations used throughout this file and the other SPEC documents:
- **§** means "section" — e.g. "§31" is "section 31 of `SPEC-implementation.md`".
- **D##** (e.g. D34) is a numbered, permanent **decision** record — once a decision is made and
  numbered, that number is never reused or renumbered, so other documents and future contributors
  can refer back to, say, "D34" and know exactly what was decided and why.
- **IMP-0xx** is a numbered requirement in the *implementation* spec; **UI-0xx** is a numbered
  requirement in the *UI/UX* spec. **CR-##** (e.g. CR-1) is a "change request" — a formal, logged
  edit made to a spec document that has already been declared finished ("frozen"), used instead of
  silently editing it.
- **"Frozen"** means a spec document has been reviewed and locked as the agreed-upon version
  (labelled "v1" here) — from that point on, changes to it are supposed to go through the CR
  process above rather than being made casually, so everyone relying on it can trust it won't
  shift under them.

> **2026-09-01 — ALL PHASES COMPLETE. `SPEC-implementation.md` is FROZEN (v1).**
> Part I (§1–§15, the product/behaviour half) + Part II (§16–§37, the technical half) are done and
> consistent with `SPEC-UI-UX.md` (v1) + `SPEC/idea.md`. `SPEC/PLAN.md` §11's final-review pass is
> recorded in `SPEC-implementation.md` §36. Next track: feature implementation
> (`SPEC/PLAN.md` §9), one feature at a time — outside this plan.

---

## Phase 5 — Notifications, errors, security, testing, release; freeze

**Status:** ✅ Done (2026-09-01)
**Produced:** `SPEC-implementation.md` §31 Notifications · §32 Error handling · §33 Security &
privacy · §34 Testing strategy · §35 Build & release · **§36 Specification status (freeze)** ·
§37 Change log (post-freeze). Added decisions **D34–D35** to §1. Rewrote the top status blockquote
(DRAFT → FROZEN v1), updated the Contents TOC (Table of Contents — the outline/index block near
the top of the spec listing every section) and §15 Q8. Ticked Phase 5 in
`SPEC/IMPLEMENTATION-PLAN.md` §3 and marked the plan complete.

### Decisions locked (now D34–D35 in `SPEC-implementation.md` §1)

| # | Decision |
|---|---|
| D34 | **Crash reporting = Sentry (`@sentry/react-native ~8.24.0`), opt-in / default OFF.** Sentry is a third-party service that acts as a "crash reporter": when the app crashes or hits an error, it packages up technical details (a stack trace, device info) and sends them to Sentry's servers so a developer can see what went wrong. "Opt-in / default OFF" means the feature starts switched off for every user, and only sends anything once a user actively turns it on — the opposite of "on by default, with an opt-out". `Sentry.init()` (the call that actually starts the crash reporter listening) only runs when the setting `crashReportingEnabled` is true (its default is `false`) → nothing transmits by default, the app's "About" screen copy claiming no data leaves the device stays literally true, and no onboarding disclosure screen is needed. `beforeSend` + `beforeBreadcrumb` are Sentry SDK "hooks" — small pieces of code that run just before an error report, or a "breadcrumb" (a trail of recent app actions leading up to the crash), is sent — letting the app inspect and edit it first; here they scrub (strip out) sensitive text via a helper function `scrubText()` and **fail closed** (if the scrubbing code itself errors, the safe default is to drop the data rather than risk sending something unscrubbed). Breadcrumbs from any financial screen are dropped entirely, and only a strict, explicitly allowed list of payload fields is ever sent. "Source maps" (files that let a crash report's minified/compiled code be translated back into readable source code and line numbers) and the R8 "mapping" file (R8 is explained under D35 below) are generated only for the `production` build profile. This is an amendment to privacy principle P-9, and was pencilled in earlier as decision D21. |
| D35 | **Testing = Jest (`jest-expo`) unit tests on `src/domain` (parser corpus = centrepiece + F1 acceptance bar) + RNTL per-screen V-3 states + Maestro J2/J4/J9 — not Detox.** Jest is a JavaScript test-running framework; `jest-expo` is the Expo-flavoured preset of it. A "unit test" checks one small piece of logic in isolation. The "parser corpus" is a saved set of real example bank/UPI SMS messages used as the test's ground truth — it doubles as the main proof that the SMS parser meets its F1 "acceptance bar" (the quality threshold Feature 1 must clear). RNTL = React Native Testing Library, a tool for testing rendered UI components; "V-3 states" refers to the set of visual states (loading/empty/error/etc., defined in `SPEC-UI-UX.md`) each screen must handle correctly. Maestro and Detox are both "E2E" (end-to-end) test tools that drive the real app the way a user would; Maestro was chosen over Detox (see below) because it uses plain YAML flow files and doesn't need a special instrumented build; "J2/J4/J9" are specific named Maestro test flows. CI (continuous integration — automated checks that run on every code change) = `tsc` (the TypeScript compiler, run here only to check for type errors, not to build anything) + `expo lint` (a code-style checker) + `jest` only — no native build, emulator, or Maestro run in CI, to keep it fast. Release = the EAS (Expo Application Services, Expo's cloud build system) `production` build profile (autoIncrement = the build number bumps itself automatically; remote version = that version number lives on Expo's servers rather than in a local file), R8/ProGuard (Android tools that shrink the app's code and rename its internals to something unreadable, both to save space and make reverse-engineering harder) + resource shrink (strips unused images/strings), `console.*` calls stripped (debug logging removed from the shipped app), a signed APK (a cryptographically signed installable Android package) delivered via EAS internal distribution (a direct install link, bypassing the Google Play Store entirely — no Play "track" i.e. release channel, per D20). `test-id` (a stable identifier attached to a UI element purely so automated tests can find it) uses `screen:element` naming; the traceability grid (a table cross-referencing every requirement to the test that proves it) contract is defined in §34.4. |

### Open sub-questions — resolved (user-confirmed)

- **Crash-reporting default** → **opt-in, OFF by default** (the user explicitly picked "opt-in"
  over "on-with-opt-out" — see the plain-English note on D34 above for what that distinction
  means). Keeps `idea.md`'s on-device positioning intact; the solo developer can still flip it on
  for their own field testing.
- **Crash SDK** → **Sentry** (`@sentry/react-native`), as pencilled in D21 — chosen for its
  strong support for SDK 57 (Expo SDK version 57, the specific Expo release this app targets), an
  available Expo "config plugin" for it (a small config block that lets a third-party library hook
  a native capability into Expo's build process, without anyone hand-writing native code), the
  `beforeSend` scrub hook (see D34), and a free usage tier that's plenty for a single-user app.
- **E2E runner** → **Maestro** (YAML flow files, no "instrumented build" — a special test-only
  build variant some E2E tools require) over Detox — matches the plan's preference for a lean
  toolchain and a solo, Android-only project.

### Shape of what was specified

- **§31** — one `txn-review` HIGH-importance notification channel (Android groups notifications
  into "channels" so the user can control each type's sound/vibration/importance separately in
  system settings; "HIGH" is the importance level); two categories `txn-known` (Save·Add·Discard) /
  `txn-new` (Add·Discard) + the known-vs-new switch — a notification "category" here is the set of
  quick-action buttons attached to it; a content builder for the title/body/`data` payload, which
  carries **ids only**, no money (the hidden data payload attached to a notification never
  contains amounts or account info, only reference IDs); the single-vs-group posting decision
  inside `SMS_INGEST_TASK` step 7 (the background task that runs when a new SMS arrives);
  `NOTIFICATION_RESPONSE_TASK` handling `SAVE`/`DISCARD` **headless** (running in the background
  with no screen visible, e.g. while the phone is locked) — it rolls back **atomically** (the
  whole undo either fully happens or not at all, never half-applied) — plus foreground
  `ADD`/body-tap handling via the §28.3 deep-link table (a "deep link" opens the app straight to a
  specific screen rather than just its home screen); a stale-tap routing table; permission-off =
  silent (checked live via `getPermissionsAsync`, an Expo call that asks the OS right now whether
  notification permission is granted, rather than trusting a possibly-outdated saved flag); reboot
  recovery = a JS `reconcileNotifications()` call on launch/foreground + a step-8 self-heal
  (**no `BOOT_COMPLETED` receiver** — a `BOOT_COMPLETED` receiver is native Android code that
  would auto-run every time the phone finishes rebooting; deliberately not used here, to keep the
  native code surface to "SMS bridge only", D24); the `src/services/notifications/*` file list.
- **§32** — 4 guiding principles (background tasks must never crash the whole app; no financial
  data ever appears in any log or crash payload; per principle P-4, error messages must be
  "actionable" — tell the user what to do, not just that something broke; verbose/debug logging is
  dev-only); `src/lib/log.ts` + `redactError` + `scrubText` — a redaction policy (rules for
  stripping or masking sensitive text before it's logged or reported) with explicit "allowed" /
  "never log this" lists; a **20-row failure matrix** (a table enumerating every known failure
  scenario, E1 through E20, from a native receiver throwing an exception up to a full
  screen-render crash) each row noting the user-facing behaviour and what gets logged; error
  boundaries (a React pattern: a wrapper component that catches a crash in the components below it
  so the whole screen/app doesn't go down too) at the root, per-screen, and per-sheet level; the
  actionable-copy table (no red colour, a single neutral alert icon only, per the UI spec's tone).
- **§33** — storage (an app-private SQLite database — "app-private" meaning the file lives where
  no other app can read it — with `allowBackup=false`, an Android manifest setting that stops the
  OS from silently cloud-backing-up the app's data; data export writes a temp file to the cache
  directory then deletes it in a `finally` block, a code pattern guaranteeing the cleanup runs even
  if something above it fails); the no-network assertion (the checked claim that the app makes
  *zero* network requests, since it's meant to work fully on-device) and how it's verified (a
  manifest checklist, plus a "grep test" — an automated search of the code for a text pattern —
  scanning all of `src/**` for any use of `fetch`/`XHR`/`WebSocket`, the three ways JS code can
  talk to a network, outside `src/services/crash/`, plus one manual check, IMP-045); SMS handling
  (privacy principle P-9 — the SMS's actual text body is never saved to disk, only a `smsRef` made
  of sender + timestamp; the `READ_SMS` Android permission is justified by the direct-install
  distribution model, D20); the **P-9 crash-reporting amendment table** (spelling out D34 in
  detail — the on/off init gate, the `beforeSend`/`beforeBreadcrumb` scrub hooks, the allowed
  payload fields, and release-build plumbing); release hardening (R8 — see D35 — plus Hermes, the
  JavaScript engine that actually executes the app's code on-device, in its stripped/optimized
  release mode; `console.*` calls removed; no `FLAG_SECURE` — an Android flag that would block
  screenshots/screen-recording of the app — in V1); the final permission table.
- **§34** — tooling + CI setup (no native Android build runs in CI, to keep it fast); the
  unit-test suite table (covering the SMS parser corpus, account-name normalization,
  categorization, analytics math, money/date formatting, period calculations, undo, and "dedupe" —
  duplicate-transaction detection/removal — targeting 100% coverage of `src/domain`); RNTL
  component tests keyed to the §30 V-3 visual states; Maestro J2/J4/J9 end-to-end flow specs; the
  traceability matrix's column layout + the `test-id` naming convention + ~20 seed rows mapping
  each `IMP-0xx` requirement → what kind of test covers it → where that test lives; the "not
  automated in V1" manual-QA checklist.
- **§35** — required `app.json` changes (`app.json` is Expo's central app-configuration file) —
  package name, the list and order of "plugins" (small config blocks that hook a native
  capability into Expo's build process without hand-writing native code, e.g. the Sentry plugin),
  `allowBackup`, `userInterfaceStyle:"dark"`, and the Sentry DSN (Sentry's "Data Source Name" — an
  address/key telling the SDK which project on Sentry's servers to send reports to); the EAS build
  profile table (a build "profile" is a named preset of build settings) — `development` (builds
  only for the Metro bundler, the tool that packages the app's JavaScript into runnable files, plus
  the E2E test target), `preview` (for field-testing, tied to the D18 metric), `production` (the
  actual shipped APK); the prebuild/plugin order (CNG = "Continuous Native Generation", Expo's
  process of *generating* the native `android/`/`ios/` project folders from `app.json` + plugins
  rather than hand-editing them — hence `android/` is never committed to git, and the custom native
  module lives in `modules/`); versioning (a remote `appVersionSource` — the version number lives
  on Expo's servers rather than in a local file); the direct-install distribution workflow; the
  `reset-project` caveat (a destructive script — see root `CLAUDE.md` — that must not be run
  carelessly); a 16-item pre-release checklist.
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
| D32 | **`SheetRegistry` API** — a bottom sheet is a panel that slides up from the bottom of the screen (used for things like "Add transaction"); `SheetRegistry` is the one central, root-mounted (mounted once at the top of the whole app, not per-screen) system that manages every sheet, with an **imperative** API (`open`/`close`/`requestClose` — code calls these methods directly to trigger the sheet, rather than just changing some data and letting React re-render, which is the more usual style) and a "dirty-guard" (a check that stops a sheet closing if it has unsaved changes, prompting the user to confirm first) — plus a **custom `CoinFlowTabBar`** (the row of tabs at the bottom of the app; its raised centre "Add" button opens `sheets.open('add')`), confirming D25 · **one `useReducedMotion()` hook** (a hook is a reusable bit of React logic; this one detects whether the phone's OS-level "reduce motion" accessibility setting is on) + `resolveMotion()` feeding "reanimated" (React Native Reanimated, a library for building smooth animations that run efficiently on the device) motion factories (ready-made animation configs). |
| D33 | **`theme.ts` rewrite** — `Colors.dark` = the §3.1 color ramp (a coordinated, full set of shades making up the color scheme; `Colors.light` mirrors/duplicates it since `use-color-scheme` always hard-codes `'dark'` — V1 is dark-only, see root `CLAUDE.md`); `CategoryPalette` (a set of distinct colors, one per spending category) scoped to the Analytics "Where it went" chart only, not used elsewhere; `<AppBackground>` renders via `react-native-svg` (a library for drawing scalable vector graphics) using a `<RadialGradient>` (a color gradient radiating outward from a point) with a `<LinearGradient>` (a straight-line color gradient) as a fallback where radial isn't supported; `Fonts.sans = Geist` (the regular body typeface) / `Fonts.display = Manrope` (the larger headline typeface); `src/ui/icon.tsx` wraps the `lucide-react-native` icon library at `strokeWidth 1.6` (how thick the icon's lines are drawn); `ThemedText`/`ThemedView` (the base text/surface components — see root `CLAUDE.md`) move to `src/ui/` with the §3.2 text-role table / §3.1 surface-color table. |

### Open sub-questions — resolved

- **Sheet system** → root-mounted `@gorhom` `SheetRegistry` (already decided as D25; the detailed
  API is specified in §28.2).
- **Tab bar** → custom `CoinFlowTabBar`, not `NativeTabs` (already decided as D25; §29.4).
- **Reduce-Motion plumbing** → one `useReducedMotion()` hook + motion factories (§28.4 / §29.5) —
  this one was decided "inline" (made directly while writing the spec, without a formal
  back-and-forth with the user) since it was low-stakes / low-risk.

### Shape of what was specified

- **§28** — the final route tree (the map of all the app's screens and how they nest, used by
  `expo-router`; a **Stack** route pushes new screens on top like a stack of cards, **Tabs** are
  the bottom tab-bar screens, a **Redirect** route automatically forwards to another route; plus
  an onboarding group); `headerShown:false` everywhere (the default top header bar is switched off
  on every screen since the app draws its own); a native push transition (the platform's built-in
  slide-in animation between screens) for stack navigation vs a cross-fade (fade out/fade in) for
  switching tabs; the `SheetRegistry` type + `<SheetHost>` (the always-mounted component that
  actually renders whichever bottom sheet is currently open) + "snap points" (the fixed heights a
  bottom sheet can rest at, e.g. half-open vs fully expanded) + the mechanism for swapping between
  the app's own custom on-screen keypad and the phone's normal OS keyboard; the notification
  deep-link table + handling for "cold-start" (the app was fully closed and has to launch from
  scratch) vs "warm" (the app was already running in the background) taps; the Reduce-Motion hook
  + `resolveMotion`.
- **§29** — the concrete `theme.ts` — "design tokens" (named, reusable design values — like a
  color or spacing size — used instead of scattering raw numbers everywhere, so the whole app
  stays visually consistent): token names, `CategoryPalette`, `Radius` (corner-rounding values),
  `Elevation` (shadow/depth styling used to make an element look raised above the background),
  `Fonts`; `<AppBackground>` (the svg radial-gradient background); `src/ui/icon.tsx` (an
  `IconName` "union type" — a fixed, compiler-checked list of every valid icon name, so a typo
  would fail the type-check — plus the confirmed default-category-to-icon lookup map);
  `ThemedText`'s text-role table + `ThemedView`'s surface-color table; a ~45-row **component
  catalog** (a reference table listing every reusable UI building block, with its file location,
  key props, which screens use it, and notes) covering all of §3.6; the motion factories.
- **§30** — a data/state binding block for all ~22 screens, specifying for each one: which "repo
  hooks" (functions that read data out of the database repository layer, see §21) it uses; which
  state "stores" it touches (see §22); what actions/writes it performs; which V-3 visual-state
  variations apply; which `UI-0xx` / `IMP-0xx` requirement IDs it satisfies; and how you navigate
  into and out of it.

### Carried into Phase 5

Notification surface build (channels, categories, action-set switch, headless response handler) →
**§31**. Error-state copy matrix → **§32**. Per-screen `test-id` map for `IMP-0xx → test` →
**§34**. `date-fns` locale wiring + a Hermes `Intl` grouping shim (a "shim" is a small patch that
fills in a missing/broken platform feature — here, number "thousands" grouping via the `Intl` API
on Hermes, the JS engine described in Phase 5 §33) (from Phase 3) land when the formatter
components are actually built.

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
| D29 | **Parser = hybrid (data tables + code), no confidence score.** "Hybrid" means the SMS-parsing rules are partly plain data (lists of known sender IDs, keyword sets) and partly hand-written code logic, rather than being 100% one or the other. There is deliberately no "confidence score" (a probability-like number expressing how sure the parser is) — a message is either successfully parsed or it isn't, no in-between. `ParseResult` is a "union type" (a TypeScript value that is always exactly one of a fixed set of shapes): either `transaction{ fields, parsedFlags, warnings }` (a successful parse, with the extracted fields, flags about how it was parsed, and any warnings) or `ignored{ reason }` (the message was recognized but deliberately skipped, with why). `occurredAt` (when the transaction happened) is taken from the SMS's own delivery timestamp — V1 does not try to parse a date written inside the message text itself. The "sender seed" (the starting list of known bank/UPI sender IDs) is a curated, hand-picked constant baked into the code, not a database table; growing that list from real device data is Future scope. The "corpus fixture file" (a saved file of real example SMS messages used as test input) is the primary unit-test asset for this parser. |
| D30 | **Account matching = exact `normalizedKey` equality only in V1.** A `normalizedKey` is a cleaned-up, standardized version of an account or merchant name (see the §24.1 algorithm: lower-case everything; strip punctuation, `*` characters, trailing reference/order digits, and company suffixes; but preserve the structure of a VPA — a "Virtual Payment Address", UPI's equivalent of an account handle, shaped like `name@bank`) — the idea is that trivially different spellings of the same account normalize down to the same key. Matching two transactions to the same account requires their normalized keys to be **exactly, character-for-character equal**; V1 does no "fuzzy" matching (tolerating small differences/typos), no "substring" matching (one string merely containing another), and no ML (machine learning). Anything that's a near-miss instead gets its own separate account-rule entry. |
| D31 | **Analytics Week-mode comparison = previous ISO week ("Last week"); Month mode unchanged ("Last month").** An "ISO week" is the international standard definition of a week (Monday to Sunday, numbered 1 through 52/53 per year) — using it makes "last week" unambiguous. This resolves D14 (an earlier open question) and required **CR-1**, a formal change request, against the already-frozen `SPEC-UI-UX.md` §6.10 / `UI-055` (wording only, no layout change — see the "CR-1" section below). Money formatting uses a hand-rolled (custom hand-written, not using the JS built-in `Intl` API) Indian-style digit grouping (e.g. `12,34,567` rather than the Western `1,234,567`), shows paise (1 rupee = 100 paise, India's equivalent of "cents") only when the amount isn't a whole rupee value, and uses a "thin space" (a narrow, typographically refined space character) next to the +/− sign instead of a normal space. |

### Open sub-questions — resolved

- **Week comparison target (D14)** → dynamic label per mode: "Last week" vs previous ISO week in
  Week mode, "Last month" vs previous calendar month in Month mode (user-confirmed). Applied as CR-1.
- **Parser rule format** → hybrid: data for senders + keyword sets + VPA shapes, code for assembly
  (plan's lean; "folded into D29" means this sub-decision didn't get its own new decision number —
  it's recorded as part of D29 above).
- **Sender/keyword seed size** → V1 ships a curated code constant; device-driven expansion is
  Future (plan's lean; folded into D29).

### CR-1 (change-request against the frozen UI/UX spec, per `SPEC/PLAN.md` §10)

`SPEC-UI-UX.md` §6.10 only specified "Last month ₹…" on the Mean/Median tiles (a "tile" is a
small card-shaped UI block showing one statistic); Week mode (D14, ships V1) needs its own
comparison. The spec was updated **first**: §6.10 item 3 + the states line + `UI-055` now say the
label is period-aware; a new **§9 Change log** records CR-1. No layout or component change — same
tile, just a dynamic string.

### Shape of what was specified

- **§23** — `parseSms(RawSms): ParseResult` (the parser's main function signature: give it a raw
  SMS, get back a `ParseResult`); a 5-stage "pipeline" (a fixed sequence of processing steps, each
  handing its output to the next): sender gate → ignore gate → extraction → transaction gate →
  output (a "gate" is a checkpoint stage that can stop or filter the message before it goes
  further); the sender-ID match rule (checking whether the SMS came from a recognized bank/UPI
  sender ID); the ordered ignore table (categories of message the parser deliberately treats as
  *not* a transaction: OTP — one-time-password codes; promo — marketing messages; balance-only —
  a plain balance-check with no transaction; request-money — someone *requesting* payment rather
  than a completed one; foreign-currency; and not-yet-settled — a pending/authorization-only
  message); per-field "extractors" (pieces of logic that each pull one specific value out of the
  message text): the amount extractor (turns the amount into paise as a whole-number integer,
  using a "regex" — a regular expression, a pattern-matching syntax for finding text shapes — plus
  a parsing rule), direction keyword sets (word lists that say whether money went out —
  "debited" — or came in — "credited"), the account extractor (VPA, or "to X" phrasing, or a UPI
  reference number), and method hints (clues about how the payment was made — card, UPI,
  net-banking, etc.); the `ParseResult` type; the test-corpus plan.
- **§24** — the 7-step `normalize()` algorithm (the account-name cleanup steps, see D30); a
  "worked" input→key table (concrete example inputs alongside the normalized key each one
  produces) including the §8 near-miss examples; the exact-match-only rule (see D30).
- **§25** — `resolveCategoryForAccount` (the categorizer **never guesses** — it only assigns a
  category to a transaction when the app has already learned one for that exact account; if not,
  the transaction is left Uncategorized rather than guessed at); the notification known-vs-new
  decision (see §31); the save/edit "upsert" semantics — "upsert" is a combined database
  operation meaning "update the row if it already exists, otherwise insert a new one" — which keep
  a previously learned category when a new save comes in Uncategorized (so a later blank save
  can't erase what was already learned); Uncategorized is represented in the database as
  `categoryId IS NULL` (a SQL condition meaning that column is simply empty/unset for that row).
- **§26** — an exact SQL (database query) + JS (follow-up JavaScript code) split for every F9
  metric — the spec states precisely how much of each calculation the database does directly
  versus how much is finished afterward in application code: core "aggregates" (summary numbers
  computed by combining many rows, like totals or counts); running balance (a continuously
  updated total that accumulates as each transaction is applied in date order); "MoM" (month-over-
  month) deltas (the change versus the previous month); grouping by category (an "Uncategorized"
  bucket catches transactions with no category); the largest 5 transactions in the period; a
  daily series (one number per day across the period) built partly in JS with "zero-fill" (days
  with no transactions are explicitly recorded as 0 rather than skipped, so charts don't show
  gaps); the mean, divided by "days-elapsed" (the number of days that have actually passed so far,
  not the full period length, so a mid-month average isn't misleadingly diluted); the median (the
  middle value once everything is sorted — a different kind of "typical value" than the average)
  of the zero-filled series; an "arc fill clamp" (restricting how much of a circular arc-shaped
  chart gets drawn, so a value can't overflow or underflow the artwork); "outlier scaling" (a rule
  for adjusting the chart's scale so one unusually large value doesn't visually squash all the
  normal ones); and Week mode (ISO week, compared against the previous ISO week — see D31).
- **§27** — `formatMoney` (Indian-style grouping, thin-space sign, paise shown only when
  non-zero — see D31); `formatWhen` / `formatDayHeader` (functions that turn a raw timestamp into
  a human-friendly display string, e.g. "Today", "Yesterday", or a date); the period/boundary
  helper functions (`dayIndex`, `monthPeriod`, `isoWeekPeriod`, `previousPeriod`, `stepPeriod`)
  that figure out which day/week/month a given date falls into and step forward/backward between
  periods; the Undo constants + flow (implemented with **no scheduled database timer** — the
  short "undo grace period" is checked opportunistically rather than via a background countdown,
  tying into the soft-delete + purge-on-launch approach of D26); the running-balance helper.

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
(§18.6) for `expo-file-system` (Expo's library for reading/writing files on the device) +
`expo-sharing` (hands a file off to the phone's native "share" menu). Ticked Phase 2 in
`SPEC/IMPLEMENTATION-PLAN.md` §3.

### Decisions locked (now D26–D28 in `SPEC-implementation.md` §1)

| # | Decision |
|---|---|
| D26 | **Undo = soft-delete (`transaction.deletedAt`) + purge-on-launch** (~60 s grace). A "soft-delete" means a deleted transaction isn't actually erased from the database — it's just marked deleted by setting a `deletedAt` timestamp — so it can still be recovered, which is what makes an "Undo" button possible. "Purge-on-launch" is a cleanup step that runs every time the app starts, which permanently removes anything that's been soft-deleted for longer than the ~60-second "grace period" (the undo window). **`suggestion` dismiss = hard `DELETE`** — dismissing a suggestion (a transaction the app detected automatically but hasn't been confirmed yet) performs a real, permanent SQL `DELETE`, with no undo. `suggestion.status` only ever has two possible values, `pending` or `confirmed` (`confirmed` rows are kept for ~24 h to correctly route a tap on a now-stale notification, then purged). |
| D27 | **Search = FTS5 external-content `transaction_fts` + AFTER INSERT/UPDATE/DELETE sync triggers**, shipped as a hand-written migration. A database "migration" is a versioned, ordered script that changes the database's structure — e.g. adding a table or column — so that everyone's database can be upgraded step-by-step and in the same order; most migrations here are auto-generated by `drizzle-kit`, but this one was hand-written because the change was too complex for the auto-generator. "FTS5" is SQLite's "Full-Text Search" extension, version 5 — it lets you search text fields the way a search engine does, by matching whole words/phrases quickly, rather than just checking if one string literally contains another. "External-content" is an FTS5 mode where the search index just references the real table's data instead of duplicating it, to save space. A database "trigger" is a small piece of logic that the database runs automatically whenever a row is inserted, updated, or deleted; here, triggers fire "AFTER INSERT/UPDATE/DELETE" to keep the search index in sync with the real `transaction` table every time it changes. SDK 57's `expo-sqlite` ships with FTS5 support switched on by default via its `enableFTS` build flag (verified in the v57 docs). Fallback (a backup plan used if FTS5 turns out to be unavailable): a maintained `searchText` column searched with plain SQL `LIKE` (a basic, less-smart substring-match operator that works everywhere). |
| D28 | **Money = INTEGER paise end-to-end**, zero float. Every money value, everywhere in the system — database, business logic, UI — is stored and passed around as a whole-number count of paise (1 rupee = 100 paise), never as a fraction/decimal rupee amount. This is "zero float": a "float" (floating-point number) is the usual way computers represent numbers with a decimal point, but it can introduce tiny rounding errors — unacceptable for money math, so it's avoided entirely. Timestamps = INTEGER epoch-ms UTC — "epoch time" is a single large number counting milliseconds elapsed since a fixed reference point (1 Jan 1970); "UTC" means it isn't tied to any timezone. Converting that raw number into a user-facing "today"/"this week"/"this month" in the user's own timezone happens separately, in a domain helper (a utility function living in the app's pure business-logic layer, `src/domain`). IDs = `expo-crypto` UUID text — a UUID ("Universally Unique Identifier") is a long, randomly generated ID value effectively guaranteed never to collide with any other one, used here as each row's primary key instead of simple auto-incrementing numbers; `expo-crypto` is the library that generates them. Enums (fields restricted to one of a fixed, named set of allowed values, e.g. a transaction type that can only be "credit" or "debit") are stored as plain TEXT, with Drizzle (the database toolkit used here, see the stack list in Phase 1) providing compile-time guards that stop anything but an allowed value from ever being written. |

### Open sub-questions — resolved

- **Undo backing** → soft-delete + purge-on-launch (user-confirmed).
- **Suggestion dismiss** → hard delete (user-confirmed); `status` drops the `dismissed` value.
- **FTS5 availability** → present in SDK 57 by default (`enableFTS`); FTS5 is the primary path,
  `LIKE` is the documented fallback.
- **No-float pipeline** → confirmed as D28.

### Shape of what was specified

- **§19** — the final table (a database table is like a spreadsheet: a named set of rows sharing
  the same columns) list: `transaction`, `category`, `account_rule` (using a "natural primary
  key" — the column that uniquely identifies each row — built from the real `normalizedKey` value
  itself, rather than an arbitrary auto-generated ID number), `suggestion`, `app_setting` (a
  simple "KV", or Key-Value, table — each row is just a setting name paired with its value),
  `transaction_fts` (the FTS5 search table, see D27). For every field: its type / whether it can
  be null (empty) / its default value / explanatory notes; every "index" (a structure that speeds
  up looking up rows by a particular column, the database equivalent of a book's index) defined;
  the `account_rule` upsert SQL (see D25's gloss of "upsert"); and the §19.0 conventions block
  (the naming/style rules followed consistently across every table).
- **§20** — one `openDatabaseSync` handle (the single connection object the app uses to talk to
  its SQLite database) opened with WAL mode ("Write-Ahead Logging" — a SQLite mode that improves
  reliability and lets reads/writes happen more concurrently, by writing changes to a log file
  first), foreign keys turned on (a database setting that enforces relationships between tables —
  e.g. it stops a transaction from pointing at a category that doesn't exist), and
  `enableChangeListener` (lets app code subscribe to be notified live whenever the underlying data
  changes, so the UI can auto-refresh); the migration workflow: `drizzle-kit generate` (a
  command-line tool that automatically writes migration files by diffing the desired schema
  against the current one) → the generated migrations are committed to git → bundled into the
  app → run via a `useMigrations` hook inside a `<MigrationGate>` component that holds "first
  paint" (the very first thing shown on screen) until they finish; a migration-error screen for
  failures (which deliberately does **not** wipe the database — a failed migration doesn't mean
  lost data); the **headless task** (background code with no visible screen — see §31's gloss
  further up) **runs `ensureMigrated()` before any write**, a check-and-wait step that guarantees
  migrations have finished even if the background SMS task fires before the main app UI has ever
  been opened — this resolves an item left open back in Phase 1; an "idempotent" seed (an
  operation safe to run more than once because repeating it has no extra effect) that inserts 10
  starter category rows with proposed Lucide icons, using `ON CONFLICT(key) DO NOTHING` (a SQL
  clause meaning "skip silently if a row with this key already exists" rather than erroring);
  purge-on-launch (see D26); Clear-all-data; and data Export as JSON+CSV files via
  `expo-file-system` + `expo-sharing`.
- **§21** — a repository API (a "repository" is a design pattern: the one layer of code allowed
  to talk directly to the database, so the rest of the app calls clean functions instead of
  writing SQL everywhere) per entity (per data type/table), listing for each method: what it
  does, what kind it is, which screen it backs, and whether it's safe to call from a headless
  background task. `*Sync` variants (synchronous versions — ones that run to completion
  immediately rather than needing an awaited round-trip) exist for the specific paths the SMS-
  detection and notification-response background tasks use; screens instead use live `use*` hooks
  — React hooks (reusable pieces of component logic, conventionally named starting with `use`)
  built on Drizzle's `useLiveQuery`, which automatically re-runs a query and updates the screen
  whenever the underlying data changes; `analyticsRepo` is written as raw SQL (written directly
  as SQL text rather than through Drizzle's usual helper functions, since the calculations are
  complex — the actual statements are given in §26).
- **§22** — three "state tiers" (categories of where the app's live data is held, each with
  different rules): (1) SQLite-derived state — the database is the **only** source of truth, with
  **no "optimistic cache"** (a common UI trick where a screen immediately shows a guessed result
  before real confirmation arrives, to feel faster — deliberately not used here: the UI always
  waits for and reflects the real database state); (2) 6 Zustand (a small state-management library
  for React, listed in the Phase 1 stack) "ephemeral" stores — ephemeral meaning temporary,
  in-memory only, wiped when the app restarts, never written to disk: `draft` (an in-progress,
  unsaved transaction being edited), `keypad` (the on-screen number-pad's state), `filter draft`
  (in-progress filter selections not yet applied), `onboarding` (progress through first-run
  setup), `sheet registry` (which bottom sheet is currently open, see D32), and `undo` (the
  pending-undo state); (3) `app_setting` persisted prefs — settings that *do* need to survive a
  restart, saved in the database's `app_setting` key-value table instead of in memory. Permission
  status (e.g. whether SMS-reading permission is granted) is always read live, fresh, straight
  from the OS — never cached as a saved true/false flag, so it can't silently go stale if the
  user changes it in their phone's settings later. A "cross-context update" (keeping data in sync
  when it's written from one execution context, like a background task, while read from another,
  like the open app screen) works via a chain: a headless background write → `expo-sqlite` fires
  a change event → `useLiveQuery` notices and re-runs, refreshing the screen automatically.

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
| D22 | **Source layout: feature-first** — the codebase is organized primarily by product feature (e.g. everything to do with "Analytics" lives together) rather than purely by technical layer. Feature code (`src/features/*`) sits alongside shared, feature-agnostic layers: `src/ui` (shared UI building blocks), `src/domain` ("pure TS" — plain TypeScript logic with no side effects or platform dependencies, i.e. calculations that don't touch a screen or the network and could run anywhere), `src/db`, `src/services`, `src/stores`. A one-way dependency rule keeps the shared layers generic and reusable: `ui`/`domain`/`db` are never allowed to import from `features` (only the reverse is allowed). |
| D23 | **SMS-while-killed: native manifest `BroadcastReceiver` → headless JS task.** "SMS-while-killed" is the scenario where a new SMS arrives while the app isn't running at all — not even in the background — "killed" being the state where Android has fully shut it down. The fix is a native manifest `BroadcastReceiver`: a small piece of native Android code, registered in the app's manifest file, that the Android OS itself will wake up and run automatically whenever a matching system event happens (here, a new SMS arriving) — even with the app fully killed. That receiver's only job is to hand off to a "headless JS task" (JavaScript code that runs in the background with no screen visible); all the actual parsing, database writes, and notification posting happen in JS from there. The alternative, `expo-background-task` (a different Expo API for scheduling background work), was rejected because it has a 15-minute minimum scheduling interval (a "floor" on how often it can run — too infrequent for near-instant SMS detection) and its scheduled jobs stop entirely once the app is fully killed. |
| D24 | **Notification `Save` while killed: all-JS headless notification-response task.** Tapping "Save" on a notification while the app is fully killed is handled the same way — by another headless JS task, with no native code involved beyond the SMS-receiving bridge itself. This deliberately keeps the custom native module's job to exactly one thing — "SMS receiver bridge only" — everything else stays in JavaScript. |
| D25 | **Sheets = root-mounted `@gorhom` `SheetRegistry`, not `expo-router` modal routes; custom tab bar, not `NativeTabs`** (`@gorhom` is the third-party library providing the bottom-sheet component used here; "modal routes" would be the alternative approach of treating each sheet as just another navigable screen within `expo-router` — rejected in favor of the imperative `SheetRegistry` approach described under D32. `NativeTabs` is Expo's own built-in tab-bar component — see root `CLAUDE.md` — not flexible enough for the custom look wanted here, described as a raised centre "Add" **FAB** — Floating Action Button, a prominent raised button, usually circular, that floats above the normal layout — sitting in a "notch" (a cut-out shape in the tab bar making room for it) next to a greyscale pill-shaped element; iOS support for any of this is Future scope, not built now). |

### Stack pinned (see §16 for rationale + rejected alternatives)

- **Data:** `expo-sqlite ~57.0.2` (Expo's build of the SQLite on-device database engine) ·
  `drizzle-orm 0.45.2` (Drizzle — the ORM/database toolkit that lets the app describe its tables
  and queries in TypeScript instead of writing raw SQL by hand) · `drizzle-kit 0.31.10` (dev — the
  companion command-line tool that generates migration files, dev-only, not shipped in the app)
- **State:** `zustand 5.0.15` (a small, minimal state-management library for React; used here only
  for "ephemeral" — temporary, in-memory-only — data, see §22); anything that needs to persist
  across app restarts goes into a SQLite `app_setting` KV table instead
- **UI infra:** `@gorhom/bottom-sheet 5.2.14` (the bottom-sheet component library behind
  `SheetRegistry`, D25) · `@shopify/flash-list 2.0.2` (a high-performance scrolling-list
  component, built to handle long lists smoothly) · `react-native-svg 15.15.4` (draws scalable
  vector graphics, used for `<AppBackground>` and charts) · `d3-shape 3.2.0` / `d3-scale 4.0.2`
  (parts of D3, a well-known data-visualization toolkit; "shape" generates chart geometry like
  arcs and lines, "scale" maps raw data values onto pixel positions)
- **Detection:** `modules/coinflow-sms` (the custom in-repo Kotlin native module — Kotlin is the
  language Android native code is written in — that receives incoming SMS, see root `CLAUDE.md`)
  · `expo-notifications ~57.0.15` (Expo's API for posting and handling local/push notifications) ·
  `expo-task-manager ~57.0.14` (registers and runs the headless background tasks) ·
  `expo-dev-client ~57.0.16` (dev — lets the team build their own custom "dev client" app instead
  of using the generic Expo Go app, required because of the custom native module — see root
  `CLAUDE.md`) · `expo-build-properties ~57.0.15` (a config plugin for tweaking low-level native
  Android/iOS build settings from `app.json`)
- **Utils / obs:** `date-fns 4.4.0` (a date/time-manipulation library) · `expo-crypto ~57.0.2`
  (generates the random UUIDs used as row IDs, see D28) · `@sentry/react-native 8.24.0` (the
  crash reporter, see D34; final version pin confirmed in Phase 5)
- **Testing:** `jest-expo 57.0.5` (the Jest test-runner preset for Expo, see D35) ·
  `@testing-library/react-native 14.0.1` (RNTL, for testing rendered components, see D35) ·
  Maestro (external — the E2E test tool, installed separately rather than as an npm package, see
  D35)
- **Rejected:** `expo-background-task` (rejected for the reasons in D23 — its 15-minute scheduling
  floor and dying when the app is killed); NativeWind/Tamagui (alternative styling systems);
  TanStack Query (a popular data-fetching/caching library — not needed since there's no network
  and SQLite is the live source of truth); Redux/Jotai (other state-management libraries,
  alternatives to Zustand); WatermelonDB (an alternative on-device database, passed over in
  favor of SQLite + Drizzle); Victory/Skia (charting/graphics libraries, passed over in favor of
  hand-rolled SVG + D3); Luxon (a date/time library, alternative to `date-fns`); Detox (the
  rejected E2E tool, see D35); `react-native-mmkv` (a fast key-value storage library, passed over
  in favor of the SQLite `app_setting` table)

### Risks flagged for install-time re-verification (§16.7)

These are known compatibility risks that couldn't be fully settled on paper — they needed
confirming once the real packages were actually installed and run (hence "install-time
re-verification"):

- `@gorhom/bottom-sheet@5` vs `react-native-reanimated@4.5.1` + "worklets" (small pieces of
  animation code that Reanimated runs on a separate, faster thread than the main JS thread, so
  animations stay smooth even while JS is busy) on React Native's "New Architecture" (a rebuilt
  internal engine for how native and JS code talk to each other — a newer foundation than the
  older "legacy" architecture)
- `@shopify/flash-list@2.0.2` vs React 19.2 — needing a "recycling" smoke test on 2,000 rows
  ("recycling" is how scrolling lists stay fast: reusing the same on-screen row components for
  different data as you scroll, instead of creating a brand new one per row; a "smoke test" is a
  quick basic check that nothing is fundamentally broken)
- Drizzle's `useLiveQuery` (see §21/§22) working correctly over `expo-sqlite`'s change-listener
  mechanism on SDK 57
- Whether FTS5 (see D27) is actually present in the `expo-sqlite` build used for search — with
  `LIKE` as the documented fallback; **this was decided in Phase 2**

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
- **2026-09-01** — Researched the v57 background-execution story (per `AGENTS.md`):
  `expo-background-task` (built on Android's WorkManager — a system designed for deferred,
  batched background work, not real-time responses) has a **15-minute minimum interval** and
  **does not run when the app is killed** — unusable for the SMS core loop, which needs to react
  to an SMS arriving in near-real-time even with the app fully closed. This confirms D18's
  direction (a decision from the earlier Phase 0, referenced here but made before this log
  starts): a manifest-registered native `BroadcastReceiver` (see D23) is the "wake trigger" — the
  thing that causes Android to wake up and run code in response to the SMS event — and headless
  JS does the actual work from there.
- **2026-09-01** — Resolved the three Phase 1 open sub-questions with the user (see decisions below).
