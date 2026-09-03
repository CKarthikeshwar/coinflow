# CoinFlow — Implementation Specification

> **Scope.** Features, workflows, product rules, data model, and system behavior — everything that
> is **not** a screen or a visual element (those are in `SPEC-UI-UX.md`). Screen references below
> use the names and section numbers from that document.
>
> **Status: FROZEN (v1) — 2026-09-01.** Part I (§1–§15, product / behavior) and Part II
> (§16–§35, technical design per `SPEC/PLAN.md` §8) are complete and consistent with
> `SPEC-UI-UX.md` (v1 frozen) and `SPEC/idea.md`. `SPEC/IMPLEMENTATION-PLAN.md` Phases 0–5 are
> done. From here, a change is a change-request (`SPEC/PLAN.md` §10) — update the spec first, then
> the implementation — logged in §37. See §36 for the final-review pass.
>
> **Traceability target** (`SPEC/PLAN.md` §9): `UI-0xx` (visual, in `SPEC-UI-UX.md`) and `IMP-0xx`
> (behavior, §13 here) → component / service → test.

---

## Contents

**Product / behavior (§1–§15 — groundwork, frozen enough to build on):**
§1 Decisions log · §2 Product definition · §3 Feature specification · §4 User journeys ·
§5 Product & behavior rules · §6 Data model (sketch) · §7 SMS detection & parsing ·
§8 Account memory & categorization · §9 Analytics computation · §10 Notifications behavior ·
§11 Permissions & platform · §12 Persistence & data management · §13 Behavioral acceptance
criteria (IMP-0xx) · §14 Future scope · §15 Open questions

**Technical (§16+ — written across `SPEC/IMPLEMENTATION-PLAN.md` Phases 1–5, all done):**
§16 Technology stack · §17 System architecture · §18 Project structure *(Phase 1)* ·
§19 Data models (final) · §20 Persistence & migrations · §21 Data-access layer · §22 Application
state *(Phase 2)* · §23 SMS parsing · §24 Account normalization · §25 Categorization ·
§26 Analytics computation · §27 Formatting / time / undo / running balance *(Phase 3)* ·
§28 Navigation · §29 Component architecture · §30 Screen specs *(Phase 4)* · §31 Notifications ·
§32 Error handling · §33 Security & privacy · §34 Testing strategy · §35 Build & release *(Phase 5)* ·
§36 Specification status *(freeze)* · §37 Change log (post-freeze)

---

## 1. Decisions log

| # | Decision | Rationale |
|---|---|---|
| D1 | **Navigation:** 4 bottom tabs — Home, Transactions, Analytics, Settings — plus a visually distinct center **Add** button that opens a sheet and is not a destination. | Keeps the review surfaces + Settings always reachable; manual add is one tap from anywhere. |
| D2 | **Home hero:** a **running balance = Σ all income − Σ all expenses** (primary, labelled "Total balance", no month). Below it, **Income** and **Spending** as two **non-interactive tiles**, each showing **this month's** total and its **percent change vs last month**. The balance is a *computed net over all recorded transactions*, **not** an account balance read from SMS — CoinFlow still never parses "Avl Bal" text. The top-bar month scopes the tiles, not the balance. | Ref `1.png`. The running net is the "how am I doing overall" number; the month tiles + MoM deltas give the trend at a glance. Both derive cleanly from stored transactions. |
| D3 | **Platform:** V1 is **Android-only**. | SMS auto-detection is the core value and is realistically Android-only; iOS is Future. |
| D4 | **Review queue:** detected transactions land in an in-app **pending inbox**; notifications are shortcuts into it, never the only path. | A missed notification must never lose a transaction. |
| D5 | **Payment method:** fixed enum — `UPI`, `Card`, `Cash`, `Bank transfer`, `Wallet`. No user-configured accounts in V1. | Lowest friction; user-defined accounts are Future. |
| D6 | **Transaction types in the V1 UI:** **Expense** and **Income** only. Transfer, Refund, Reimbursement, Split are **Future**. | User decision. The data model still carries `type` — see P-8. |
| D7 | **Onboarding:** three steps — value prop → permission priming (SMS + notifications) → default-category review. No name / currency / balance setup. | Enough to make detection work and let the user trim categories; nothing more. |
| D8 | **Duplicates:** handled **manually** — the user spots and deletes duplicates from the Transactions list. No auto-detection in V1. | Keeps V1 simple; heuristic de-dup is Future. |
| D9 | **Currency:** INR (`₹`) only, hard-coded; Indian digit grouping. | India UPI context; multi-currency is Future. |
| D10 | **Storage / auth:** on-device only — no account, no login, no cloud sync in V1. | `SPEC/PLAN.md` §8. |
| D11 | **Analytics period:** calendar **month** is primary; a **week** view is also available. Custom ranges are Future. | `SPEC/idea.md` §9 centers on "a month". |
| D12 | **No colour.** The UI is black / white / grey only — no accent, no semantic hue, no colour-coded categories. Direction is the `+`/`−` sign; category identity is name + icon. | User decision. See `SPEC-UI-UX.md` §2 / V-11. |
| D13 | **Counterparty = Account** (reintroduced; "merchant" renamed). Optional field: the payee / payer — a name or a UPI address (`swiggy@paytm`). It is **not** the row label (the Note is) and is **not** shown on transaction cards; it appears on Details and in the Add/Edit/Confirmation sheets, is searchable, and **drives auto-categorisation memory** (F8, keyed on the normalized account → `AccountRule`). When a detected transaction has no note yet, the card label falls back to the account, then to "No note". | User decision (revises the earlier "no merchant" call). The account is what makes learning possible; keeping it off the card keeps rows clean. |
| D14 | **Analytics period: Month *and* Week both ship in V1.** Confirms D11. Week reuses the month aggregation; the technical spec (Phase 3) fixes ISO-week boundaries and the comparison wording. | User decision. Resolves §15 Q5. |
| D15 | **No "exclude from totals" toggle in V1** — deferred to a later version. V1 accepts the P-8 inaccuracy (self-transfers count as spending); the model keeps `type` for real Transfer / Refund types later. | User decision. Resolves §15 Q1 / Q6 (toggle part). |
| D16 | **Settings › Account rules screen ships in V1** with read + edit + delete. Lowest build priority. | User decision. It is the only window into F8's behaviour; silent-only is frustrating when it learns wrong. Resolves §15 Q3. |
| D17 | **Export = JSON full backup + CSV transactions.** JSON = transactions + custom categories + account rules; CSV = transactions only. **No import / restore in V1** (Future). | User decision. Resolves §15 Q4. |
| D18 | **SMS pipeline: JS-owned, thin native bridge.** A small local Expo module (Kotlin) registers the SMS broadcast receiver and forwards messages to a headless JS / `TaskManager` task; **all** parsing, DB writes, notification posting and notification-action handling are in JS/TS. A hybrid (native posts the notification itself) is the documented contingency, adopted only if field testing shows dropped events. | User decision. One testable codebase for parsing. |
| D19 | **Persistence: `expo-sqlite` + Drizzle ORM** (typed schema, generated migrations, live queries; raw SQL for analytics). On-device only (D10). | User decision. Rejected: hand-written SQL, WatermelonDB. |
| D20 | **Distribution: direct install** — EAS-built APK, side-loaded or via EAS internal distribution. **Not** the Play Store, so `READ_SMS` / `RECEIVE_SMS` is not a policy problem. Play Store + an SMS-less fallback build = Future. | User decision. Matches `SPEC/idea.md`'s "creator's own everyday use case". |
| D21 | **Security: baseline + crash reporting only.** Baseline (always on): app-private storage, `android:allowBackup=false`, no network. **Added:** crash reporting — stack traces only, no breadcrumbs from financial screens, no transaction / SMS content, no PII, with a Settings opt-out. **Not in V1** (Future): biometric / PIN app lock, SQLCipher DB encryption. | User decision. P-9 amended for the carve-out. |
| D22 | **Source layout: feature-first.** `src/features/*` own their screens + hooks + local components, over shared `src/ui` (design-system primitives), `src/domain` (pure TS business logic — parser, analytics, formatters), `src/db` (Drizzle), `src/services` (notifications, SMS bridge, headless tasks), `src/stores` (Zustand). `ui` / `domain` / `db` never import from `features`. | Phase 1. Keeps the SMS pipeline cohesive; keeps business logic RN-free and unit-testable. See §18. |
| D23 | **SMS-while-killed pipeline: native manifest receiver → headless JS.** A Kotlin `BroadcastReceiver` registered in `AndroidManifest.xml` (via the config plugin) fires on `SMS_RECEIVED` even when the app is terminated and starts a **headless JS task**; **all** parsing, the DB write and the notification post run in JS/TS. `expo-background-task` is **rejected** for this path — its WorkManager scheduling has a 15-minute floor and does not run when the app is killed. | Phase 1. Confirms D18. Contingency (native posts a provisional notification) documented in §17, not built. |
| D24 | **Notification `Save` while killed: all-JS headless task.** The `expo-notifications` background response handler (a TaskManager task) spins up headless JS, reads the `AccountRule` via Drizzle, and writes the `Transaction` — no rule-matching or SQLite logic duplicated in Kotlin. The native module's surface stays "SMS receiver bridge only". | Phase 1. Preserves D18's "one testable codebase". If the rule was deleted between post and tap, the action deep-links into the Confirmation sheet instead of writing blind. |
| D25 | **Sheets are a root-mounted `@gorhom/bottom-sheet` registry, not `expo-router` modal routes; the tab bar is custom, not `NativeTabs`.** Add / Edit / Confirmation / Filter / Category-picker / Create-Edit-Category are opened imperatively from a `SheetRegistry` mounted once in the root layout. | Phase 1. §6.4's docked keypad + collapse-on-scroll + dirty-discard + OS-keyboard swap need one controlled sheet host; the raised centre **Add** "FAB notch" (§8) isn't expressible with `unstable-native-tabs`, and iOS is Future. |
| D26 | **Undo = soft-delete + purge-on-launch.** `transaction.deletedAt` (nullable); delete sets it, Undo clears it, every read filters `deletedAt IS NULL`, and rows are hard-purged on next launch once past a ~60 s grace. **`suggestion` dismiss is a hard `DELETE`** — `suggestion.status` is `pending` \| `confirmed` only (`confirmed` kept ~24 h for stale-tap routing, then purged). | Phase 2. Survives an app-kill mid-window; keeps delete/restore as ordinary writes reachable from any context. See §19.1 / §19.4 / §20.6. |
| D27 | **Search = FTS5 external-content table + sync triggers.** `transaction_fts` over `note` / `description` / `account`, kept in sync by AFTER INSERT/UPDATE/DELETE triggers, shipped as a hand-written migration. SDK 57 `expo-sqlite` has `enableFTS` on by default. Fallback if a device lacks FTS5: a maintained `searchText` column + `LIKE`. | Phase 2. See §19.6. |
| D28 | **Money is INTEGER paise end-to-end** (parse → store → `SUM()` → format); zero floating-point in the money pipeline. Timestamps are INTEGER epoch-ms UTC with local-day/week/month math in a domain helper (P-11). IDs are `expo-crypto` UUID `text`; enums are `text` with Drizzle enum guards. | Phase 2. Resolves the §6-sketch ambiguity. See §19.0. |
| D29 | **Parser = hybrid, no confidence score.** Data tables for the sender seed + keyword sets + VPA shapes; code for assembly. Output is a `ParseResult` discriminated union (`transaction` with `parsedFlags` + `warnings`, or `ignored` with a `reason`). `occurredAt` is the SMS timestamp — **no in-body date parsing** in V1. The sender seed is a curated, code-versioned constant (not a table, not user-editable); expansion is Future. | Phase 3. See §23. The corpus fixture file is the primary unit-test asset. |
| D30 | **Account matching is exact `normalizedKey` equality only in V1.** The normalization algorithm (§24.1) lower-cases, strips punctuation / `*` / trailing ref-order digits / company suffixes, and preserves VPA structure. Residual near-misses create separate rules — accepted. No fuzzy / substring / ML. | Phase 3. See §24. |
| D31 | **Analytics Week-mode comparison target = the previous ISO week**, tiles labelled "Last week" (Month mode unchanged: previous calendar month, "Last month"). Resolves D14. Recorded as **CR-1** against `SPEC-UI-UX.md` §6.10 / `UI-055` (wording only — no layout change). Money formatting: hand-rolled Indian grouping (not `Intl`), paise only when non-zero, thin-space sign. | Phase 3. See §26.7 / §27.1 and `SPEC-UI-UX.md` §9. |
| D32 | **`SheetRegistry` API + custom tab bar + one Reduce-Motion hook.** Root-mounted `SheetRegistryProvider` inside `BottomSheetModalProvider`; imperative `open(name, params)` / `close()` / `requestClose()` (dirty-guarded via the draft stores, V-6); one `<SheetHost>` `BottomSheetModal` switches its child on `current`. `CoinFlowTabBar` is a custom `tabBar` (raised centre **Add** opens `sheets.open('add')`), not `NativeTabs`. `useReducedMotion()` + `resolveMotion()` feed the reanimated motion factories — not per-component checks. | Phase 4. Confirms D25. See §28.2 / §28.4 / §29.5. |
| D33 | **`theme.ts` rewrite + `<AppBackground>` + Lucide wrapper.** `Colors.dark` = the §3.1 ramp (`Colors.light` mirrors it, V1 dark-only); `use-color-scheme` pins `'dark'`. `CategoryPalette` (9 hues) is scoped to the Analytics "Where it went" only (V-11). `<AppBackground>` draws the §3.1 radial ground with `react-native-svg` `<RadialGradient>` (`expo-linear-gradient` fallback). `Fonts.sans='Geist'` / `Fonts.display='Manrope'` (weights 400/500/600/700 + Manrope 300 for the clock). `src/ui/icon.tsx` wraps `lucide-react-native` at `strokeWidth 1.6`; default-category glyphs per §29.2. `ThemedText`/`ThemedView` move to `src/ui/` with the §3.2 roles / §3.1 surfaces. | Phase 4. See §29.1–§29.3. §16 addendum: `lucide-react-native`, `expo-linear-gradient`. |
| D34 | **Crash reporting = Sentry, opt-in (default OFF).** `@sentry/react-native ~8.24.0` + the Expo config plugin; `Sentry.init()` runs **only** when `app_setting.crashReportingEnabled === true` (defaults `false`), so nothing transmits and the About-screen "data stays on this device" line stays literally true — no onboarding disclosure. `tracesSampleRate 0`, `sendDefaultPii false`; `beforeSend` + `beforeBreadcrumb` scrub via `scrubText()` and **fail closed** (drop the event if a currency / VPA / long-digit pattern survives); navigation breadcrumbs on financial routes are dropped. Allowed payload = exception name + scrubbed message/stack + OS/app version + op name + counts/enums, nothing else. Source maps + R8 mapping uploaded on the `production` profile only; DSN in `app.json → extra`. | Phase 5. P-9 amendment (D21). See §33.4 / §32.1. |
| D35 | **Testing = Jest + RNTL + Maestro; release = direct-install, R8 + Hermes + console-strip.** `jest-expo` unit tests on `src/domain` (the SMS parser corpus fixture file is the centrepiece + acceptance bar for F1); RNTL per-screen tests for the V-3 skeleton/empty/error states; **Maestro** YAML flows for J2 (core loop) / J4 (manual add) / J9 (delete-undo) against an EAS `development` build — **not Detox**. CI = `tsc --noEmit` + `expo lint` + `jest` only (no native build / emulator / Maestro). Release: EAS `production` (autoIncrement, remote `appVersionSource`), R8/ProGuard + resource shrink via `expo-build-properties`, `console.*` stripped in prod, distributed as a signed APK via EAS internal distribution (no Play track, D20). `test-id` convention `screen:element`; traceability grid contract in §34.4. | Phase 5. See §34 / §35. |

Technical decisions (stack, architecture layers, project structure) and the phased plan for
completing this document live in `SPEC/IMPLEMENTATION-PLAN.md`.

---

## 2. Product Definition (condensed)

- **Problem:** manually recording every transaction is tedious, so people stop; existing apps feel
  slow and complicated.
- **Users:** college students, young adults, people who recently started working — frequent
  digital payments (UPI / bank / card), want to understand spending, want fast and simple.
- **Value proposition:** *"I don't track my expenses. CoinFlow does it for me."* CoinFlow reads
  transaction SMS as they arrive, turns them into pre-filled suggestions the user confirms in one
  or two taps, and **remembers each account's note + category** so repeat payments become one tap.
- **Core principle:** the user should record as little as possible; never ask for what the system
  can infer; make confirming a detected transaction extremely fast.

Full product scope: `SPEC/idea.md` (authoritative, treated as settled).

---

## 3. Feature specification

Priority: **P0** core loop · **P1** useful V1 · **P2** V1 if time allows.

### F1 — Automatic transaction detection · P0
- **Trigger:** an SMS arrives from a sender matching CoinFlow's transaction patterns.
- **Behavior:** any SMS from a matching sender that fits the transaction format → parse it →
  create one **Suggestion** in the pending queue → post a notification (F2). **No confidence
  scoring** — if it fits the format it goes through and the user decides (Discard, or Add). Nothing
  is written to the ledger.
- **Extracted fields:** direction (debit / credit), amount, date/time, **account / counterparty**
  (VPA, "to <name>", "at <name>"), payment method (when inferable). The raw SMS text is parsed in
  memory and **not stored** (P-9); only a `source: sms` marker plus the sender label and received
  time are kept.
- **Dependencies:** SMS read permission; notification permission (for F2 only).
- **Edge cases:** partial parse (amount only); non-transaction SMS from a bank sender (OTP,
  promo); account not present in the message; foreign-currency SMS → not parsed, logged for
  Future; SMS while app is killed; device time ≠ SMS timestamp; two SMS for one payment (bank +
  UPI app) → two Suggestions (D8); balance-only / request-money SMS → ignored.

### F2 — Transaction notification · P0
- **This is the core loop.** One notification per new Suggestion — **title** = amount + direction
  (`₹450 debited`), **body** = the parsed **account** + method (`Swiggy · UPI`; "Unknown account"
  when it didn't parse). The **action set depends on whether the parsed account matches a saved
  `AccountRule` (F8):**
  - **Known account — three actions:**
    1. **`Save`** — writes the transaction immediately: amount + date + account from the
       SMS; **note + category + payment method** copied from the rule. No sheet opens. (Label is
       plain **`Save`** when the rule has a category but no stored note.)
    2. **`Add`** — opens the **Confirmation sheet**, pre-filled from the rule (all fields still
       editable), for a fresh note / a full review.
    3. **`Discard`** — dismisses the Suggestion; writes nothing.
  - **New account (no rule) — two actions:** **`Add`** · **`Discard`**. There is deliberately no
    one-tap save until the account has been given a note at least once.
  - **Body tap** (anywhere but the buttons) → the Confirmation sheet (same as `Add`).
  - 2+ pending collapse into a group (`N transactions to review` → Review Queue); the group has no
    per-item actions.
- **Edge cases:** notification permission denied → no notification, no error (queue + Home badge
  are the fallback); a known account whose rule note was later cleared → falls back to plain
  **`Save`** (category only), or to the two-action form when there is no category either; tap on a
  stale notification whose Suggestion was already confirmed → open that transaction's Details;
  already dismissed / deleted → open Home.

### F3 — Transaction confirmation · P0
- **Behavior:** the user reviews the parsed fields as shown — **no confidence markers**, every
  field plainly editable — fixes anything wrong (amount via the **custom in-app numeric keypad**
  docked in the sheet; category via the category-picker sheet), adds a **note** / **description**,
  and taps **Add** → the transaction is written; the Suggestion leaves the queue; if the
  transaction has an **account**, its `AccountRule` is upserted with the note, category and
  payment method just used (F8). `Detect → Review → Add → Done`.
- **Edge cases:** a sparse parse (amount only) just means more fields to fill; no note → the card
  label falls back to the account, then "No note"; account absent → no rule is written, category
  stays Uncategorized unless set; cancel → Suggestion remains pending; amount `₹0` or
  `> ₹10,00,000` → requires an extra confirm.

### F4 — Manual transactions · P0
- **Behavior:** the user records a transaction with no SMS. Amount is entered on the **custom
  in-app numeric keypad** docked in the sheet. Required: amount, direction (Expense / Income).
  Optional (with defaults): payment method (UPI), category (Uncategorized for Expense; n/a for
  Income), date/time (now), **account** (free text with a past-account autocomplete — picking a
  known account pre-fills its remembered note + category, F8), **note** (short label),
  **description** (longer, optional).
- **Edge cases:** amount 0 / empty → blocked with inline validation; future-dated → allowed,
  flagged; a very long note truncates in lists; saved with no note → lists show the account, else
  "No note".

### F5 — Transaction list · P0
- **Behavior:** a reverse-chronological record grouped by day. Search matches note + description +
  account. Filter by category, type, payment method, date range. Open a row → Details, where every
  field can be reviewed and edited (Edit sheet, §6.6 / §30.8). Swipe →
  delete (confirm + Undo, ~5 s window).
- **Edge cases:** zero transactions (empty state); thousands (virtualized); same-second
  transactions (stable order by insertion); a day with only income.

### F6 — Categories · P1
- **Defaults:** Food, Transport, Shopping, Entertainment, Education, Bills, Groceries, Health,
  Other. **Other** is the protected catch-all (cannot be deleted). **Uncategorized** is a system
  state, not a user category, and is not editable.
- **Behavior:** create / rename / re-icon / delete custom categories (no colour — D12). Deleting a
  category moves its transactions to **Uncategorized**.
- **Icon set:** *Resolved (D33, `SPEC-UI-UX.md` §3.4) — **Lucide** (`lucide-react-native`), wrapped
  by `src/ui/icon.tsx` at `strokeWidth 1.6`, covers the 9 defaults + Uncategorized + income + the 5
  payment methods + app chrome (§29.2). No longer open.*
- **Edge cases:** duplicate name → blocked; deleting a category used by many transactions →
  confirm names the count; name length capped (~24 chars).

### F6.5 — App shell & Home · P0
- **Behavior:** the piece every other screen assumes exists and, until now, no feature owned:
  the `(tabs)` navigation shell — custom `CoinFlowTabBar` (D25/D32, §28.1/§29.4) with its raised
  centre **Add** — and the real **Home** screen (§30.4), replacing the template's flat
  `src/app/index.tsx` stub and F4's temporary bolted-on "Add transaction" button. Home shows: the
  **balance hero** (all-time running balance, D2, §26.2); the **Income / Spending** stat tiles
  (this month's totals + MoM delta, §26.3); the **action strip** (`N to review` → Review Queue,
  F11; `N uncategorized` → Transactions filtered, F7); **Recent** (≤ 8 transaction cards, F5's
  card component, "See all" → Transactions); the permission banner (V-9) when SMS or
  notifications are off.
- **Dependencies:** F3/F4 (the Add sheet the centre button opens), F5 (the transaction card
  component Recent reuses), F11 (the pending count), the §21.5/§26 analytics aggregates (already
  spec'd in Phase 2/3, consumed here regardless of whether F9's own Analytics screen has shipped
  yet — the data-access layer isn't gated behind that screen).
- **Edge cases:** per §30.4 — new-user zero state (`₹0` hero, `₹0` tiles + "no prior month", no
  action strip, Recent → its own empty state); a lakh-scale balance must not wrap or shrink
  illegibly; a negative balance shows a leading `−`; a tile with no previous-month figure shows
  "—"; counts show `99+` past 99; long notes truncate; an all-income month is valid.

### F7 — Uncategorized handling · P1
- **Behavior:** with no matching `AccountRule` (F8), a detected transaction's category =
  **Uncategorized** — never guessed. Uncategorized transactions **count toward spending totals**
  but are always surfaced (Home count,
  Analytics row / slice, list styling, a filter option) so the user can clear them.
- **Edge cases:** a large uncategorized backlog — Home shows the count; Analytics shows an
  "Uncategorized ₹X" entry with a shortcut to the filtered list.

### F8 — Account memory · P1
- **Behavior:** when a transaction is saved with an **account**, upsert an `AccountRule` keyed by a
  **normalized account string** (lower-case; strip punctuation, `*`, trailing reference / order
  numbers; collapse whitespace → `normalizedKey`), storing the **note**, the **category** (when
  not Uncategorized) and the **payment method** just used. The rule powers:
  - the **notification's one-tap `Save`** (F2) — a known account can be added without
    opening the sheet;
  - **pre-fill** on the next detection or manual add whose account matches (note + category +
    method, all still editable);
  - the **Add sheet's account autocomplete** (each row shows the remembered note / category).

  An edit updates the rule; **last write wins**; clearing the note clears `lastNote`. Rules are
  listed / editable in **Settings › Account rules**.
- **Edge cases:** account strings that vary between messages ("swiggy@paytm", "SWIGGY LTD",
  "swiggy*order123") — V1 matches on the normalized key only; near-misses create separate rules
  (acceptable for V1); no fuzzy / partial matching, no ML.

### F8.5 — Settings · P1
- **Behavior:** the **Settings tab** (§30.15) — a grouped list (**Categories** · **Payment
  methods** · **SMS & notifications** · **Account rules** · **Data** · **About**), each row
  pushing its subpage, app version in the footer — plus the four subpages not already owned by
  another feature (§30.16): **Payment methods** (static read-only list of the 5 methods);
  **SMS & notifications** (live permission status for SMS and Notifications, each with
  Enable / **Open system settings**, mirroring onboarding's permission card); **Data**
  (**Export** → JSON + CSV via the OS share sheet, D17 / IMP-043; **Clear all data** → a two-step
  `CONFIRM`-typed dialog → `clearAllData`, IMP-044 / IMP-065, then relaunch into onboarding);
  **About** (version, "All your data stays on this device.", licenses / help links). *(Settings ›
  Account rules is F8's own subpage, already specified there; the Settings › Categories row just
  deep-links to F6's existing Categories screen — neither is rebuilt here.)*
- **Edge cases:** SMS & notifications reflects **live** OS permission state, never a cached flag
  (§22.4); Clear all data is irreversible and returns to onboarding (P-3); an export failure
  (E17) shows a retry toast with nothing partially shared.

### F9 — Spending summary · P1
- **Behavior (per period; default current calendar month; week view available):** for the period —
  **Spent** (Σ expense), **Income** (Σ income), **Balance** = Income − Spent, **savings rate** =
  Balance ÷ Income, **spending by category** (grouped, sorted desc, Uncategorized included; % of
  spend; rendered in the category-colour palette), **largest individual expenses** (top ~5), a
  **daily spend series** (Σ expense per calendar day, drawn with a mean line), and the **mean** and
  **median** daily spend (tiles labelled "Mean" / "Median") — each computed for this period **and
  the previous month** for comparison.
- **Edge cases:** empty period (empty state); one category dominating the breakdown (list is not
  truncated; the "Day by day" chart scales to everyday spend and labels the outlier separately);
  no prior month → hide the "Last month" comparison values; current incomplete month → averages
  use days-elapsed; a **negative Balance** is shown with a leading `−` (the bar fills full).

### F10 — Insights · P2 · **DEFERRED (not on the V1 Analytics screen)**
- Auto-generated "Worth noting" sentences were planned for V1 but pulled from the screen. If
  revived: 2–4 rule-based observations from F9's aggregates (biggest category, biggest mover vs
  the previous period, savings rate, run-rate). Along with a "Top accounts" section and a run-rate
  projection, this is **Future** (§14).
- **Edge cases:** too little data → fewer cards or a "keep logging" message; never show
  contradictory or trivially-true statements.

### F11 — Review queue (pending inbox) · P0
- **Behavior:** a durable list of pending Suggestions, independent of notifications. A count badge
  appears on Home and the Home tab. Tapping a row opens **Confirmation**; a row whose account is
  **known** also shows an inline one-tap **`Save`** (same effect as the notification's,
  F2 / F8). **Dismiss** removes a row (never added); **Dismiss all** (confirm). Pull-to-refresh
  re-scans recent SMS (P2).
- **Edge cases:** dozens pending (Dismiss all); a Suggestion whose SMS was clearly not a
  transaction (Dismiss); app reopened after days (queue intact); reboot / killed app → queue and
  its notifications restored from storage.

### F12 — Onboarding & permissions · P1
- **Behavior:** (1) one value-prop screen; (2) permission priming for SMS read + notifications,
  each with a plain-language reason; (3) default-category review (toggle off unwanted ones;
  reorder optional). Then land on Home. No name / currency / balance step.
- **Edge cases:** permission denied → app works in manual mode with a persistent, dismissible
  banner (P-7); permission permanently denied → the Enable action deep-links to system settings;
  backgrounding mid-flow → resume on the same step.

---

## 4. User journeys

Notation: **⇢** step · **✔** success end · **✗** alternate / failure branch.

- **J1 — First-run setup.** ⇢ Launch → Welcome → Permissions: allow SMS, allow Notifications →
  Category review: uncheck *Education* and *Health* → Done → **✔ Home (empty state)**.
  ✗ Deny SMS → proceed → Home shows a persistent banner: "SMS detection is off — add
  transactions manually or enable SMS in Settings." Manual add still works.

- **J2 — Act on a detected transaction from the notification (the core loop).** User pays ₹450 ⇢
  bank SMS arrives ⇢ CoinFlow posts a lock-screen notification: **₹450 debited** / **Swiggy · UPI**.
  - **Known account** — rule `swiggy@paytm → note "Lunch", Food` → three actions
    **[Save] [Add] [Discard]**. Tap **Save** → transaction written (₹450,
    Swiggy, note "Lunch", Food), app never opened → **✔**. ✗ Different note this time → tap **Add**
    → Confirmation pre-filled ⇢ change note to "Team lunch" ⇢ **Add** → **✔**, the rule's note
    updates.
  - **New account** — no rule → two actions **[Add] [Discard]**. Tap **Add** → Confirmation ⇢ pick
    **Food**, note "Dinner" ⇢ **Add** → **✔** "Added ₹450 · Food"; rule
    `swiggy@paytm → note "Dinner", Food` is created.
  - ✗ Duplicate of a card SMS → **Discard**.

- **J3 — Clear the Review queue after missing notifications.** ⇢ Open app → Home shows
  **"5 to review"** ⇢ tap → Review Queue ⇢ open first → Confirmation → **Add** → back to queue
  ("4") ⇢ repeat ⇢ one item is a bank promo → **Dismiss** ⇢ **✔** queue empty, badge gone.

- **J4 — Manual cash transaction.** ⇢ Tap center **Add** → amount **20**, direction **Expense**,
  method **Cash**, category **Food**, time = now ⇢ **Add** → **✔** appears at the top of today in
  Transactions and in Home recent activity.
  ✗ Amount left blank → inline error "Enter an amount", submit blocked.

- **J5 — Fix an uncategorized transaction and teach CoinFlow.** Home shows **"3 uncategorized"**
  ⇢ tap → filtered list ⇢ open a row (account `namma-metro@upi`) → Details → **Edit** → category
  **Uncategorized → Transport** → **Save** → **✔** rule `namma-metro@upi` saved (Transport), Home
  count drops to "2"; the next Namma Metro SMS pre-fills Transport and its notification offers
  one-tap **Save**.
  ✗ Other path: a **Food** transaction is actually **Groceries** ⇢ Edit → **Groceries** → Save →
  rule updated (last write wins).

- **J6 — Correct a mis-parsed transaction.** Notification says `₹1,500` but the charge was `₹150`
  ⇢ tap **Add** to open Confirmation ⇢ edit amount to **150** ⇢ account "Local Kirana", category
  **Groceries**, note "Veg" ⇢ **Add** → **✔** rule `local kirana` saved (Groceries, note "Veg").

- **J7 — Review the month.** ⇢ Open **Analytics** ⇢ period = August ⇢ **"This month"** card:
  Balance **₹22,520**, arc "20% of income left" ⇢ **Mean** ₹1,240 (last month ₹1,410),
  **Median** ₹980 (last month ₹1,050) ⇢ **"Where it went"** (coloured): Bills 37%
  (top), … ⇢ **"Day by day"** with the dashed mean line ⇢ tap **Bills** → Transactions filtered to
  Bills + August → **✔**; tap a **Biggest expenses** row → Details.
  ✗ First month ever → no prior month → the "Last month" comparison values on the daily tiles are
  hidden.

- **J8 — Find a past transaction.** ⇢ Open **Transactions** ⇢ search "uber" (matches the account)
  ⇢ add **date range = last 30 days** ⇢ find the ₹240 ride ⇢ open Details → **✔**.

- **J9 — Delete a transaction, with undo.** ⇢ Swipe a duplicate row → **Delete** ⇢ confirm →
  row removed, snackbar "Deleted · **Undo**" ~5 s ⇢ tap **Undo** → **✔** restored.

- **J10 — Manage categories.** ⇢ Settings › Categories ⇢ **Add** "Subscriptions" (pick an icon)
  ⇢ rename "Bills" → "Bills & Rent" ⇢ delete custom "Misc" → confirm ("12 transactions become
  Uncategorized") → **✔**.

- **J11 — Handle a duplicate manually (D8).** Bank SMS *and* UPI-app SMS both produced
  Suggestions for the same ₹300 ⇢ confirm one, dismiss the other in the Review queue.
  ✗ Both already added ⇢ delete one from Transactions (J9).

- **J12 — Dismiss a misdetected non-transaction.** An OTP / promo SMS from a bank sender created
  a Suggestion ⇢ Review Queue → **Dismiss** → **✔** removed permanently. (Sender-level muting =
  Future.)

- **J13 — Re-enable SMS detection later.** User initially denied SMS ⇢ Settings › SMS &
  notifications ⇢ "SMS: Off" → **Enable** → OS dialog → Allow → **✔** Home banner disappears,
  detection starts for new messages.

---

## 5. Product & behavior rules

- **P-1 Confirmation before ledger write.** A detected transaction is **never** written to the
  ledger without an explicit user action (**Add** in the Confirmation sheet, or the P2 **Add
  now** quick action). **Dismiss** never adds.
- **P-2 Parsed values are suggestions.** Every field of every transaction — detected or manual —
  is editable at any time, before and after it is added.
- **P-3 Destructive actions.** Delete transaction / delete category / clear all data require a
  confirm step. Transaction delete is reversible via an Undo snackbar for ~5 s. Clear all data is
  a hard two-step confirm with no undo.
- **P-4 Errors are actionable.** State what happened and the next step ("Couldn't add. Try
  again."), never a raw error code.
- **P-5 Uncategorized is counted but visible.** Uncategorized transactions are included in
  spending totals and are always surfaced for the user to clear (see F7).
- **P-6 Learn from corrections.** Saving or editing a transaction with an **account** upserts its
  `AccountRule` — remembered note, category (when not Uncategorized) and payment method (F8); the next matching
  detection uses it; last write wins; rules are inspectable and editable in
  Settings › Account rules.
- **P-7 Degrade gracefully without permissions.** No SMS permission → detection off, manual entry
  fully functional, a persistent dismissible banner explains what is disabled and links to enable
  it. No notification permission → the Review queue + Home badge are the fallback channel.
- **P-8 V1 limitation — money movement vs spending.** V1 exposes only **Expense** and **Income**;
  it cannot mark a debit as a transfer or a refund, so a self-transfer counts as spending and a
  refund counts as income. This is a known, accepted V1 inaccuracy. **Requirement:** the
  Transaction model MUST include a `type` field (V1 values `expense` / `income`; reserved
  `transfer` / `refund` / `reimbursement`) so those types can be added later with no migration or
  recomputation of history. (`SPEC/idea.md` principle #9.)
- **P-9 Privacy.** SMS content and transaction data never leave the device in V1. No analytics
  SDK observing financial data. The **raw SMS text is never stored** — the parser reads the
  message in memory, extracts the fields, and discards the body; only the parsed fields, a
  `source` marker, and the sender / received time survive. **One sanctioned exception (D21):**
  crash reporting — stack traces only, no breadcrumbs from financial screens, no transaction /
  SMS content, no PII; controlled by a Settings opt-out. No other off-device transmission.
- **P-10 Single currency.** All amounts are INR; no currency selection or conversion;
  foreign-currency SMS are not parsed.
- **P-11 Time.** Local calendar-day boundaries are used for list day-grouping and for all period
  math (month / week). SMS timestamp is preferred; fall back to received time.

---

## 6. Data model (sketch — to be finalized in the technical spec)

- **Transaction**
  - `id`, `amountMinor` (integer, paise), `direction` (`debit` | `credit`),
    `type` (`expense` | `income`; reserved: `transfer` | `refund` | `reimbursement`),
    `categoryId` (nullable → Uncategorized), `paymentMethod` (enum, nullable),
    `account` (string, nullable — payee / payer; drives F8), `note` (string, nullable — the row
    label), `description` (string, nullable — longer detail),
    `occurredAt`, `createdAt`, `updatedAt`,
    `source` (`manual` | `sms`), `smsRef` (nullable → `{ sender, receivedAt }` — **no raw text**;
    the SMS body is never persisted, P-9).
- **Category** — `id`, `name`, `icon`, `isDefault`, `isProtected` (Other), `order`. No `colour`
  (D12).
- **AccountRule** — `normalizedKey`, `displayAccount`, `lastNote` (string, nullable), `categoryId`
  (nullable), `lastPaymentMethod` (enum, nullable), `hitCount`, `updatedAt`.
- **Suggestion** — `id`, parsed fields, `smsRef` (`{ sender, receivedAt }` — no raw text),
  `createdAt`, `status` (`pending` | `dismissed` | `confirmed`),
  `confirmedTransactionId` (nullable). Parsed fields are amount, direction, occurredAt, account,
  paymentMethod. **No confidence field** — a Suggestion that fits the format is shown as-is.

`type` is present from day one even though only `expense` / `income` are user-selectable (P-8).

---

## 7. SMS detection & parsing

- Android broadcast receiver on incoming SMS. Match `sender` against a maintained set of
  bank / UPI sender patterns (DLT header IDs, common short-codes). Non-matching senders are
  ignored entirely.
- Extraction targets: direction (debit / spent / paid vs credited / received keywords), amount
  (currency-prefixed number), date/time (message timestamp), **account / counterparty** (VPA /
  UPI handle, "to <name>", "at <name>"), and payment-method hints (`UPI`, `card`,
  `IMPS`/`NEFT`/`RTGS` → `Bank transfer`, wallet names → `Wallet`). The message is parsed in
  memory only; its body is **not persisted** — just the sender and received time (P-9).
- **No confidence scoring.** Any message that fits the transaction format produces a Suggestion;
  the user vets it through the notification (Discard / Add) or the Review Queue. Fields that did
  not parse are simply left blank for the user to fill.
- Explicitly ignored: OTP messages, promotional messages, balance-only alerts, collect / request
  money requests, foreign-currency amounts.
- One qualifying SMS → one Suggestion. No cross-message de-duplication in V1 (D8).
- The receiver still runs when the app is killed: it creates the Suggestion, persists it, and
  posts the notification.

---

## 8. Account memory & categorization

- **Normalization** of an account string: lower-case; strip punctuation, `*`, and trailing
  reference / order numbers; collapse whitespace → `normalizedKey`.
- **On new detection (or a picked autocomplete account):** if an `AccountRule` matches
  `normalizedKey`, pre-fill its **note + category + payment method** and (in the notification)
  offer one-tap **`Save`**; else category = Uncategorized, note blank, no quick-save (never
  guess — `SPEC/idea.md` §7).
- **On save / edit** of a transaction with an **account**: upsert its `AccountRule` —
  `hitCount++`, store `note` → `lastNote`, `paymentMethod` → `lastPaymentMethod`, and `categoryId`
  when it is not Uncategorized; bump `updatedAt`. **Last write wins**; a cleared note clears
  `lastNote`.
- No fuzzy / partial matching, no ML in V1.

---

## 9. Analytics computation

- **Period:** local calendar **month** (default) or ISO **week**; the stepper moves by one
  period. Custom ranges are Future.
- **Spent** = Σ `amountMinor` of `type = expense` transactions with `occurredAt` in the period.
  **Income** = Σ of `type = income`.
- **Balance (period)** = Income − Spent for the period (may be negative). Shown in the Analytics
  "This month" card. *(The **Home hero** shows a different figure — the all-time running balance,
  D2 — not this period value.)*
- **This month's Income / Spending + MoM change** (Home tiles, D2): the period Income and Spent,
  each with `(this − prev) ÷ prev` vs the previous calendar month, shown as a signed percentage
  with a trend glyph; "—" when there is no previous-month figure.
- **Savings rate** = Balance ÷ Income (omit when Income = 0). The Analytics **arc-gauge fill** =
  Balance ÷ Income (share of income **remaining**), captioned "N% of income left"; clamps to 0
  when Spent ≥ Income (a negative balance shows an empty arc).
- **By category** = group `expense` transactions by `categoryId` (Uncategorized included), sorted
  by amount desc; each entry carries its share of Spent. Rendered with the fixed category-colour
  palette (`SPEC-UI-UX.md` §3) — the only coloured surface in the app.
- **Largest expenses** = top ~5 `expense` transactions by `amountMinor` in the period.
- **Daily series** = Σ `expense` `amountMinor` per local calendar day in the period → the
  "Day by day" line, drawn with a **dashed mean line** (= average daily spend). The y-scale is set
  from the everyday days; a single-day outlier (e.g. rent) is drawn clipped and labelled rather
  than compressing the rest.
- **Average daily spend** = Spent ÷ days (elapsed for the current month; in-period otherwise),
  computed for **the current period and the previous month** (shown as "Last month ₹…").
- **Typical daily spend** = median of the daily series, likewise for the current period **and the
  previous month**.
- **Not in the V1 Analytics screen (Future):** a standalone period-over-period delta line, a
  "Top accounts" breakdown, a run-rate projection, and auto-generated insight cards (F10). The
  period comparison in V1 is carried entirely by the "Last month" values on the two daily tiles.

---

## 10. Notifications behavior

- Post one notification per new `pending` Suggestion; when 2+ are pending, collapse into a group
  ("N transactions to review").
- Actions (F2): **known account** → `Save` (write from the rule + parsed amount/date,
  mark `confirmed`), `Add` (open Confirmation), `Discard` (mark `dismissed`); **new account** →
  `Add`, `Discard`. Body tap → Confirmation sheet.
- Stale tap: Suggestion already `confirmed` → open that transaction's Details;
  `dismissed` / underlying transaction deleted → open Home.
- Notification permission off → do not post; no error. Review queue + Home badge cover it (P-7).
- Notifications and pending Suggestions survive reboot / process death (restored from storage).

---

## 11. Permissions & platform

- **Android only** (D3). Permissions used: `READ_SMS` / `RECEIVE_SMS`, `POST_NOTIFICATIONS`.
- Per-permission states: *not requested* / *granted* / *denied* / *denied-permanently* → the
  Enable action routes to the system app-settings screen.
- No permission is mandatory. Manual mode (F4, F5, F6, F9, F10) is fully functional without any
  permission.

---

## 12. Persistence & data management

- **Local, on-device store only** in V1 (concrete choice deferred to the technical spec). No
  cloud, no account, no login (D10).
- **Export** (Settings › Data): a file offered through the OS share sheet containing all
  transactions. *(Open questions: CSV vs JSON vs both; whether custom categories + account rules
  are included; whether import / restore is in V1 for device migration.)*
- **Clear all data:** wipes transactions, suggestions, account rules, and custom categories;
  resets default categories; returns the user to onboarding. Irreversible.

---

## 13. Behavioral acceptance criteria (IMP-0xx)

`Status` starts **Pending**; updated during implementation. Visual acceptance is `UI-0xx` in
`SPEC-UI-UX.md` §7.

### Detection · Notification · Queue
| ID | Criterion | Status |
|---|---|---|
| IMP-001 | A qualifying SMS creates exactly one pending Suggestion and writes nothing to the ledger. | Pending |
| IMP-002 | A non-qualifying SMS (OTP, promo, balance-only, request-money, non-matching sender) creates no Suggestion. | Pending |
| IMP-003 | A single-transaction notification shows amount + direction + account. For a **known account** it offers **`Save`** (writes immediately from the rule: note + category + method), **`Add`** (opens Confirmation pre-filled) and **`Discard`**; for a **new account** it offers only **`Add`** and **`Discard`**. A body tap opens Confirmation. No confidence indicator anywhere. | Pending |
| IMP-004 | With 2+ pending Suggestions, notifications are delivered as one group that opens the Review queue (no per-item Add / Discard on the group). | Pending |
| IMP-005 | Adding a Suggestion (via Confirmation or the notification's `Save`) writes the transaction, removes it from the queue, and — when the transaction has an account — upserts its `AccountRule` with the note, category and payment method used. | Pending |
| IMP-006 | Cancelling the Confirmation sheet leaves the Suggestion pending. | Pending |
| IMP-007 | Dismissing a Suggestion (queue or notification) removes it permanently and adds nothing. | Pending |
| IMP-008 | Amount `₹0` or `> ₹10,00,000` requires an extra confirm before it can be added. | Pending |
| IMP-009 | Suggestions and their notifications survive an app kill / device reboot. | Pending |

### Transactions · Categories
| ID | Criterion | Status |
|---|---|---|
| IMP-010 | A manual transaction requires a non-zero amount and a direction; all other fields have working defaults. | Pending |
| IMP-011 | Choosing Income omits the category (no category is stored / required). | Pending |
| IMP-012 | The transaction record always includes a `type` field, even though only Expense/Income are selectable. | Pending |
| IMP-013 | Editing a transaction that has an account upserts its `AccountRule` (note + category + payment method); last write wins; a cleared note clears `lastNote`. | Pending |
| IMP-014 | A repeated detection from a known account pre-fills the learned note + category, and its notification offers the one-tap `Save`. | Pending |
| IMP-015 | Search matches on note, description, and account; filters apply category, type, payment method, and date range together. | Pending |
| IMP-016 | Deleting a transaction is reversible via Undo for at least 5 seconds. | Pending |
| IMP-017 | The default category set is exactly the nine from `SPEC/idea.md`; "Other" cannot be deleted. | Pending |
| IMP-018 | Deleting a custom category reassigns its transactions to Uncategorized. | Pending |
| IMP-019 | Duplicate category names are rejected. | Pending |
| IMP-020 | Uncategorized transactions are included in spending totals. | Pending |

### Analytics
| ID | Criterion | Status |
|---|---|---|
| IMP-030 | Analytics defaults to the current calendar month and can step to other months and to a week view. | Pending |
| IMP-031 | Spent counts only `expense`-type transactions; Income only `income`-type; both scoped to the period. | Pending |
| IMP-032 | The "Mean" and "Median" daily-spend tiles each show the current value and the previous-month value; the "Last month" value is omitted when there is no prior month. | Pending |
| IMP-033 | The "Where it went" breakdown includes Uncategorized as its own (hatched) entry and is the only place category colours are used. | Pending |
| IMP-034 | Tapping a category in "Where it went" opens Transactions filtered to that category + period; tapping a "Biggest expenses" row opens Details. | Pending |
| IMP-035 | For the current (incomplete) month, average daily spend uses days elapsed; typical daily spend is the median of the daily series. | Pending |
| IMP-036 | The "Day by day" chart draws a dashed mean line at the average daily spend, labelled. | Pending |
| IMP-037 | The "This month" card shows Balance = Income − Spent (negative with a leading `−`) inside a continuous circular arc whose fill = Balance ÷ Income (share of income remaining; empty arc when Spent ≥ Income). | Pending |
| IMP-038 | The V1 Analytics screen has no "Top accounts", no run-rate, and no auto-insight cards (F10 deferred — §14). | Pending |

### Permissions · Platform · Data
| ID | Criterion | Status |
|---|---|---|
| IMP-040 | With SMS permission denied, manual entry and all non-detection features work, and a persistent banner explains detection is off with a link to enable it. | Pending |
| IMP-041 | With notification permission denied, detection still fills the Review queue and the Home badge. | Pending |
| IMP-042 | A permanently-denied permission's Enable action opens the system settings screen. | Pending |
| IMP-043 | Export produces a shareable file containing all transactions. | Pending |
| IMP-044 | Clear all data removes transactions, suggestions, account rules, and custom categories, and returns to onboarding. | Pending |
| IMP-045 | No transaction or SMS data is transmitted off the device. | Pending |

---

## 14. Future scope (documented, not built in V1)

- **Transaction types:** Transfer, Refund, Reimbursement — with exclusion from spending totals and
  refund-offsets-expense logic (model already carries `type` — P-8).
- **V1.5 — Split expenses & settlements:** mark an expense as shared; compute your share; track
  who owes you; associate incoming payments as settlements; manual split; heuristic split
  detection (`SPEC/idea.md` V1.5).
- **User-defined accounts:** replace the payment-method enum with real accounts / cards;
  account-to-account transfers; per-account views.
- **Auto-categorization beyond exact match (F8):** bulk "apply to all from this account", fuzzy /
  partial account matching, a built-in starter keyword map.
- **Duplicate detection:** heuristic pairing of bank + UPI-app SMS with a merge suggestion.
- **Historical SMS import:** opt-in backfill of past transactions.
- **Budgets & goals; recurring-transaction detection; richer insights.**
- **Analytics — pulled from V1, revive later:** a "Top accounts" breakdown (by summed spend +
  payment count, from the `account` field), a month-end **run-rate projection**, and the
  auto-generated **"Worth noting" insight cards** (F10).
- **iOS app:** no SMS detection — manual entry + notifications only; needs its own onboarding and
  a graceful-degradation design.
- **Cloud sync / backup / account & login; multi-currency; sender-level muting of misdetections;
  data import / restore.**

---

## 15. Open questions

1. **Transfers with no type available (P-8).** *Resolved (D15): no "exclude from totals" toggle in
   V1 — deferred to a later version. V1 accepts the inflated spending total; the model keeps
   `type` for real Transfer / Refund types later.*
2. *(Resolved: no confidence scoring. The notification vets every detection through
   **Discard / Add**; for a **known account** it also offers one-tap **`Save`** that
   writes from the `AccountRule` without opening the sheet. A **new account** gets **Add / Discard**
   only — the first transaction for an account must pass through Confirmation so it gets a note.
   The Review Queue mirrors this.)*
3. **Account rules screen (F8, Settings › Account rules).** *Resolved (D16): ships in V1 with
   read + edit + delete; lowest build priority.*
4. **Export.** *Resolved (D17): JSON full backup (transactions + custom categories + account
   rules) + CSV (transactions only). No import / restore in V1.*
5. **Week view (D11).** *Resolved (D14): Month **and** Week both ship in V1.*
6. **"Exclude from totals" toggle.** *Resolved (D15) — see Q1. (Also resolved earlier: Analytics
   run-rate / Top accounts / insight cards are deferred — §14; current-month average daily spend
   uses days elapsed.)*
7. **Duplicate handling (D8):** manual-only stands for V1 (D8); revisit only if Phase 3 parser
   work surfaces a reason. Low priority.
8. **Technical spec (`SPEC/PLAN.md` §8).** *Resolved — §16–§37 are written and **frozen (v1,
   2026-09-01)**. `SPEC/IMPLEMENTATION-PLAN.md` Phases 0–5 are done; decisions D18–D35 cover the
   stack, architecture, data, business logic, navigation, notifications, error handling, security
   and testing/release. See §36 for the final-review pass.*

---

# Part II — Technical specification

> Written phase by phase per `SPEC/IMPLEMENTATION-PLAN.md`. **Phase 1 (§16–§18) is complete.**
> §19+ are placeholders until their phase runs. Nothing here may contradict §1–§15,
> `SPEC-UI-UX.md`, or `SPEC/idea.md` — a conflict is a change-request (`SPEC/PLAN.md` §10).

## 16. Technology stack

Runtime is fixed by the repo and **not reopened here**: `expo ~57.0.18` · `react-native 0.86.3` ·
`react` / `react-dom 19.2.3` · `expo-router ~57.0.17` · `typescript ~6.0.3` · TS `strict` ·
`experiments.reactCompiler` + `typedRoutes` on. Every added library below was checked against the
**Expo SDK 57** bundled-module set and the v57 docs (per `AGENTS.md`); versions are re-verified
with `npx expo install` at the start of feature work.

### 16.1 Already in the repo (kept, no CoinFlow-specific change in Phase 1)

| Package | Version | Used for |
|---|---|---|
| `expo` | `~57.0.18` | framework |
| `react-native` | `0.86.3` | runtime (new architecture only) |
| `react`, `react-dom` | `19.2.3` | — |
| `expo-router` | `~57.0.17` | routing (app entry `expo-router/entry`) |
| `react-native-reanimated` | `4.5.1` | motion (§3.5) — sheet, snackbar, list rows |
| `react-native-worklets` | `0.10.1` | reanimated 4 peer; `scheduleOnRN` |
| `react-native-gesture-handler` | `~2.32.0` | sheet drag, swipe-to-delete; `@gorhom` peer |
| `react-native-safe-area-context` | `~5.7.0` | insets (§3.3) |
| `react-native-screens` | `~4.26.0` | native stack |
| `expo-font` | `~57.0.2` | bundled Manrope + Geist (§3.2) |
| `expo-splash-screen` | `~57.0.8` | `AnimatedSplashOverlay` (unchanged) |
| `expo-constants`, `expo-linking`, `expo-status-bar`, `expo-system-ui` | `~57.x` | chrome, deep-link URL parsing |
| `react-native-web` | `~0.21.0` | web static export only — **carries no CoinFlow feature** (D3) |

`@expo/ui`, `expo-glass-effect`, `expo-symbols`, `expo-image`, `expo-web-browser`,
`expo-device` are present from the template; keep only what a screen actually uses (audited in
Phase 4). `expo-symbols` (SF Symbols) is iOS-only and superseded by Lucide (§3.4) — a candidate
for removal.

### 16.2 Added — data & state

| Package | Version | Rationale | Rejected |
|---|---|---|---|
| `expo-sqlite` | `~57.0.2` | on-device store (D19); exposes a **sync** API usable from the headless task and an async/reactive API for the UI | AsyncStorage (not relational), `react-native-mmkv` (adds a second store for no gain — a SQLite KV table covers prefs) |
| `drizzle-orm` | `0.45.2` | typed schema, generated migrations, `useLiveQuery` reactive reads over `expo-sqlite`; raw SQL still available for analytics (D19) | hand-written SQL (boilerplate, manual migrations); WatermelonDB (heavy sync engine, unused); Prisma (no RN target) |
| `drizzle-kit` | `0.31.10` | **devDependency** — migration generation from the schema | — |
| `zustand` | `5.0.15` | ephemeral UI state only — sheet drafts, keypad buffer, filter draft, onboarding step, the sheet registry | Redux / Redux Toolkit (ceremony), Jotai (atom sprawl for this size), React context (re-render cost on the keypad) |

**Persisted preferences** (`onboardingDone`, `bannerDismissed`, category-order override,
`crashReportingEnabled`) live in a SQLite `app_setting` key/value table, not a separate storage
engine — the headless task can read them synchronously through `expo-sqlite`. Finalised in §22.

### 16.3 Added — UI infrastructure

| Package | Version | Rationale | Rejected |
|---|---|---|---|
| `@gorhom/bottom-sheet` | `5.2.14` | every sheet (§6.4–§6.12); only this can do the docked keypad + collapse-on-scroll + swipe-to-dismiss-with-discard-confirm + the keypad↔OS-keyboard swap (§3.5) | native modal / `expo-router` modal routes (can't coordinate the keypad/keyboard transition); `react-native-modalize` (less maintained on new arch) |
| `@shopify/flash-list` | `2.0.2` | the Transactions ledger — 2,000+ rows (§6.7); v2 is new-arch native | `FlatList` (jank at scale), `@legendapp/list` (newer, less proven) |
| `react-native-svg` | `15.15.4` | the bespoke greyscale arc gauge, donut, day-by-day line + dashed mean line, outlier clipping (§6.10) — Expo-pinned version | — |
| `d3-shape` | `3.2.0` | arc / line / area path generators for the charts | — |
| `d3-scale` | `4.0.2` | linear / band / time scales for the charts | full `d3` (drags in DOM modules); Victory / `react-native-skia` (too heavy for four static charts) |
| `@types/d3-shape`, `@types/d3-scale` | `3.2.0`, `4.0.9` | **devDependencies** | — |

Lucide (`lucide-react-native`, §3.4) is added in **Phase 4** with the `theme.ts` rewrite (it is a
design-system concern, not foundations); noted here so §16 stays the single dependency list.

### 16.4 Added — platform & detection

| Package | Version | Rationale |
|---|---|---|
| `coinflow-sms` (local Expo module) | in-repo, `modules/coinflow-sms/` | the Kotlin `BroadcastReceiver` + config plugin (D18 / D23); Android-only, no npm publish. Surface detailed in §17.6 |
| `expo-notifications` | `~57.0.15` | posting the transaction notification, notification **categories** (the Save / Add / Discard action buttons), and the **background response handler** (`TaskManager`) that writes from the rule while the app is killed (D24) |
| `expo-task-manager` | `~57.0.14` | `defineTask` for `SMS_INGEST_TASK` and `NOTIFICATION_RESPONSE_TASK`; the headless-JS host |
| `expo-dev-client` | `~57.0.16` | **devDependency** — `READ_SMS` / `RECEIVE_SMS` + a custom native module ⇒ **Expo Go cannot run this app**; `npm run android` needs a `development` build or `expo run:android` |
| `expo-build-properties` | `~57.0.15` | config-plugin knobs — `android:allowBackup=false` (D21), min/target SDK, R8/ProGuard for release (finalised in §33 / §35) |

**Not used:** `expo-background-task` / `expo-background-fetch` — WorkManager scheduling has a
**15-minute minimum interval** and **does not execute when the app is killed** (v57 docs), so it
cannot back the SMS core loop. The manifest-registered native receiver (§17.1) is the wake
trigger instead.

### 16.5 Added — utilities & observability

| Package | Version | Rationale | Rejected |
|---|---|---|---|
| `date-fns` | `4.4.0` | period math, ISO-week boundaries (D14), relative-vs-absolute dates (V-2), local calendar-day helpers — tree-shakeable | Luxon (heavier), `Temporal` polyfill (premature), moment (legacy) |
| `expo-crypto` | `~57.0.2` | `randomUUID()` for entity ids; the SMS dedupe-key hash (§17.4) | `uuid` + `react-native-get-random-values` (extra shim) |
| `@sentry/react-native` | `~7.11.0` + its Expo config plugin (`@sentry/react-native/expo`) — **was `~8.24.0` at freeze; corrected at install time to the version `npx expo install` pins for SDK 57 (CR-2, §37)** | crash reporting, scrubbed per D21 — stack traces only. **Confirmed in Phase 5 (D34 / §33.4): opt-in, default OFF — `Sentry.init()` runs only when `crashReportingEnabled` is true.** | GlitchTip (self-host burden), Bugsnag, minimal local crash log — all considered in Phase 5; no crash reporting at all (D21 chose to add it) |

### 16.6 Added — testing & tooling (devDependencies)

| Package | Version | Rationale |
|---|---|---|
| `jest-expo` | `57.0.5` | Jest preset for SDK 57 — the parser corpus, normalization table, analytics math, formatter, period math, undo (`SPEC/PLAN.md` §8) |
| `@testing-library/react-native` | `14.0.1` | the V-3 state tests per screen (Phase 5 / §34) |
| Maestro | external CLI (not npm) | one E2E flow — J2 core loop (§34); lighter than Detox |
| `eslint-config-expo` (via `expo lint`) + `prettier` | — | keep the repo's organize-imports-on-save (`.vscode/settings.json`) |

### 16.7 Dependency risks to re-verify at install time

- `@gorhom/bottom-sheet@5` against `react-native-reanimated@4.5.1` + `react-native-worklets` on
  the new architecture — v5 targets Reanimated 3; confirm no worklet-API breakage, else pin the
  last known-good v5 patch.
- `@shopify/flash-list@2.0.2` against React 19.2 — v2 is new-arch native; smoke-test recycling on
  a 2,000-row fixture.
- `drizzle-orm` live queries over `expo-sqlite` change notifications on SDK 57 (the
  `useLiveQuery` hook depends on `expo-sqlite`'s `addDatabaseChangeListener`).
- FTS5 availability in the `expo-sqlite` build (search, §6.7) — fallback is a normalized column +
  `LIKE`; **decided in Phase 2 (§20)**.

---

## 17. System architecture

### 17.0 Layer overview

```
                         ┌─────────────────────────────────────────────┐
   Android OS  ──SMS──▶   │  coinflow-sms  (Kotlin, manifest receiver)  │   runs even when
                         │  onReceive: sender + body + ts → headless    │   the app is KILLED
                         └───────────────────────┬─────────────────────┘
                                                 │ starts
                                                 ▼
   ┌──────────────────────────────────────────────────────────────────────────────┐
   │  Headless-JS task layer  (expo-task-manager, defined at module scope)         │
   │    SMS_INGEST_TASK            parse → gate → dedupe → Suggestion → notify     │
   │    NOTIFICATION_RESPONSE_TASK Save / Add / Discard while app killed (D24)     │
   └───────────────┬───────────────────────────────────────────┬──────────────────┘
                   │ uses                                      │ uses
                   ▼                                           ▼
   ┌───────────────────────────────┐          ┌──────────────────────────────────┐
   │  Domain layer  (pure TS,      │          │  Services                        │
   │  no react-native imports)     │          │   notifications.ts  (channels,   │
   │   parser/                     │◀────────▶│    categories, post, route)      │
   │   normalize · categorize      │          │   sms.ts  (native-module wrapper)│
   │   analytics/ · format/        │          │   sentry.ts                      │
   │   period · running-balance    │          └──────────────────────────────────┘
   │   dedupe                      │
   └───────────────┬───────────────┘
                   │ used by both the tasks and the UI
                   ▼
   ┌──────────────────────────────────────────────────────────────────────────────┐
   │  Data layer   Drizzle schema · one shared expo-sqlite handle ·               │
   │               repository modules per entity · bundled migrations             │
   └───────────────┬───────────────────────────────────────────┬──────────────────┘
        sync API   │ (headless tasks)         async + live query│ (UI)
                   ▼                                           ▼
   ┌──────────────────────────────┐          ┌──────────────────────────────────┐
   │        SQLite (on device)    │          │  UI layer  expo-router routes    │
   └──────────────────────────────┘          │   → repository live queries      │
                                             │   → Zustand (sheet/keypad/filter │
                                             │      drafts) → SheetRegistry     │
                                             └──────────────────────────────────┘
```

**Rules.** (1) The domain layer imports nothing from `react-native`, `expo-*`, or `features/` —
it is the unit-test surface. (2) Every write path reachable from a headless task
(`insertTransaction`, `upsertAccountRule`, `insertSuggestion`, `setSuggestionStatus`) is a plain
function in the data layer, called identically from the UI — no logic forks between "acted on
while killed" and "acted on in-app". (3) The native module does **no** parsing, DB access, or
notification work in the default design (§17.5 is the contingency).

### 17.1 The native wake trigger

`coinflow-sms` registers a `<receiver>` in `AndroidManifest.xml` (injected by its config plugin)
for `android.provider.Telephony.SMS_RECEIVED`, `android:exported="true"`,
`android:permission="android.permission.BROADCAST_SMS"`. Android delivers this broadcast to a
manifest-declared receiver **even when the app process is not running**, which is why the core
loop does not depend on `expo-background-task` (§16.4).

`SmsReceiver.onReceive` has a short window (~10 s) and does only: pull the PDUs, coalesce a
multipart message into one body, read `sender` / `body` / `timestampMs`, then start a bounded
**headless JS task** (`HeadlessJsTaskService` / the `expo-task-manager` task host) with that
payload as data. It never touches SQLite or `expo-notifications`. The body string is handed to JS
in memory and is **never written to disk by the native side** (P-9).

### 17.2 The headless-JS task layer

Both tasks are registered with `TaskManager.defineTask(...)` at **module scope** in
`src/services/tasks/index.ts`, which is imported at the very top of the app entry (before
`expo-router` mounts) so the definitions exist whether the JS context was started by the UI or by
a background trigger (v57 requirement).

- **`SMS_INGEST_TASK`** — input `{ sender, body, receivedAt }`. Steps: §17.3.
- **`NOTIFICATION_RESPONSE_TASK`** — registered as the `expo-notifications` background response
  handler. Fires for the `Save` / `Add` / `Discard` action buttons and body taps that arrive
  while the app is killed. Steps: §17.4 walkthrough (b).

Time budget: aim < 5 s wall time per run (cold-start JS parse + `expo-sqlite` open is the bulk).
No network, no image work, no analytics recompute in a task. If a task throws, it is caught at
the top level, logged **without** the SMS body / amount / account / any PII, and returns cleanly
— **the receiver and the task must never crash the app** (§32 will formalise the matrix).

### 17.3 `SMS_INGEST_TASK` steps

1. **Sender gate.** Match `sender` against the curated bank / UPI sender seed
   (`src/constants/sms-senders.ts`, finalised in §20/§23). No match → return, nothing created.
2. **Parse.** The domain parser returns a `ParseResult` (fields + which parsed). No confidence
   score (§7).
3. **Transaction gate.** Apply the explicit ignore rules — OTP, promotional, balance-only,
   collect / request-money, foreign-currency (§7). Fail → return.
4. **Idempotency / retry guard.** Compute `dedupeKey = sha256(sender + '|' + amountMinor + '|' +
   floor(occurredAt / 60000) + '|' + direction)`. If a `Suggestion` **or** `Transaction` already
   carries that key, return. This guards against the OS re-delivering the broadcast or the task
   being retried after a mid-run kill — it is **not** cross-message de-duplication: a bank SMS and
   a UPI-app SMS for the same payment have different senders / bodies and intentionally produce
   two Suggestions (D8).
5. **Write the Suggestion.** Insert `Suggestion(status = pending, smsRef = { sender, receivedAt },
   dedupeKey, parsed fields)`. Discard `body`. One DB transaction.
6. **Rule match.** Look up `AccountRule` by `normalizedKey` of the parsed account (may be absent).
7. **Notify.** Post via `expo-notifications`: the **known-account** category (`Save` · `Add` ·
   `Discard`) when a rule with a category exists, else the **new-account** category (`Add` ·
   `Discard`). If ≥ 2 Suggestions are now `pending`, post / update the **group summary**
   (`N transactions to review` → Review Queue) instead of individual notifications (§10).
8. **Self-heal.** Before returning, if any older `pending` Suggestion has no live notification
   (a previous run inserted the row but was killed before step 7), re-post for it. The durable
   Review Queue (F11) is the ultimate fallback if notifications are off or this never runs.

### 17.4 Data-flow walkthroughs

**(a) An SMS arrives while the app is killed.**
OS broadcasts `SMS_RECEIVED` → `SmsReceiver.onReceive` (process spun up for the receiver) →
starts the headless task with `{ sender, body, receivedAt }` → JS context boots (no UI) →
`SMS_INGEST_TASK` runs §17.3 → Suggestion is durably in SQLite and a notification (or group
summary) is posted → JS context torn down. If the user never taps the notification, the
Suggestion is waiting in the Review Queue at next app open (P-7).
*Partial-run recovery:* the Suggestion write (step 5) is one transaction; if the task dies before
step 7, step 8 on the next SMS — or the Review Queue on next open — surfaces it. If it dies
before step 5, that physical SMS is lost for detection (same category as "app not installed yet";
acceptable — nothing was ever in the queue to lose).

**(b) The user taps `Save` on the notification while the app is killed.**
`expo-notifications` routes the action to `NOTIFICATION_RESPONSE_TASK` → headless JS boots, the
app stays closed → load the `Suggestion` by id from the notification payload → **re-match**
`AccountRule` by `normalizedKey` (the rule may have changed since the notification was posted) →
in **one DB transaction**: insert `Transaction` (amount + `occurredAt` from the Suggestion; `note`
+ `categoryId` + `paymentMethod` from the rule; `source = sms`, `smsRef = { sender, receivedAt }`,
`dedupeKey` copied), set `Suggestion.status = confirmed` + `confirmedTransactionId`, bump
`AccountRule.hitCount` + `updatedAt` → cancel this notification; if others remain `pending`,
refresh the group summary count.
*Edges:* rule deleted between post and tap → do **not** write blind; deep-link into the
Confirmation sheet (opens the app) pre-filled from the Suggestion. Suggestion already `confirmed`
(double-tap / stale) → no-op, open that transaction's Details. Suggestion `dismissed` / deleted →
open Home. (§10 / §31 formalise stale-tap routing.)

**(c) The user opens the app with 5 pending.**
Root layout mounts → **migrations run to completion before the first query** (§20) → Home's live
queries resolve: running balance (Σ income − Σ expense over all `Transaction`), the month
Income / Spending tiles + MoM deltas, `count(Suggestion where status = pending)` → action strip
"5 to review", `count(uncategorized expense Transaction)` → "N uncategorized" →
`getLastNotificationResponseAsync()` is checked: if the cold start came from a notification tap,
route (single → Confirmation sheet for that Suggestion id; group → Review Queue) → the Review
Queue screen runs a live query over `pending` Suggestions and renders each row new-vs-known via
the same `AccountRule` lookup the task uses. Acting on a row calls the same domain + repository
functions as the headless path.

**(d) Manual add.**
Centre **Add** → `SheetRegistry.open('add')` mounts the Add sheet (`@gorhom`); a Zustand
`addSheetDraft` store holds the buffer, the numeric keypad writes `draft.amountMinor` → the
account field queries `AccountRule` by prefix for the autocomplete; picking a row pre-fills
`note` / `categoryId` / `paymentMethod` into the draft → **Add**: validate (`amountMinor > 0`,
`direction` set), `repository.insertTransaction(...)`, and if `account` is non-empty
`repository.upsertAccountRule(...)` → Drizzle live queries re-emit → Home / Transactions update →
sheet closes → "Added …" toast with **View**.

### 17.5 Background execution model (summary)

| Concern | Decision |
|---|---|
| What runs headless | sender gate · parse · transaction gate · dedupe · **one** Suggestion insert · **one** AccountRule read · **one** notification post (or group update). Nothing else. |
| Time budget | target < 5 s; no network / images / analytics. |
| Killed mid-run | writes are single transactions; `dedupeKey` makes a full retry safe; step 8 + the Review Queue recover a partial run. |
| Cold vs warm | cold = fresh JS bundle parse + DB open; warm (app backgrounded) = runs in the existing context. Same task code either way. |
| Idempotency key | `sha256(sender | amountMinor | floor(occurredAt/60000) | direction)` — retry/redelivery guard, **not** D8 cross-message de-dup. |
| Migration pending when a task fires | resolved in Phase 2 (§20): run it, or defer the write and let the next app open reconcile. |

### 17.6 Native module + config plugin plan

**Location & shape.** `modules/coinflow-sms/` — a standard Expo **local module**:
`expo-module.config.json`, `android/` (Kotlin), `src/` (the TS interface), `index.ts`, and
`plugin/` (the config plugin). Added to `app.json` → `plugins`. **Android-only (D3):** the iOS
target is a stub whose methods throw `UnavailabilityError`; the TS API guards every call with
`Platform.OS === 'android'`. Excluded from the web bundle automatically (native Android code + a
platform-guarded JS API); a `.web.ts` stub throws.

**Kotlin surface (kept minimal — D24).**
- `CoinflowSmsModule` — `isSupported(): boolean`; `getPermissionsAsync()` /
  `requestPermissionsAsync()` for `READ_SMS` + `RECEIVE_SMS` (the exact request mechanism —
  native vs a JS `PermissionsAndroid` call — is settled in Phase 4/5; Phase 1 only reserves the
  method names). No custom events are needed for the killed path.
- `SmsReceiver : BroadcastReceiver` — manifest-registered (via the plugin) for
  `SMS_RECEIVED`; `onReceive` coalesces multipart PDUs and starts
  `CoinflowSmsHeadlessTaskService` (extends `HeadlessJsTaskService`) with an
  `HeadlessJsTaskConfig` (timeout ~30 s, `allowedInForeground = true`) carrying
  `{ sender, body, timestampMs }`.

**Config plugin injects (Android only):** `RECEIVE_SMS` + `READ_SMS` `<uses-permission>`; the
`<receiver>` and `<service>` entries; `android:allowBackup="false"` on `<application>` (D21 — or
via `expo-build-properties`; finalised in §33). Nothing on iOS.

**Dev-client requirement.** Because of the SMS permissions and the custom native module, **Expo
Go will not run CoinFlow**. Local dev uses `expo run:android` or an EAS `development` build;
`npm run android` against Expo Go is not a supported path. Recorded again in §16.4 and §35.

### 17.7 Resolved in later phases (was: deferred)

Notification channel / category IDs + action-button config → **§31**. Migration-pending behaviour
in a task → **§20.4**. FTS5 vs `LIKE` → **§20 / D27** (FTS5 primary, `LIKE` fallback). Permission-
request mechanism → **§30.2 / §30.16**; Reduce-Motion plumbing → **§28.4**. Final crash SDK +
default + `beforeSend` scrub → **§33.4 / D34** (Sentry, opt-in / default OFF). Still **documented,
not built:** the contingency hybrid (native posts a provisional notification, JS replaces it) —
adopt only if a ~2-week field test on OEM battery-killer devices shows > ~5 % dropped events or
> ~10 s median latency (D18 / D23).

---

## 18. Project structure

### 18.1 `src/` layout (feature-first — D22)

```
src/
  app/                       expo-router routes ONLY — thin; screens delegate to features/
  features/
    home/                    Home screen + hooks + local components
    transactions/            list · details · filter · the Add / Edit / Confirmation sheet bodies
    analytics/               screen · arc-gauge / donut / day-by-day chart components · period store
    detection/               Review Queue · suggestion card · notification category defs · deep-link routing
    categories/              Categories screen · Create/Edit Category sheet body · icon picker
    settings/                Settings + the six subpages
    onboarding/              the three onboarding steps
    app-shell/               custom tab bar · SheetRegistry · PermissionBanner · root providers
  ui/                        design-system primitives (§3.6): ThemedText, ThemedView, Button, Card,
                             Sheet, KeypadSheet, NumericKeypad, AmountInput, SegmentedControl,
                             SelectorRow, TextField, Chip, StatTile, TransactionCard, DayGroupHeader,
                             ConfirmDialog, UndoSnackbar, EmptyState, Skeleton, ErrorState,
                             Icon (Lucide wrapper), … — full contracts in Phase 4 (§29)
  domain/                    PURE TS, no react-native / expo imports:
                             parser/ · normalize.ts · categorize.ts · analytics/ · format/ (money, date)
                             · period.ts · running-balance.ts · dedupe.ts
  db/                        schema.ts (Drizzle) · client.ts (one shared handle) · migrations/ (generated)
                             · seed.ts (9 categories + Uncategorized + sender seed)
  services/                  notifications.ts · sms.ts (wrapper over modules/coinflow-sms) · sentry.ts
                             · tasks/index.ts (SMS_INGEST_TASK, NOTIFICATION_RESPONSE_TASK — defineTask at module scope)
  stores/                    zustand: addSheetDraft · keypad · filterDraft · onboardingStep · sheetRegistry
  constants/                 theme.ts (rewritten in Phase 4 — §3.7) · category-icons.ts · sms-senders.ts
  hooks/                     use-theme · use-color-scheme(+.web) · use-reduce-motion · live-query wrappers
  lib/                       tiny cross-cutting helpers with no other home (id.ts → expo-crypto, result.ts)
modules/
  coinflow-sms/              the local Expo module (§17.6)
```

**Import rules.** `ui/`, `domain/`, `db/` never import from `features/`. Feature-to-feature
imports go through a feature's `index.ts` barrel. `domain/` imports nothing from `react-native` /
`expo-*` (enforced with an ESLint `no-restricted-imports` rule, added in Phase 4). Path aliases
are unchanged: `@/*` → `src/*`, `@/assets/*` → `assets/*`; add `modules/*` to `tsconfig.json`
`include` when the module ships TS types.

### 18.2 Route tree (`src/app/`, `expo-router`, typed routes on)

```
src/app/
  _layout.tsx                root: SafeAreaProvider · GestureHandlerRootView · Sentry wrapper ·
                             <MigrationGate> (blocks first paint until migrations resolve — §20) ·
                             SheetRegistryProvider · AnimatedSplashOverlay · <Stack>.
                             Redirects to (onboarding) while !onboardingDone (a <Redirect>, not a
                             route file — (tabs)/index.tsx owns "/").
  (onboarding)/
    _layout.tsx              full-screen stack, outside the tab shell
    welcome.tsx
    permissions.tsx
    categories.tsx
  (tabs)/
    _layout.tsx              custom tab bar (§18.4) + the raised centre Add
    index.tsx                Home                         · P0
    transactions.tsx         Transactions (FlashList)     · P0
    analytics.tsx            Analytics                     · P1
    settings.tsx             Settings                      · P1
  review-queue.tsx           pushed                        · P0
  transaction/[id].tsx       Transaction Details (pushed)  · P0
  categories/index.tsx       Manage categories (pushed)    · P1
  settings/
    payment-methods.tsx      · P1
    sms-notifications.tsx    · P1
    account-rules.tsx        · P2  (D16 — ships, lowest priority)
    data.tsx                 · P1
    about.tsx                · P1
  +not-found.tsx
```

**Sheets are not routes (D25).** Add · Edit · Confirmation · Filter · Category-picker ·
Create/Edit-Category are `@gorhom/bottom-sheet` instances driven by a `SheetRegistry` mounted
once in the root layout and opened imperatively — `openSheet('confirm', { suggestionId })` — from
a screen, a row action, or a deep-link handler. The registry API is specified in Phase 4 (§28).

**Deep links (`coinflow://`).** notification single-suggestion tap → open the Confirmation sheet
for that id (over the Review Queue, or over Home); group tap → Review Queue; stale/confirmed →
`transaction/[id]`; dismissed/deleted → Home. Cold-start links are read via
`getLastNotificationResponseAsync()` in the root layout after the `MigrationGate` clears. Exact
URL shapes finalised in §28.

### 18.3 Platform-file (`.web`) policy

Web ships as **static output with no CoinFlow features** in V1 (Android-only — D3). The `src/app`
web build renders a single "CoinFlow is an Android app" placeholder screen. `features/detection`,
`services/sms`, `services/tasks`, `modules/coinflow-sms`, and `db` (native SQLite) are kept out
of the web bundle via `Platform.OS` guards plus `.web.ts` stubs that throw. The template's
existing splits stay and set the pattern: `app-tabs` (being replaced by the custom bar) ·
`use-color-scheme.ts` / `.web.ts` · `animated-icon` native/web. New cross-platform code follows
the `.web.tsx` / `.native.ts` split rather than scattering `Platform.OS` branches.

### 18.4 Template code being replaced

| Template file | Fate |
|---|---|
| `src/app/index.tsx` (Welcome to Expo) | replaced by the Home screen |
| `src/app/explore.tsx` | deleted |
| `src/app/_layout.tsx` | rewritten (providers above; `ThemeProvider` stays, dark-only per §2) |
| `src/components/app-tabs.tsx` / `app-tabs.web.tsx` (`NativeTabs`) | replaced by `features/app-shell/tab-bar.tsx` — a custom bar via `Tabs` `tabBar={…}`, because `unstable-native-tabs` can't render the raised centre **Add** "FAB notch" (§8) or the greyscale pill (§3), and iOS (the native-tab beneficiary) is Future |
| `src/components/themed-text.tsx` / `themed-view.tsx` | moved to `src/ui/`, extended with the §3.2 type roles / §3.1 surfaces (Phase 4) |
| `src/components/hint-row.tsx`, `external-link.tsx`, `web-badge.tsx`, `ui/collapsible.tsx` | template-only; delete when the screen that would use them is built or confirmed unneeded |
| `src/constants/theme.ts` | rewritten in Phase 4 (§3.7) — token ramp, radial ground, Manrope/Geist, Lucide wrapper |
| `scripts/reset-project.js` / `npm run reset-project` | **destructive** — leave in place but do not run once feature work starts; the `package.json` script gets a guard comment in Phase 5 |

### 18.5 Deferred to later phases

Full component file list + prop contracts (§29, Phase 4) · per-screen data/state binding and the
`UI-0xx → IMP-0xx` map per screen (§30, Phase 4) · the `SheetRegistry` API and deep-link URL
shapes (§28, Phase 4) · the `theme.ts` rewrite (§3.7 / §29, Phase 4).

### 18.6 §16 addendum (found in Phase 2)

`expo-file-system` + `expo-sharing` (`~57.x`, Expo-pinned) are added for **Export** (D17 / §20.8)
— the JSON / CSV file is written to app cache and handed to the OS share sheet. Missed in the
Phase 1 list; no other change.

---

## 19. Data models (final)

Supersedes the §6 sketch. Frozen for V1 unless a change-request (`SPEC/PLAN.md` §10) reopens it.

### 19.0 Conventions

| Concern | Rule |
|---|---|
| **Money** | every amount is an **`integer` count of paise** (`amountMinor`, 100 paise = ₹1), always **> 0**; direction is carried by `direction` / `type`, never by the sign of the stored number. **No `REAL` / float anywhere** — parse → store → `SUM()` → format all stay integer (D28). |
| **Timestamps** | `integer` **Unix epoch milliseconds, UTC** (`occurredAt`, `createdAt`, `updatedAt`, `deletedAt`, `smsReceivedAt`). Local calendar-day / month / ISO-week boundaries (P-11) are computed in the domain `period.ts` helper from the device zone — never stored as local strings (D28). |
| **IDs** | `text` UUIDv4 from `expo-crypto.randomUUID()` (D28). Exception: `account_rule` is keyed by its natural `normalizedKey`; `category` also carries a stable `key` slug for the seeded rows. |
| **Enums** | stored as `text` with a Drizzle `{ enum: [...] }` guard (SQLite has no enum type). Values are the lowercase tokens listed per field. |
| **Booleans** | `integer` `0` / `1` (Drizzle `integer({ mode: 'boolean' })`). |
| **FK policy** | `PRAGMA foreign_keys = ON`. `categoryId` FKs are `ON DELETE SET NULL` (a deleted category ⇒ Uncategorized, F6). |
| **Raw SMS** | never a column, in any table (P-9). Only `smsSender` + `smsReceivedAt` survive. |

### 19.1 `transaction`

| Field | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | text uuid | no | — | PK |
| `amountMinor` | integer | no | — | paise, > 0 |
| `direction` | text `debit`\|`credit` | no | — | the money-movement direction (parser / manual segment) |
| `type` | text `expense`\|`income` | no | — | reserved (not user-selectable in V1): `transfer`, `refund`, `reimbursement` (P-8). V1 maps `debit→expense`, `credit→income` at write time but stores `type` independently so reserved types land later with **no migration** (IMP-012) |
| `categoryId` | text uuid | yes | null | FK → `category.id` `ON DELETE SET NULL`; `null` ⇒ Uncategorized (F7). Forced `null` when `type = income` (IMP-011) |
| `paymentMethod` | text `upi`\|`card`\|`cash`\|`bank_transfer`\|`wallet` | yes | null | D5 |
| `account` | text | yes | null | display form of the payee / payer (D13); the row label falls back to this when `note` is empty |
| `normalizedAccountKey` | text | yes | null | `normalize(account)` (§8 / §24) cached at write time; FK-less link to `account_rule.normalizedKey`; re-derived on every write / edit |
| `note` | text | yes | null | the card label (§6.2); fallback chain note → account → "No note" |
| `description` | text | yes | null | longer detail |
| `occurredAt` | integer ms | no | — | SMS timestamp preferred, else `smsReceivedAt`; manual = now; a future value is allowed (§6.5 edge) |
| `createdAt` | integer ms | no | `now` | |
| `updatedAt` | integer ms | no | `now` | bumped on every edit |
| `deletedAt` | integer ms | yes | null | **soft-delete for Undo (D26).** Set on delete, cleared on Undo. Every read filters `deletedAt IS NULL`; rows are hard-purged on launch once `deletedAt < now − PURGE_GRACE_MS` (§20.6) |
| `source` | text `manual`\|`sms` | no | — | |
| `smsSender` | text | yes | null | set only when `source = sms` — the DLT header / short-code label |
| `smsReceivedAt` | integer ms | yes | null | set only when `source = sms` |
| `dedupeKey` | text | yes | null | copied from the originating `suggestion` (§17.3 step 4); lets the ingest guard see already-confirmed transactions |
| `editedByUser` | integer bool | no | `0` | set `1` on the first user edit — the P2 "edited" marker (§6.8) |

**Indices**

| Name | Columns | Backs |
|---|---|---|
| `idx_txn_occurred` | `(deletedAt, occurredAt DESC)` | Transactions list (§6.7), Home Recent, day grouping |
| `idx_txn_type_occurred` | `(deletedAt, type, occurredAt)` | period Spent / Income, daily series, running balance (§9 / §26) |
| `idx_txn_category` | `(deletedAt, categoryId, occurredAt)` | "Where it went", category drill-down (§6.10) |
| `idx_txn_dedupe` | `(dedupeKey)` | ingest idempotency (§17.3) |
| `idx_txn_normkey` | `(normalizedAccountKey)` | account-rule-adjacent lookups; "Top accounts" (Future) |

### 19.2 `category`

| Field | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | text uuid | no | — | PK |
| `key` | text | yes | null | stable slug for the seeded rows — `uncategorized`, `food`, `transport`, `shopping`, `entertainment`, `education`, `bills`, `groceries`, `health`, `other`; `null` for custom. **UNIQUE** |
| `name` | text | no | — | ≤ 24 chars (app-validated, §6.12); **unique case-insensitively** among live rows (IMP-019) |
| `icon` | text | no | — | Lucide glyph name (§3.4) from the fixed picker grid (§6.12) |
| `kind` | text `system`\|`default`\|`custom` | no | — | `system` = the Uncategorized row only (it exists for Analytics labelling + the picker; a transaction is Uncategorized by `categoryId IS NULL`, not by pointing here). `default` = the 9. `custom` = user-created |
| `isProtected` | integer bool | no | `0` | `1` for `other` and `uncategorized` — cannot be deleted (F6 / §6.11); the other 8 defaults **can** be deleted |
| `order` | integer | no | — | display order; user reorder (onboarding step 3, §6.1) writes here |
| `createdAt` / `updatedAt` | integer ms | no | `now` | |

No `colour` (D12). No soft-delete — **delete is immediate**: `UPDATE transaction SET categoryId = NULL, updatedAt = now WHERE categoryId = ?` then `DELETE`, in one transaction; the count of reassigned rows feeds the confirm dialog (§6.11 edge / IMP-018).

### 19.3 `account_rule` (F8)

| Field | Type | Null | Default | Notes |
|---|---|---|---|---|
| `normalizedKey` | text | no | — | **PK** — the §8 / §24 normalized account string |
| `displayAccount` | text | no | — | most recent display form |
| `lastNote` | text | yes | null | set to the note just used; **explicit `NULL` when the user cleared the note** (P-6) |
| `categoryId` | text uuid | yes | null | FK → `category.id` `ON DELETE SET NULL`; written **only when the saved transaction's category ≠ Uncategorized** (§8) |
| `lastPaymentMethod` | text (same enum as `transaction`) | yes | null | |
| `hitCount` | integer | no | `0` | `+1` on every upsert |
| `createdAt` / `updatedAt` | integer ms | no | `now` | `updatedAt` bumped on upsert — **last write wins** |

**Upsert** (from every transaction insert / edit with a non-empty `account`, UI **and** the headless Save):

```sql
INSERT INTO account_rule (normalizedKey, displayAccount, lastNote, categoryId, lastPaymentMethod, hitCount, createdAt, updatedAt)
VALUES (?, ?, ?, ?, ?, 1, :now, :now)
ON CONFLICT(normalizedKey) DO UPDATE SET
  displayAccount     = excluded.displayAccount,
  hitCount           = hitCount + 1,
  lastNote           = excluded.lastNote,                       -- NULL when the note was cleared
  lastPaymentMethod  = excluded.lastPaymentMethod,
  categoryId         = CASE WHEN :newCategoryIsUncategorized     -- categoryId param IS NULL
                            THEN account_rule.categoryId          -- keep the previously learned one
                            ELSE excluded.categoryId END,
  updatedAt          = :now;
```

**Index** `idx_rule_prefix` on `(displayAccount COLLATE NOCASE)` for the Add-sheet autocomplete
prefix search (§6.5).

### 19.4 `suggestion` (F1 / F11)

| Field | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | text uuid | no | — | PK |
| `amountMinor` | integer | yes | null | may be a partial parse |
| `direction` | text `debit`\|`credit` | yes | null | |
| `occurredAt` | integer ms | yes | null | from the SMS; `null` ⇒ the UI shows `smsReceivedAt` |
| `account` | text | yes | null | raw parsed payee / VPA |
| `normalizedKey` | text | yes | null | `normalize(account)`; used to pick the notification action set (known vs new account) |
| `paymentMethod` | text (same enum) | yes | null | inferred hint |
| `smsSender` | text | no | — | |
| `smsReceivedAt` | integer ms | no | — | |
| `dedupeKey` | text | no | — | §17.3 step 4; **UNIQUE** |
| `status` | text `pending`\|`confirmed` | no | `pending` | **dismiss is a hard `DELETE` (D26)** — `dismissed` is not a stored state. `confirmed` is kept briefly so a stale notification tap can route to the created transaction (§10); purged on launch when `createdAt < now − 24 h` (§20.6) |
| `confirmedTransactionId` | text uuid | yes | null | FK → `transaction.id` `ON DELETE SET NULL` |
| `createdAt` | integer ms | no | `now` | |

No confidence field (§6). "Which fields parsed" is implicit — a non-null column parsed. No raw
body (P-9).

**Indices** `idx_sugg_status` on `(status, createdAt DESC)`; `uniq_sugg_dedupe` **UNIQUE** on
`(dedupeKey)`.

### 19.5 `app_setting` (KV)

| Field | Type | Null | Notes |
|---|---|---|---|
| `key` | text | no | PK |
| `value` | text | no | JSON-encoded scalar / small object |
| `updatedAt` | integer ms | no | |

V1 keys: `onboardingDone` (bool) · `smsBannerDismissedAt` (ms\|null) · `notifBannerDismissedAt`
(ms\|null) · `crashReportingEnabled` (bool — default decided in §33) · `schemaSeededVersion`
(int — seed idempotency, §20.5) · `lastPurgeAt` (ms) · `analyticsPeriodMode` (`month`\|`week`,
last used — optional convenience). **Category order is not here** — it lives in `category.order`.

### 19.6 `transaction_fts` (FTS5)

External-content FTS5 table for search (§6.7 / IMP-015):

```sql
CREATE VIRTUAL TABLE transaction_fts USING fts5(
  note, description, account,
  content='transaction', content_rowid='rowid'
);
-- + AFTER INSERT / AFTER DELETE / AFTER UPDATE triggers on `transaction`
--   that keep transaction_fts in sync (standard external-content trigger trio),
--   using new.rowid / old.rowid.
```

Search query: `SELECT t.* FROM transaction_fts f JOIN "transaction" t ON t.rowid = f.rowid
WHERE f.transaction_fts MATCH ? AND t.deletedAt IS NULL ORDER BY t.occurredAt DESC` — the user
string is tokenised and each token wrapped as a prefix term (`foo*`). Drizzle does not model FTS
tables, so this table + its triggers ship as a **hand-written migration** (§20.3).

**Fallback (D27):** if a device's SQLite lacks FTS5 (probed once at startup with a
`CREATE VIRTUAL TABLE … fts5` in `try/catch`), the repo switches to a maintained
`searchText` TEXT column (`lower(coalesce(note,'')||' '||coalesce(description,'')||' '||
coalesce(account,''))`, refreshed on write) queried with `LIKE '%term%'`. SDK 57 ships
`enableFTS` **on by default**, so FTS5 is the expected path.

---

## 20. Persistence & migrations

### 20.1 The database handle

One handle in `src/db/client.ts`:

```ts
export const sqlite = SQLite.openDatabaseSync('coinflow.db', { enableChangeListener: true });
sqlite.execSync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
export const db = drizzle(sqlite, { schema });
```

`openDatabaseSync` (not the async variant) so the **headless tasks** (§17) and the UI share one
code path. `enableChangeListener: true` is what makes Drizzle's `useLiveQuery` re-emit (§22).
WAL for read/write concurrency between an open screen and a background write.

### 20.2 Schema & config

`src/db/schema.ts` holds the Drizzle table definitions (§19.1–§19.5). `drizzle.config.ts` at the
repo root: `dialect: 'sqlite'`, `driver: 'expo'`, `schema: './src/db/schema.ts'`,
`out: './src/db/migrations'`.

### 20.3 Migration generation & bundling

- `npx drizzle-kit generate` writes versioned SQL + a journal into `src/db/migrations/`, which is
  **committed** (not generated at build time).
- The **FTS5 virtual table + triggers** (§19.6) and any other statement Drizzle can't express are
  added as extra numbered `.sql` files in the same folder, ordered after the table they depend on.
- `src/db/migrations/migrations.js` (Drizzle's generated barrel) is `import`ed into the bundle —
  no filesystem copy, no asset. `migrate()` / `useMigrations()` from
  `drizzle-orm/expo-sqlite/migrator` applies anything unapplied, tracked in Drizzle's
  `__drizzle_migrations` table.

### 20.4 Run-on-launch (`<MigrationGate>`)

The root layout (§18.2) mounts `<MigrationGate>`, which calls `useMigrations(db, migrations)` and
**holds first paint** (splash stays / a skeleton shows) until `success`. Then it runs
§20.5 (seed) and §20.6 (purge) once, synchronously, before children mount.

- **On migration `error`:** a non-dismissible screen — "CoinFlow can't open your data" + **Retry**
  + a **Export a copy** escape hatch if the DB is readable (P-4); **no raw SQL shown, no auto-wipe.**
  Reported to Sentry with **no row data** (§33).
- **Headless task hits a pending migration** (Phase 1 open item — **resolved**): every task calls
  a shared `ensureMigrated()` that runs `migrate(db, migrations)` **before any read / write**.
  Migrations are small; running them from the task is safe and prevents a silently-dropped
  background write. If `migrate()` throws inside a task, the task aborts cleanly with **no partial
  write** (the Suggestion is simply not created); detection is dark until the app is next opened
  and the migration succeeds. Logged. This only happens on a broken build.

### 20.5 Seed (idempotent)

Runs in the gate after `migrate()`, guarded by `app_setting.schemaSeededVersion`:

1. The **system** row: `category(key='uncategorized', name='Uncategorized', icon='help-circle',
   kind='system', isProtected=1, order=0)`.
2. The **9 defaults** — `kind='default'`, `isProtected=1` only for `other`:

   | order | key | name | Lucide icon |
   |---|---|---|---|
   | 1 | `food` | Food | `utensils` |
   | 2 | `transport` | Transport | `bus` |
   | 3 | `groceries` | Groceries | `shopping-basket` |
   | 4 | `bills` | Bills | `receipt` |
   | 5 | `shopping` | Shopping | `shopping-bag` |
   | 6 | `entertainment` | Entertainment | `clapperboard` |
   | 7 | `health` | Health | `heart-pulse` |
   | 8 | `education` | Education | `graduation-cap` |
   | 9 | `other` | Other | `shapes` |

   *(icons are the Phase 2 proposal — Phase 4 confirms them against the final Lucide wrapper and
   the §3.4 chrome set.)*
3. All inserts use `ON CONFLICT(key) DO NOTHING` so **user renames / re-icons survive** a re-seed.
   When the seed content changes in a future release, bump `schemaSeededVersion`; the merge rule
   is **add missing `key`s only, never overwrite a modified row**.
4. The **SMS sender seed set** is **not** a table — it is a versioned constant
   (`src/constants/sms-senders.ts`), finalised in §23 (Phase 3). Not user-editable in V1.

### 20.6 Purge-on-launch

In the gate, after seed; also re-runnable from `AppState → active` if the app has been open past
midnight:

```sql
DELETE FROM "transaction" WHERE deletedAt IS NOT NULL AND deletedAt < (:now - :PURGE_GRACE_MS);   -- PURGE_GRACE_MS ≈ 60_000, well past the 5 s Undo + snackbar
DELETE FROM suggestion   WHERE status = 'confirmed' AND createdAt < (:now - 86_400_000);           -- 24 h
```

then write `lastPurgeAt`. FTS rows follow via the §19.6 delete trigger.

### 20.7 Clear all data (§12 / IMP-044)

One transaction: `DELETE` from `suggestion`, `transaction` (FTS follows), `account_rule`, and
`category WHERE kind = 'custom'`; reset the 10 seeded rows to their §20.5 values; delete every
`app_setting` row (so `onboardingDone` is absent ⇒ the app returns to onboarding). `VACUUM`
after. The two-step `CONFIRM`-typed dialog is UI (§6.14 / IMP-065).

### 20.8 Export (D17 / §12 / IMP-043)

Read-only, no import in V1. `src/features/settings/export.ts`:

- **JSON** — `{ version, exportedAt, transactions[], customCategories[], accountRules[] }` (live
  rows only; paise as integers; timestamps as epoch-ms). 
- **CSV** — transactions only, one header row + one row per transaction, amounts rendered as
  rupees with two decimals for spreadsheet use, `occurredAt` as ISO-8601 local.

Written to `FileSystem.cacheDirectory` then passed to `Sharing.shareAsync(...)` (§18.6). Nothing
leaves the device except through that user-initiated share sheet (P-9 / IMP-045).

---

## 21. Data-access layer

`src/db/repositories/*.ts` — plain typed functions over the shared `db`. Reads that a screen
watches are exposed as `use*` hooks built on `useLiveQuery` (`drizzle-orm/expo-sqlite`), which
re-runs the query on `expo-sqlite` change events (§20.1). Writes come in `async` (UI) and, where a
**headless task** needs them, `*Sync` variants over the same SQL. **Every write path below that is
marked ✅ is reachable from a background task and shares its implementation with the UI call — no
logic fork** (Phase 1 §17.0 rule 2).

### 21.1 `transactionRepo`

| Method | Kind | Backs | Headless |
|---|---|---|---|
| `insertTransaction(input)` / `…Sync` | write | Add (§6.5), Confirmation (§6.4), notification **Save** (§17.4b). Derives `normalizedAccountKey`, sets `type` from `direction`, copies `dedupeKey`, forces `categoryId=null` when `type='income'` | ✅ |
| `updateTransaction(id, patch)` | write | Edit (§6.6), inline category fix on Details (§6.8 / J5). Re-derives `normalizedAccountKey`, sets `editedByUser=1`, bumps `updatedAt` | — |
| `softDeleteTransaction(id)` | write | swipe-delete (§6.7 / §6.8) — sets `deletedAt=now` | — |
| `restoreTransaction(id)` | write | Undo (§6.7 / IMP-016) — clears `deletedAt` | — |
| `purgeDeleted(before)` | write | launch job (§20.6) | ✅ (gate) |
| `getTransaction(id)` / `…Sync` | read | Details, stale-notification routing | ✅ |
| `useTransaction(id)` | live | Details (§6.8) | — |
| `useTransactionList(query)` | live | Transactions (§6.7). `query = { search?, categoryIds?, type?, methods?, from?, to?, limit, cursor }`; FTS join when `search` set; returns rows + `daySubtotals` | — |
| `useRecentTransactions(limit=8)` | live | Home Recent (§6.2) | — |
| `hasDedupeKey(key)` → bool | read-Sync | §17.3 step-4 guard (checks `transaction` **and** `suggestion`) | ✅ |

### 21.2 `categoryRepo`

| Method | Kind | Backs |
|---|---|---|
| `useCategories()` | live | pickers, Categories (§6.11), onboarding step 3 |
| `getCategoryMap()` / `…Sync` | read | icon / name resolution in lists |
| `createCategory({name, icon})` | write | Create sheet (§6.12); rejects a case-insensitive duplicate with a typed error (IMP-019) |
| `updateCategory(id, {name?, icon?, order?})` | write | Edit sheet, reorder |
| `deleteCategory(id)` → `{ reassigned }` | write | Categories swipe (§6.11); throws on `isProtected`; reassigns transactions to `null` and returns the count for the confirm (IMP-018) |
| `reorderCategories(idsInOrder)` | write | drag reorder / onboarding |

### 21.3 `accountRuleRepo`

| Method | Kind | Backs | Headless |
|---|---|---|---|
| `upsertFromTransaction(txn)` / `…Sync` | write | after any insert/edit with a non-empty `account` — UI **and** notification Save. Implements §19.3 | ✅ |
| `getAccountRule(normalizedKey)` → rule\|null | read-Sync | notification action-set choice (§17.3 step 6) + re-match on Save (§17.4b) | ✅ |
| `useAccountRules()` | live | Settings › Account rules (§6.14 / D16) | — |
| `searchByPrefix(prefix, limit)` | read | Add/Edit/Confirmation account autocomplete (§6.5) | — |
| `updateAccountRule(key, {lastNote?, categoryId?})` | write | Account rules screen edit | — |
| `deleteAccountRule(key)` | write | Account rules screen | — |

### 21.4 `suggestionRepo`

| Method | Kind | Backs | Headless |
|---|---|---|---|
| `insertIfNew(input)` → `{ created, id }` | write-Sync | `SMS_INGEST_TASK` (§17.3 step 5); relies on `uniq_sugg_dedupe` + `ON CONFLICT DO NOTHING` | ✅ |
| `getSuggestion(id)` / `…Sync` | read | notification routing, Review Queue row | ✅ |
| `confirmSuggestion(id, transactionId)` / `…Sync` | write | set `status='confirmed'` + link — in the **same DB transaction** as the transaction insert, from both the Confirmation sheet and the headless Save | ✅ |
| `dismissSuggestion(id)` / `…Sync` | write | **hard `DELETE`** (D26) — notification Discard + Review Queue swipe | ✅ |
| `dismissAllPending()` → count | write | Review Queue "Dismiss all" (§6.3) | — |
| `usePendingSuggestions()` | live | Review Queue list (§6.3) | — |
| `usePendingCount()` | live | Home action strip + Home-tab badge (§6.2) | — |
| `purgeConfirmed(before)` | write | launch job (§20.6) | ✅ (gate) |

### 21.5 `analyticsRepo` (raw SQL — exact statements in §26)

All `live`. `SUM`s stay integer (paise). Period bounds from `period.ts` (P-11).

| Method | Backs |
|---|---|
| `usePeriodSummary(period)` | Analytics "This month" card + Home Income/Spending tiles — Σ expense, Σ income, Balance |
| `useRunningBalance()` | Home hero (D2) — `SUM(CASE type WHEN 'income' THEN amountMinor WHEN 'expense' THEN -amountMinor END)` over all live rows |
| `useMoMDeltas(period)` | Home tiles — current vs previous calendar month `(cur−prev)/prev` |
| `useCategoryBreakdown(period)` | "Where it went" — group by `categoryId` (Uncategorized = `NULL` bucket), share of spend, desc |
| `useDailySeries(period)` | "Day by day" — Σ expense per local day, zero-filled in JS; mean + median in JS |
| `useLargestExpenses(period, n=5)` | "Biggest expenses" |
| `useUncategorizedCount(period?)` | Home "N uncategorized", Analytics "Fix N" |

### 21.6 `settingsRepo` / `maintenanceRepo`

| Method | Kind | Notes |
|---|---|---|
| `getSetting<T>(key, fallback)` / `useSetting(key)` / `setSetting(key, value)` | read-Sync / live / write | KV over `app_setting` (§19.5); sync read available to startup / tasks |
| `runLaunchMaintenance()` | write-Sync | migrate → seed → purge; returns a summary for logging (§20.4–§20.6) |
| `clearAllData()` | write | §20.7 |
| `exportJson()` / `exportCsv()` → file uri | read | §20.8 |

### 21.7 Live-query re-emit

`use*` hooks wrap `useLiveQuery(db.select()…)`. A write from **any** context (UI or a headless
task) hits the one `coinflow.db`; `expo-sqlite`'s change listener fires and every mounted
subscriber re-runs its query — no manual invalidation, no cache layer. While the app is fully
killed there is nothing mounted to update; the durable rows are simply read fresh by the gate on
next launch.

---

## 22. Application state

Three tiers, no overlap.

### 22.1 SQLite-derived (the single source of truth)

Everything durable — transactions, categories, rules, suggestions, settings — is read **only**
through §21 live-query hooks. It is never copied into React state or a store beyond what a
component renders this frame. No optimistic-update cache: writes are local and fast, and the
live query re-emits within a frame or two.

### 22.2 Zustand ephemeral stores (`src/stores/`, never persisted)

| Store | Holds | Cleared |
|---|---|---|
| `useAddSheetDraft` | the Add / Edit / Confirmation working copy — `{ mode, sourceId?, amountMinor, direction, type, categoryId, paymentMethod, account, note, description, occurredAt, dirty, submitting, error }`. Seeded on open from a Suggestion, an existing Transaction, or defaults. `dirty` drives the discard-confirm (V-6) | on sheet close / app kill |
| `useKeypad` | numeric-keypad buffer, decimal state, and `mode` (`amount` full-height vs collapsed summary bar, §6.4); writes through to `useAddSheetDraft.amountMinor` | with the sheet |
| `useFilterDraft` | the Filter sheet's working selection **before Apply** (§6.9). The **applied** filter is held in Transactions route params (survives tab switches + deep links), not here | on Apply / cancel |
| `useOnboarding` | step index (1–3) + pending per-step selections (category toggles) before commit | on "Done" (then committed to DB, `onboardingDone` set) |
| `useSheetRegistry` | `{ current: SheetName\|null, params, open(name, params), close(), requestClose() }` — the imperative sheet host (D25; API detailed in §28) | app kill |
| `useUndo` | `{ transactionId, timerId } \| null` — drives the Undo snackbar + its ~5 s auto-hide. The **data** is already safe via soft-delete, so this store never holds row content; Undo just calls `restoreTransaction` | on Undo / timeout / app kill |

### 22.3 Persisted preferences

`app_setting` KV rows (§19.5) via `settingsRepo` — **not** a store, **not** AsyncStorage/MMKV.
`onboardingDone` gates the onboarding redirect in the root layout; `*BannerDismissedAt` gate the
V-9 permission banner; `crashReportingEnabled` is read once at startup to arm/disarm Sentry
(§33). The headless task can read these synchronously if ever needed.

### 22.4 Permission state is not stored

SMS + notification permission status is read live from the OS
(`coinflowSms.getPermissionsAsync()`, `Notifications.getPermissionsAsync()`) on the screens that
show it (Home banner, onboarding step 2, Settings › SMS & notifications) and re-checked on
`AppState → active`. Only the banner **dismissal** is persisted (§22.3).

### 22.5 Cross-context update path

```
headless task writes coinflow.db
        │
        ▼  (app in foreground)
expo-sqlite change event  ──▶  every mounted useLiveQuery re-runs
        │                              │
        ▼                              ▼
Home "N to review" / "N uncategorized"   Review Queue list, Transactions list, Analytics
updates with no manual invalidation
```

Cold start: the `<MigrationGate>` finishes → first render already reads fresh rows.

### 22.6 Deferred to later phases

The exact `SheetRegistry` / draft-store API surface and the Reduce-Motion hook (§28–§29, Phase 4).

---

## 23. SMS parsing

`src/domain/parser/` — pure TS, no RN / Expo imports (§18.1). Entry
`parseSms(input: RawSms): ParseResult`, `RawSms = { sender: string; body: string; receivedAt: number }`.

### 23.1 Pipeline

```
RawSms
  → 23.2 sender gate      non-match  ⇒ { kind:'ignored', reason:'sender' }
  → 23.3 ignore gate      OTP / promo / balance-only / request-money / forex / not-yet-settled ⇒ ignored
  → 23.4 field extraction amount · direction · account · paymentMethod
  → 23.5 transaction gate need direction OR amount, else ⇒ { kind:'ignored', reason:'not-a-txn' }
  ⇒ { kind:'transaction', fields, parsedFlags, warnings }
```

`occurredAt` is **not parsed from the body** — it is `input.receivedAt`, the SMS timestamp handed
in by the native receiver (§7 / P-11). No in-body date parsing in V1 (a clearly back-dated value
is logged as Future).

### 23.2 Sender gate

`isKnownSender(sender)` against `SENDER_SEED` (`src/constants/sms-senders.ts`). Indian
transactional SMS come from 6-char DLT header IDs (`AD-HDFCBK`, `VM-SBIINB`, `JD-ICICIB`,
`BZ-PAYTMB`, …) plus a few numeric short codes. Match: drop the `XX-` telco prefix and a trailing
`-S`/`-T`, upper-case, test the 4–8-char core against the seed (exact + a prefix set:
`HDFCBK`, `SBIINB`, `ICICI`, `AXISBK`, `KOTAK`, `PNBSMS`, `CBSSBI`, `BOIIND`, `PAYTM`, `PHONPE`,
`GPAY`, `AMZNPY`, `CRED`, …). The seed is **curated, code-versioned, not user-editable in V1**;
expansion and any learn-from-use is Future (§14). Unknown sender ⇒ `ignored:'sender'`; nothing
else runs (IMP-002).

### 23.3 Ignore gate

Ordered checks on the lower-cased, whitespace-collapsed body; first hit wins ⇒
`{ kind:'ignored', reason }`. Runs **before** extraction so a promo mentioning `₹500` never
becomes a Suggestion.

| reason | trigger (indicative) |
|---|---|
| `otp` | `\botp\b`, `one[- ]time password`, `verification code`, `do not share`, `\b\d{4,8}\b is your` |
| `promo` | `offer`, `cashback up to`, `apply now`, `pre-?approved`, `\bloan\b`, `emi option`, `\bsale\b`, `discount`, a bare link with no debit/credit keyword |
| `balance-only` | `avl bal` / `available balance` / `a/c balance` **and** no debit/credit keyword and no directional amount |
| `request-money` | `requesting`, `collect request`, `has requested`, `payment request`, `debited if you approve` |
| `foreign-currency` | an amount prefixed by `\b(usd|eur|gbp|aed|sgd)\b` / `\$` / `€` / `£` and no INR amount present (logged for Future) |
| `not-yet-settled` | `will be credited`, `has been initiated`, `is pending`, `on hold` — future-tense, no ledger entry in V1 |

### 23.4 Field extraction (hybrid — data tables + code)

Each extractor returns `value | null` and never throws.

- **amount → `amountMinor: integer | null`.** INR amount regex: optional `rs`/`rs.`/`inr`/`₹`
  (case-insensitive, optional space) then an Indian- or plain-grouped number with an optional
  `.dd`:
  `/(?:rs\.?|inr|₹)\s?((?:\d{1,2},)?(?:\d{2},)*\d{3}(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/i`.
  Multiple amounts → prefer the one adjacent to a direction keyword, else the first. **To paise
  as integer:** strip `,`; split on `.`; right-pad the fraction to 2 digits;
  `major*100 + minorPadded`. **Never `parseFloat` into rupees** (D28). Values `≤ 0` or
  `> 1,00,00,000_00` paise set `warnings:['amountOutOfRange']` but keep the value for review
  (the UI's extra-confirm handles §6.4's edge).
- **direction → `'debit' | 'credit' | null`.** Word-boundary keyword sets:
  debit = `debited`, `debit`, `spent`, `paid`, `withdrawn`, `purchase of`, `sent to`,
  `transferred to`, `payment of`, `\bdr\b`; credit = `credited`, `credit`, `received`,
  `deposited`, `added to`, `refund of`, `\bcr\b`. Both present → the one nearest the chosen
  amount; still tied → `null` + `warnings:['ambiguousDirection']`.
- **account → `{ raw, normalizedKey } | null`.** First non-empty of:
  (1) VPA `/\b[\w.\-]{2,}@[a-z]{2,}\b/i`; (2) `to|at|towards|for|in favour of <name>` trimmed at
  the next keyword (`on`, `ref`, `upi`, `a/c`, `.`); (3) the alpha segment of a
  `UPI/DR/123456/NAME/…` ref that isn't a bank/scheme token; (4) `from <name>` for credits.
  `normalizedKey = normalize(raw)` (§24). No match ⇒ `null` (F7 — never guessed).
- **paymentMethod → enum | null.** VPA / `upi` → `upi`; `card`, `card ending`, `xx\d{4}` →
  `card`; `imps` / `neft` / `rtgs` → `bank_transfer`; `wallet`, `paytm wallet`,
  `amazon pay balance`, `phonepe wallet` → `wallet`; else `null`.

### 23.5 Transaction gate & output

Qualifies when **`direction !== null` OR `amountMinor !== null`** (a partial parse is allowed —
§7 / IMP-003); else `ignored:'not-a-txn'`.

```ts
type ParseResult =
  | { kind: 'transaction';
      fields: { amountMinor: number|null; direction: 'debit'|'credit'|null;
                account: string|null; normalizedKey: string|null;
                paymentMethod: PaymentMethod|null; occurredAt: number };
      parsedFlags: { amount: boolean; direction: boolean; account: boolean; method: boolean };
      warnings: ('amountOutOfRange'|'ambiguousDirection')[] }
  | { kind: 'ignored'; reason: 'sender'|'otp'|'promo'|'balance-only'|'request-money'
                              |'foreign-currency'|'not-yet-settled'|'not-a-txn' };
```

`SMS_INGEST_TASK` (§17.3) maps a `transaction` result to a `Suggestion` (§19.4) and computes
`dedupeKey = sha256(sender | amountMinor | floor(occurredAt/60000) | direction)`. **No confidence
score** (§7).

### 23.6 Test corpus (primary unit-test asset — `SPEC/PLAN.md` §8)

`src/domain/parser/__fixtures__/sms-corpus.ts` — `{ id, sender, body, receivedAt, expected }[]`,
bodies **anonymised** (names / VPAs / refs replaced, amounts realistic). V1 coverage:

- Banks — HDFC, SBI, ICICI, Axis, Kotak, PNB, BoB — debit + credit × UPI + card + IMPS/NEFT.
- UPI apps — GPay, PhonePe, Paytm, CRED, Amazon Pay.
- Each `ignored` reason ×2.
- Partial parses — amount-only; direction-only; no account.
- Hard shapes — two amounts in one body; `Rs.` vs `INR` vs `₹`; paise present; lakh grouping;
  multi-line; a real debit with a trailing marketing sentence.

Run over the whole corpus in `jest` CI; a mismatch fails the build. Every real-world miss becomes
a fixture **before** the parser is changed (regression guard).

---

## 24. Account normalization

`src/domain/normalize.ts` — `normalize(raw: string): string` → the `normalizedKey` that is the
`account_rule` PK and is cached on `transaction.normalizedAccountKey` / `suggestion.normalizedKey`.

### 24.1 Algorithm (ordered)

1. Unicode NFKC; trim; collapse internal whitespace to single spaces.
2. Lower-case.
3. **VPA** (`local@psp`): keep `local@psp`; strip a leading/trailing digit run from `local`
   **only if** `local` also contains letters (`swiggy@paytm` unchanged; `9876543210@ybl` keeps
   its digits — a numeric handle *is* the identity). `psp` untouched.
4. Else: replace `* # . , / \ _ - ( ) : ;` with spaces.
5. Strip trailing reference / order / invoice tokens — repeat until stable:
   `\b(ref|txn|rrn|order|inv|no|id)?\s?[:#]?\s?[a-z]*\d{3,}[a-z0-9]*$`.
6. Strip company suffixes: `\b(pvt|private|ltd|limited|llp|inc|co|company|india)\b`.
7. Collapse whitespace; trim. Empty result ⇒ fall back to the step-2 string.

### 24.2 Worked table (with the §8 near-miss cases)

| raw | normalizedKey |
|---|---|
| `swiggy@paytm` | `swiggy@paytm` |
| `SWIGGY@paytm` | `swiggy@paytm` |
| `Swiggy Limited` | `swiggy` |
| `SWIGGY*ORDER123` | `swiggy` |
| `SWIGGY LTD` | `swiggy` |
| `Namma Metro` | `namma metro` |
| `namma-metro@upi` | `namma-metro@upi` *(VPA — `local` punctuation kept)* |
| `Amazon Pay India Pvt Ltd` | `amazon pay` |
| `UBER   INDIA /RIDE/ 88213` | `uber india ride` |
| `9876543210@ybl` | `9876543210@ybl` |
| `BLINKIT#IN9921` | `blinkit` |

### 24.3 Matching (V1)

**Exact `normalizedKey` equality only** — `getAccountRule(key)` is a PK lookup. Residual
near-misses (`namma-metro@upi` vs `namma metro`) create **separate** rules — accepted for V1
(§8). No fuzzy match, edit-distance, substring, or ML. The §24.2 rows + ~12 more are a
unit-test table.

---

## 25. Categorization

`src/domain/categorize.ts` + `accountRuleRepo` (§21.3). No colour, no keyword map, no ML in V1.

### 25.1 On detection / autocomplete pick

`resolveCategoryForAccount(normalizedKey | null)` →
`{ categoryId: string|null; note: string|null; paymentMethod: PaymentMethod|null }`:

- `null` key ⇒ `{ null, null, null }` — stays **Uncategorized**, note blank (never guessed,
  `idea.md` §7).
- rule found ⇒ its `categoryId` (possibly `null`), `lastNote`, `lastPaymentMethod` — all still
  editable (P-2).
- **Notification action set** (§17.3 step 7 / §6.15): rule with a non-null `categoryId` **or** a
  non-null `lastNote` ⇒ **known-account** (`Save` / `Add` / `Discard`); otherwise **new-account**
  (`Add` / `Discard`).

### 25.2 On save / edit — the learning step (P-6)

After a `transaction` write with a non-empty `account`, `accountRuleRepo.upsertFromTransaction`
runs **in the same DB transaction** as the insert/update (exactly §19.3):

- `hitCount += 1`; `displayAccount = txn.account`; `updatedAt = now` (**last write wins**).
- `lastNote = txn.note ?? null` — a cleared note (`'' → null`) clears `lastNote`.
- `lastPaymentMethod = txn.paymentMethod ?? null`.
- `categoryId` ← `txn.categoryId` **only when not Uncategorized**; when the transaction is
  Uncategorized, **keep** the previously learned `categoryId` (don't un-learn).

Income has no category (IMP-011) — an income save still updates `lastNote` / `lastPaymentMethod` /
`displayAccount` / `hitCount`, leaving `categoryId` alone.

### 25.3 Uncategorized (F7)

`categoryId IS NULL` **is** the Uncategorized state — no id is stored on the row. Uncategorized
expenses **count in every spend total** (§26) and are surfaced everywhere (Home count, Analytics
row, list style V-4, a filter value).

---

## 26. Analytics computation

`src/domain/analytics/` (pure) + `analyticsRepo` raw SQL (§21.5). Integer paise until the
formatter (§27). `period = { mode:'month'|'week', startMs, endMsExclusive }` from §27.3.

### 26.1 Core aggregates (SQL, per period)

```sql
SELECT
  COALESCE(SUM(CASE WHEN type='expense' THEN amountMinor END), 0) AS spentMinor,
  COALESCE(SUM(CASE WHEN type='income'  THEN amountMinor END), 0) AS incomeMinor
FROM "transaction"
WHERE deletedAt IS NULL AND occurredAt >= :startMs AND occurredAt < :endMsExclusive;
```

- **Balance (period)** = `incomeMinor − spentMinor` (JS; may be negative).
- **Savings rate** = `incomeMinor === 0 ? null : balance / incomeMinor` (line omitted when
  `null` — §9).
- **Arc-gauge fill** = `clamp(balance / incomeMinor, 0, 1)`; `incomeMinor === 0 ⇒ 0`; caption
  `"{round(fill*100)}% of income left"`. Negative balance ⇒ fill `0`, empty ring, Balance shown
  with a leading `−` (IMP-037).

### 26.2 Home hero — all-time running balance (D2)

```sql
SELECT COALESCE(SUM(CASE type WHEN 'income' THEN amountMinor WHEN 'expense' THEN -amountMinor END), 0)
FROM "transaction" WHERE deletedAt IS NULL;
```

No period filter; never an SMS "Avl Bal" — a computed net over the ledger (D2). May be negative.

### 26.3 Home tiles — MoM deltas (D2 / §9)

`spentMinor` / `incomeMinor` (§26.1) for the current calendar month `M` and previous `M−1`.
Tile delta = `prev === 0 ? null : (cur − prev) / prev`, shown as a signed `%` + trend glyph;
`null ⇒ "—"`. The top-bar month scopes the **tiles**, not the hero (D2).

### 26.4 By category — "Where it went"

```sql
SELECT categoryId, COALESCE(SUM(amountMinor),0) AS amountMinor, COUNT(*) AS n
FROM "transaction"
WHERE deletedAt IS NULL AND type='expense'
  AND occurredAt >= :startMs AND occurredAt < :endMsExclusive
GROUP BY categoryId ORDER BY amountMinor DESC;
```

`categoryId IS NULL` = the **Uncategorized** bucket (hatched, own row, "Fix N" — IMP-033). Row
share = `amountMinor / spentMinor` (guard `0`). Colour from the fixed category palette (§3.1) —
**the only coloured surface** (V-11); Uncategorized never coloured.

### 26.5 Largest expenses

Top `5` `type='expense'` in period by `amountMinor DESC`, ties by `occurredAt DESC`, `LIMIT 5` →
Details (IMP-034).

### 26.6 Daily series — "Day by day"

Pull `(occurredAt, amountMinor)` for `type='expense'` in the period, bucket in **JS** by
`dayIndex(occurredAt)` (§27.3 — correct local-day boundaries), then **zero-fill** every day from
period start to `min(periodEnd, today)`.

- **Mean daily spend** = `spentMinor / daysElapsed` — `daysElapsed` = local days from period
  start through **today** for the current incomplete period, else the period's full day count
  (IMP-035).
- **Median daily spend** = median of the **zero-filled** series (JS; mean of the two middles on
  an even count) — resists a rent-day spike.
- Both are also computed for the **previous period** (previous calendar month in Month mode;
  previous **ISO week** in Week mode — **CR-1** / D14) for the tile comparison; hidden when there
  is no previous-period data (IMP-032).
- **Dashed mean line** at the mean daily value, labelled `"avg ₹…"` (IMP-036).
- **Outlier scaling:** y-max = `max(p95 of non-zero daily values, 1)`; a day above the axis is
  clipped and inline-labelled `"₹X"` rather than compressing the rest (§9 / §6.10 edge).

### 26.7 Week mode (D14)

Same math; period = an **ISO week** (`date-fns startOfISOWeek` in the device zone → `+7d`). The
stepper moves one ISO week; "next" disabled on the current week. Comparison target = the
**previous ISO week**; the tile label reads **"Last week"** (CR-1). "Day by day" = 7 buckets.

### 26.8 Uncategorized count

`SELECT COUNT(*) FROM "transaction" WHERE deletedAt IS NULL AND type='expense' AND categoryId IS NULL`
— period-scoped for the Analytics "Fix N"; unscoped for the Home action-strip row (F7).

---

## 27. Formatting · time · undo · running balance

`src/domain/format/` + `src/domain/period.ts`. All pure, all unit-tested.

### 27.1 Money formatter (V-1)

`formatMoney(amountMinor, opts?: { sign?: 'always'|'none'; withCurrency?: boolean }): string`

- `₹` prefix (unless `withCurrency:false`); **Indian grouping** — `₹1,23,456` (last group 3
  digits, 2 thereafter). Hand-rolled on the integer rupee string — **not `Intl`** (Hermes `Intl`
  is partial).
- Rupees = `Math.trunc(amountMinor / 100)`; **paise shown only when non-zero**, always 2 digits
  (`₹12.50`, `₹12`).
- **Sign** (`opts.sign` default `'always'` for transaction amounts, `'none'` for neutral figures):
  leading `+` / `−` with a **thin space U+2009** before `₹` — `+ ₹1,15,000`, `− ₹842`. A negative
  input always shows `−`. Never colour (V-11).
- `formatCount(n)` → `n > 99 ? '99+' : String(n)`.
- `formatPercentDelta(x)` → `x == null ? '—' : (x>0?'+':'') + Math.round(x*100) + '%'`.

### 27.2 Dates & time (V-2)

`formatWhen(ts, now?)` — relative within ~7 days (`just now` < 60 s, `Nm ago`, `Nh ago`,
`Yesterday`, `N days ago`), absolute beyond (`3 Aug`, `3 Aug 2025` outside the current year).
`formatDayHeader(dayStartMs)` → `Today` / `Yesterday` / `Wed, 3 Sep`. `date-fns`, device
locale/zone. Day-grouping keys come from §27.3, never a raw `toDateString`.

### 27.3 Local boundaries & periods (P-11)

- `startOfLocalDay(ts)` / `endOfLocalDayExclusive(ts)` — `date-fns`, device zone.
- `dayIndex(ts)` — integer local-day count from the epoch (the grouping key).
- `monthPeriod(anchorTs)` → `{ mode:'month', startMs, endMsExclusive, label }`
  (`startOfMonth` → `startOfMonth(addMonths(1))`; label `August` or `Aug 2025`).
- `isoWeekPeriod(anchorTs)` → `{ mode:'week', …, label:'25 Aug – 31 Aug' }`
  (`startOfISOWeek` → `+7d`).
- `previousPeriod(period)` — one calendar month, or one ISO week, back (CR-1).
- `stepPeriod(period, dir: -1|+1)` — `+1` disallowed when the target `startMs > now` ("next"
  disabled — §6.10).
- Transaction `occurredAt` = the SMS timestamp when present, else `smsReceivedAt`, else
  `Date.now()` for manual (P-11).

### 27.4 Undo (P-3 / §6.7 / IMP-016)

`UNDO_WINDOW_MS = 5000` (snackbar), `PURGE_GRACE_MS = 60000` (§20.6).

1. Swipe-delete → confirm dialog → `softDeleteTransaction(id)` sets `deletedAt = now`; the row
   leaves every live query at once (all filter `deletedAt IS NULL`) and collapses (motion §3.5).
2. `useUndo` shows the snackbar for `UNDO_WINDOW_MS` with a single **Undo**.
3. **Undo** → `restoreTransaction(id)` clears `deletedAt`; the row re-enters with the insert
   animation.
4. No action → the snackbar hides; the row is **already** persistently soft-deleted. It is hard
   `DELETE`d by the launch purge once `deletedAt < now − PURGE_GRACE_MS`. **No timer writes to
   the DB.** Killing the app inside the window leaves an invisible, non-undoable soft-deleted row
   (equivalent to the delete having completed).
5. Deleting a transaction that came from a Suggestion does **not** resurrect the Suggestion (it
   is `confirmed`, purged at 24 h).

### 27.5 Running balance

`analyticsRepo.useRunningBalance()` = the §26.2 query. Rendered `formatMoney(v, { sign:'none' })`
so only a genuine negative shows `−` (the hero label is "Total balance", not a signed delta —
IMP-010).

### 27.6 Deferred

`date-fns` locale wiring + the Hermes grouping shim details (Phase 4, when components consume
them) · the final `SENDER_SEED` contents (curated during Phase 3 implementation; device-driven
expansion is Future) · keyword tuning from the first real-SMS field test.

---

## 28. Navigation

### 28.0 §16 addendum (Phase 4)

Added: `lucide-react-native` (icons, §29.2) · `expo-linear-gradient` `~57.x` (only as a fallback
for `<AppBackground>`; primary is `react-native-svg`, already pinned). No other change.

### 28.1 Route tree (final — supersedes §18.2 where they differ)

```
src/app/
  _layout.tsx        <MigrationGate> → providers → <Redirect> to (onboarding) while !onboardingDone,
                     else renders <Stack screenOptions={{ headerShown:false }}>. Reads the cold-start
                     deep link here (§28.4). Providers, outer→inner:
                     GestureHandlerRootView · SafeAreaProvider · SentryWrap · <AppBackground> ·
                     ThemeProvider(dark) · BottomSheetModalProvider · SheetRegistryProvider ·
                     AnimatedSplashOverlay
  (onboarding)/
    _layout.tsx      <Stack> — full-screen, own back stack; Back allowed after step 1 (§6.1)
    welcome.tsx  ·  permissions.tsx  ·  categories.tsx
  (tabs)/
    _layout.tsx      <Tabs tabBar={p => <CoinFlowTabBar {...p}/>}
                       screenOptions={{ headerShown:false, animation:'none' }}>   (tab switch = cross-fade, §3.5)
                     unstable_settings.initialRouteName = 'index'
    index.tsx        Home                     transactions.tsx   Transactions
    analytics.tsx    Analytics                settings.tsx       Settings
  review-queue.tsx           pushed, native transition (slow, §3.5)
  transaction/[id].tsx       pushed — Details
  categories/index.tsx       pushed — Manage categories
  settings/
    payment-methods.tsx · sms-notifications.tsx · account-rules.tsx · data.tsx · about.tsx   (pushed)
  +not-found.tsx
```

Top bars are custom components (§3.6), so every route sets `headerShown:false`. Pushed pages use
the native-stack transition (`slow` — iOS slide-from-right / Android shared-axis X, §3.5). The
tab switch does **not** slide — outgoing content cross-fades to incoming over `base`; scroll +
state preserved (§4 / §3.5).

### 28.2 The sheet layer — `SheetRegistry` (D25)

`SheetRegistryProvider` is mounted once in the root layout, inside `BottomSheetModalProvider`,
**above** the navigator so a sheet floats over any route. Store (`useSheetRegistry`, §22.2):

```ts
type SheetName = 'add' | 'edit' | 'confirm' | 'filter'
              | 'categoryPicker' | 'createCategory' | 'editCategory';
interface SheetRegistry {
  current: SheetName | null;
  params: SheetParamMap[SheetName] | null;          // e.g. confirm → { suggestionId: string }
  open<N extends SheetName>(name: N, params: SheetParamMap[N]): void;
  close(): void;                                    // hard close
  requestClose(): void;                             // dirty-guarded close (V-6)
}
```

- A single `<SheetHost>` renders one `<BottomSheetModal>` and switches its child on `current`
  (`AddSheet` / `EditSheet` / `ConfirmSheet` / `FilterSheet` / `CategoryPickerSheet` /
  `CreateCategorySheet` / `EditCategorySheet`). `onDismiss → close()`.
- `requestClose()` reads the active sheet's `dirty` flag (`useAddSheetDraft` for add/edit/confirm,
  `useFilterDraft` for filter, local state for the category sheets). Dirty → show the discard
  `ConfirmDialog` (V-6 / §3.6); not dirty → `close()`. The `@gorhom` swipe-down / scrim-tap are
  wired to `requestClose`, not `close`.
- **Snap points:** the keypad sheets (`add`/`edit`/`confirm`) use one large snap (~92% — the
  amount block + docked keypad + pinned primary button, §6.4); `filter` / `categoryPicker` /
  `createCategory` / `editCategory` size to content (`enableDynamicSizing`).
- **Keypad ↔ OS keyboard (§6.4 / §3.5):** the keypad-sheet body owns a `keypadMode` in
  `useKeypad` (`'amount'` vs `'text'`). Focusing Account / Note / Description sets `'text'` →
  the in-app `NumericKeypad` slides out (`base accelerate`) as the OS keyboard rises and the
  amount collapses to the sticky summary bar; blurring back to the amount reverses it. The
  primary **Add/Save** button is pinned below the keypad in `'amount'` mode and rides just above
  the OS keyboard (input-accessory style) in `'text'` mode.
- Not expo-router modal routes — that behaviour set needs one controlled `@gorhom` host (D25).

### 28.3 Notification deep links (`coinflow://`)

| Notification payload / tap | Link | Target |
|---|---|---|
| single Suggestion, `pending`, body tap | `coinflow://review?open=<suggestionId>` | Review Queue mounts, then `sheets.open('confirm', { suggestionId })` |
| group (2+ pending), tap | `coinflow://review` | Review Queue |
| tap on a Suggestion now `confirmed` (stale) | `coinflow://transaction/<txnId>` | Details |
| Suggestion `dismissed` / txn deleted | `coinflow://` | Home |
| action button **Add** (app foregrounds) | — | same as `review?open=<id>` |
| action buttons **Save** / **Discard** | — | handled headless by `NOTIFICATION_RESPONSE_TASK` (§17.4b / §31); **no navigation** |

Cold start: after `<MigrationGate>` resolves, `_layout.tsx` reads
`Notifications.getLastNotificationResponseAsync()` then `Linking.getInitialURL()` and routes
once. Warm: `Notifications.addNotificationResponseReceivedListener` + a `Linking` `url` listener.
`initialRouteName='index'` guarantees Home sits under any deep-pushed screen for Back.

### 28.4 Reduce-Motion

`src/constants/motion.ts` — the three duration tokens (`fast 120 / base 200 / slow 320`) and
three easings (§3.5) + `resolveMotion(spec, reduced)` returning the spec or an opacity-only /
instant variant. `useReducedMotion()` (`src/hooks/use-reduce-motion.ts`) wraps reanimated's hook
with an `AccessibilityInfo.isReduceMotionEnabled` fallback and a listener. **One hook**, consumed
by the motion factories (§29.5) — not ad-hoc per-component checks.

---

## 29. Component architecture + `theme.ts` rewrite

### 29.1 `theme.ts` rewrite (§3.7 — this section is the build target)

```ts
// src/constants/theme.ts  (V1 = one dark theme; Colors.light mirrors Colors.dark, §2)
export const Colors = {
  dark: {
    bg:'#0d0e14', bgTop:'#1b2238', surface:'#16171d', surface2:'#1c1e26', surface3:'#262832',
    hairline:'#2b2d38', text:'#f5f5f6', text2:'#9a9aa1', text3:'#85858c',
    primary:'#ffffff', primaryInk:'#0b0b0c',
  },
};
Colors.light = Colors.dark;                       // dark-only V1; use-color-scheme.ts pins 'dark'
export type ThemeColor = keyof typeof Colors.dark;

export const CategoryPalette = {                  // §3.1 — ONLY the Analytics "Where it went" (V-11)
  bills:'#7fb2e8', food:'#efa98c', groceries:'#93ce85', transport:'#b69be0', shopping:'#e6c36b',
  entertainment:'#e79bc5', health:'#e58f8b', education:'#6fcec0', other:'#9aa0a6',
} as const;                                       // Uncategorized → a hatched grey, never a hue

export const Radius = { pill:999, card:24, sheet:28, control:14, txnCard:18, iconTile:13, iconTileSm:11 };
export const Elevation = {                        // §3.3 — card surfaces only; controls stay flat
  card: { shadow:'0 8px 24px rgba(0,0,0,.5), 0 1px 4px rgba(0,0,0,.4)', topEdge:'rgba(255,255,255,.05)' },
  pop:  { shadow:'0 12px 34px rgba(0,0,0,.6), 0 3px 10px rgba(0,0,0,.45)' },                     // nav pill, popovers
};
export const Fonts = Platform.select({           // bundled via expo-font; system stack fallback
  default: { sans:'Geist', display:'Manrope', mono:'monospace' },
  ios:     { sans:'Geist', display:'Manrope', mono:'ui-monospace' },
});
// Spacing unchanged (half2 one4 two8 three16 four24 five32 six64); BottomTabInset, MaxContentWidth kept.
```

- **Fonts:** `expo-font` `useFonts` loads Manrope + Geist TTFs at weights **400 / 500 / 600 /
  700** (+ Manrope **300** for the lock-screen clock only, §3.2). `Fonts.mono` reserved, unused.
- **`<AppBackground>`** (`src/ui/app-background.tsx`) — the §3.1 radial ground
  (`radial-gradient(135% 54% at 50% -8%, bgTop 0%, #0e0f18 42%, #090a0d 100%)`) drawn full-bleed
  with `react-native-svg` `<RadialGradient>` behind the navigator; `expo-linear-gradient`
  three-stop vertical approximation is the documented fallback. Ambient only — never on a
  foreground element (V-11).
- `use-color-scheme.ts` / `.web.ts` → return `'dark'` constant (V1). `ThemeProvider` value =
  dark.

### 29.2 Icon wrapper

`src/ui/icon.tsx` — `<Icon name={IconName} size={number} color={ThemeColor} />`, wraps
`lucide-react-native`, forces `strokeWidth={1.6}` (§3.4), resolves `color` from the theme.
`IconName` = the §3.4 chrome glyph union ∪ the payment-method icons ∪
`src/constants/category-icons.ts` (keyed by category `key`; confirms the §20.5 proposal against
the real package — `food→utensils`, `transport→bus`, `groceries→shopping-basket`, `bills→receipt`,
`shopping→shopping-bag`, `entertainment→clapperboard`, `health→heart-pulse`,
`education→graduation-cap`, `other→shapes`, `uncategorized→help-circle`, `income→arrow-down-to-line`).
The icon **picker** grid (§6.12) offers a fixed ~30-glyph subset of the same union.

### 29.3 `ThemedText` / `ThemedView` (moved to `src/ui/`; template `src/components/themed-*` deleted)

`ThemedText` — `type` = a §3.2 role; family + size + weight + tracking + `tabular-nums` fixed per
role:

| `type` | px / weight / tracking | family | tabular |
|---|---|---|---|
| `amountHero` | 44–52 / 700 / −0.02em | Manrope | ✓ |
| `balanceHero` | 46 / 700 / −0.022em | Manrope | ✓ |
| `analyticsNet` | 27 / 700 / −0.015em | Manrope | ✓ |
| `title` | 17–20 / 600 / −0.01em | Manrope | — |
| `body` | 15 / 400 / 0 | Geist | — |
| `label` | 13 / 500 / 0 | Geist | — |
| `caption` | 12.5 / 500 / 0 | Geist | ✓ (numeric) |
| `micro` | 11.5 / 600 / 0 | Geist | ✓ (numeric) |

Optional `themeColor?: ThemeColor` (default `text` for ≥`title`, `text2` for `body`/`label`,
`text3` for `caption`/`micro`). `ThemedView` — `surface?: 'bg'|'surface'|'surface2'|'surface3'`,
`elevation?: 'card'|'pop'` (applies the §3.3 shadow + hairline top edge). Build every screen from
these, not bare `<Text>` / `<View>` (§3.7).

### 29.4 Component catalog → files + contracts

`src/ui/` = design-system primitives (theme-only deps). `src/features/*/components/` = components
that read repos/stores. All ~45 of §3.6:

| Component | File | Key props | Used by | Notes |
|---|---|---|---|---|
| `TopBar` | `ui/top-bar.tsx` | `variant:'brand'\|'title'\|'back'`, `title?`, `month?`, `count?`, `onBack?`, `right?` | every screen | sticky, gradient-masked (§3.6) |
| `CoinFlowTabBar` | `features/app-shell/tab-bar.tsx` | `BottomTabBarProps` | `(tabs)/_layout` | 4 tabs + raised centre **Add** (opens `sheets.open('add')`); active `text`, rest `text3`; `pop` elevation; blurred pill |
| `AddButton` (FAB notch) | `features/app-shell/add-button.tsx` | `onPress` | tab bar | filled `primary`, never a selected state (§6.16) |
| `PermissionBanner` | `ui/permission-banner.tsx` | `kind:'sms'\|'notif'`, `onEnable`, `onDismiss` | Home, Review Queue | neutral inset, not tinted (V-9); shown per §30 rules |
| `Badge` | `ui/badge.tsx` | `count` | tab bar, action strip | `surface3`/`text2`, `formatCount` (§27.1) |
| `Button` | `ui/button.tsx` | `variant:'primary'\|'ghost'\|'disabled'`, `loading?`, `onPress`, `children` | sheets, states | pill, 700 label; `loading` → spinner, locks (§6.4) |
| `Card` | `ui/card.tsx` | `elevation?`, `padding?` | hero, analytics, txn rows | `surface` + `Elevation.card` |
| `BalanceHero` | `features/home/balance-hero.tsx` | `runningMinor` | Home | "Total balance" + `balanceHero` figure, de-emphasised `₹` (§6.2) |
| `StatTile` | `ui/stat-tile.tsx` | `label`, `valueMinor`, `delta?:{pct\|null}`, `deltaLabel?` | Home Income/Spending, Analytics Mean/Median | display-only; delta line + trend glyph; `deltaLabel` = "Last month"/"Last week" (CR-1) |
| `ActionStripRow` | `features/home/action-strip.tsx` | `kind:'review'\|'uncat'`, `count`, `onPress` | Home | fill-dot vs ring marker (not colour); chevron; render only when `count>0` |
| `TransactionCard` | `ui/transaction-card.tsx` | `txn`, `showTime?`, `onPress`, `onSwipeDelete?` | Home Recent, Transactions | icon tile (inverts for income), label = note→account→"No note", meta = category name (+ rel. time on Home only), signed amount; Uncategorized = "?" tile + dashed-underline word (V-4) |
| `DayGroupHeader` | `ui/day-group-header.tsx` | `dayStartMs`, `subtotalMinor?` | Transactions | plain label between card groups, not a card (§6.7) |
| `SuggestionCard` | `features/detection/suggestion-card.tsx` | `suggestion`, `known:boolean`, `onOpen`, `onSave?`, `onDismiss` | Review Queue | method icon tile + signed amount + neutral descriptor ("UPI payment") + rel. time + overflow; inline **Save** only when `known` |
| `Sheet` / `SheetHost` | `ui/sheet.tsx`, `features/app-shell/sheet-host.tsx` | — | all sheets | grabber, scrim, `requestClose` on swipe/scrim (§28.2) |
| `KeypadSheetScaffold` | `ui/keypad-sheet-scaffold.tsx` | `title`, `amountSlot`, `fieldsSlot`, `primaryLabel`, `onPrimary`, `primaryDisabled?` | Add/Edit/Confirm | docks `NumericKeypad`, pins primary below it, collapse-on-scroll amount, keypad↔keyboard swap (§6.4 / §28.2) |
| `AmountInput` | `ui/amount-input.tsx` | `amountMinor`, `mode:'full'\|'summary'`, `helper?` | keypad sheets | 52px centred figure + caret, `₹` in `text3`, helper for 0 / over-max (V-10) |
| `NumericKeypad` | `ui/numeric-keypad.tsx` | `onKey(k:'0'..'9'\|'.'\|'back')` | keypad sheets | 3×4, 62px keys, hairline grid, amount-only |
| `SegmentedControl` | `ui/segmented-control.tsx` | `options`, `value`, `onChange` | direction, Analytics Month/Week, Filter type | selected pill slides (`fast`), `surface3` lift |
| `SelectorRow` | `ui/selector-row.tsx` | `icon`, `label`, `value?`, `onPress` | category / method / date rows in sheets | icon+label+value+chevron → opens a picker |
| `TextField` | `ui/text-field.tsx` | `value`, `onChangeText`, `state:'empty'\|'filled'\|'focus'`, `multiline?`, `maxLength?` | account/note/description, category name | inset `surface2`; focus = `primary` border |
| `AccountAutocomplete` | `features/transactions/account-autocomplete.tsx` | `query`, `onPick(rule)` | Add/Edit/Confirm | bordered list under the account field; row = account + remembered note/category ("categorises as Food") or "new" |
| `Chip` | `ui/chip.tsx` | `variant:'category'\|'uncategorized'\|'filter'`, `label`, `onRemove?` | Details meta, Filter | Uncategorized = dashed `text3` outline; filter chip has ✕ |
| `CategoryPickerSheet` | `features/categories/category-picker-sheet.tsx` | `value:categoryId\|null`, `onSelect` | Confirm/Add/Edit | full sheet; Uncategorized + 9 rows; current = check; "Manage categories →" foot |
| `FilterBlocks` | `features/transactions/filter-blocks.tsx` | `draft`, `onChange` | Filter sheet | category chips / type segment / method chips / date-range presets + custom; Reset + "Show N results" |
| `ArcGauge` | `features/analytics/arc-gauge.tsx` | `fill:0..1`, `balanceMinor`, `caption` | Analytics "This month" | greyscale continuous arc; `d3-shape` arc; empty when `fill=0` (IMP-037) |
| `CategoryBreakdown` | `features/analytics/category-breakdown.tsx` | `rows:{key,amountMinor,share}[]` | Analytics "Where it went" | ranked rows (dot+bar) + donut; **only** coloured surface (`CategoryPalette`); Uncategorized hatched + "Fix N" |
| `DayByDayChart` | `features/analytics/day-by-day-chart.tsx` | `series:number[]`, `mean`, `outlierIdx?` | Analytics | greyscale area/line + dashed mean line "avg ₹…"; outlier clipped + labelled (§26.6); `d3-shape`/`d3-scale` |
| `BiggestExpenses` | `features/analytics/biggest-expenses.tsx` | `rows:txn[]` | Analytics | top ~5 → Details |
| `PeriodControl` | `features/analytics/period-control.tsx` | `period`, `onStep(dir)`, `onModeChange` | Analytics | Month/Week segment + `‹ label ›` stepper; next disabled on current (§27.3) |
| `ConfirmDialog` | `ui/confirm-dialog.tsx` | `glyph`, `title`, `body`, `confirmLabel`, `destructive?`, `twoStep?`, `onConfirm`, `onCancel` | delete, discard, clear-all | stacked actions, filled confirm on top, plain-text Cancel; no red (V-7); `twoStep` adds the type-`CONFIRM` field |
| `UndoSnackbar` | `ui/undo-snackbar.tsx` | `message`, `onUndo` | Transactions/Details delete | translucent bar above nav, ~5s (§27.4) |
| `Toast` | `ui/toast.tsx` | `message`, `action?` | post-add "View" | bottom, above nav, ~5s |
| `EmptyState` | `ui/empty-state.tsx` | `glyph`, `line`, `cta?` | every list/summary | exactly one primary action (UI-003) |
| `Skeleton` | `ui/skeleton.tsx` | `layout` preset | every screen loading | neutral `surface3` blocks matching final layout, no spinner (V-3) |
| `ErrorState` | `ui/error-state.tsx` | `message`, `onRetry` | every screen error | alert glyph + short line + hairline **Try again** (UI-004) |
| `ProvenanceLine` | `features/transactions/provenance-line.tsx` | `sender`, `date` | Details (detected only) | "Detected automatically · <bank> · <date>" — no SMS body (P-9) |
| `DetailFieldRow` | `ui/detail-field-row.tsx` | `label`, `value` | Details | key (`text3`) over value |
| `OnboardingStepFrame` | `features/onboarding/step-frame.tsx` | `step:1..3`, `art`, `heading`, `primaryLabel`, `onNext`, `onBack?` | onboarding | 3-dot progress, abstract B&W art, one bottom primary |
| `PermissionCard` | `features/onboarding/permission-card.tsx` | `kind`, `state:'idle'\|'granted'\|'denied'`, `optional?`, `onRequest` | onboarding step 2, Settings › SMS & notifications | icon tile + why + Allow/status; Notifications marked **Optional** (UI-063) |
| `SettingsGroup` / `SettingsRow` | `ui/settings-list.tsx` | `label`, `rows:{label,sub?,danger?,onPress}[]` | Settings + subpages | inset `surface2` groups; `sub` line ("Off"); `danger` bold label variant |
| `AccountRuleRow` | `features/settings/account-rule-row.tsx` | `rule`, `onEdit`, `onDelete` | Account rules | lifted card: account · note · category chip · hit count |
| `IconPicker` | `ui/icon-picker.tsx` | `value`, `onChange` | Create/Edit Category | fixed 6-wide grid; selected cell inverts (identity, no colour) |

### 29.5 Motion factories

`src/ui/motion/` — reanimated `entering`/`exiting`/`layout` factories, each taking `{ reduced }`
and pulling tokens from `src/constants/motion.ts` (§28.4): `sheetTransition` (slide-up `slow
decelerate` / scrim `base`; reduced = fade), `snackbarTransition` (`base decelerate` up),
`listRowTransition` (height+opacity `base` + neighbour layout), `dialogTransition` (scrim `base` +
card .96→1 `base standard`), `segmentThumb` (`fast standard`), `pressScale` (→.97 over `fast`, no
bounce). Stack/tab transitions come from the navigator config (§28.1).

---

## 30. Screen specs (data + state binding)

Per screen: **reads** (repo hooks, §21) · **stores** (§22.2) · **actions/writes** · **states**
(delta from the V-3 baseline — skeleton / empty / error) · **satisfies** (`UI-0xx` §7 UI-UX /
`IMP-0xx` §13) · **nav**.

### 30.1 Onboarding — Welcome (`(onboarding)/welcome.tsx`)
reads none · stores `useOnboarding.step=1` · actions **Get started** → `permissions` · states
static (no V-3) · satisfies UI-062 · nav: entered by the root `<Redirect>` on first launch.

### 30.2 Onboarding — Permissions (`permissions.tsx`)
reads live OS permission status (`coinflowSms.getPermissionsAsync`,
`Notifications.getPermissionsAsync`; re-check on `AppState→active`, §22.4) · stores
`useOnboarding.step=2` · actions **Allow** per card → OS dialog; permanently-denied → deep-link
to system settings (IMP-042); **Continue** always enabled (no permission is mandatory, §11) ·
states static · satisfies UI-063, IMP-040/041/042 · nav → `categories`; Back → `welcome`.

### 30.3 Onboarding — Category review (`categories.tsx`)
reads `categoryRepo.useCategories()` (the seeded set, §20.5) · stores `useOnboarding` toggles +
optional order · actions toggle a default off/on, optional reorder → commit on **Done**:
`categoryRepo.reorderCategories` + soft-hide deselected (mark not-shown — or just leave; V1:
deselect = delete the default row, reversible later via re-add) → `setSetting('onboardingDone',
true)` → replace nav with `(tabs)` · states static · satisfies UI-060/062, IMP-017 · nav → Home;
Back → `permissions`.

### 30.4 Home (`(tabs)/index.tsx`)
reads `useRunningBalance` · `usePeriodSummary(currentMonth)` + `useMoMDeltas` · `usePendingCount`
· `useUncategorizedCount()` · `useRecentTransactions(8)` · live OS permission status ·
`useSetting('*BannerDismissedAt')` · stores `useSheetRegistry` (centre Add) · actions: Add →
`sheets.open('add')`; "N to review" → `/review-queue`; "N uncategorized" →
`/transactions?filter=uncategorized`; "See all" → `/transactions`; a card → `/transaction/[id]`;
banner Enable / dismiss · states: **skeleton** = hero block + 2 tiles + 3 card rows; **empty
(new user)** hero `₹0`, tiles `₹0` + "no prior month", no action strip, Recent → EmptyState
("No transactions yet…" + Add); **error** hero area → "Couldn't load your data" + Retry ·
satisfies UI-010..014, IMP-020 (uncat counted), D2 · nav: tab.

### 30.5 Review Queue (`review-queue.tsx`)
reads `usePendingSuggestions()` (+ per-row `getAccountRule(normalizedKey)` for known/new) · live
permission status · stores `useSheetRegistry` · actions: row body → `sheets.open('confirm',
{suggestionId})`; inline **Save** (known only) → `insertTransaction` + `confirmSuggestion` +
`upsertFromTransaction` in one txn (§17.4b shared path); swipe → `dismissSuggestion` (hard
delete); **Dismiss all** → `ConfirmDialog` → `dismissAllPending` · states: **empty** = calm
"You're all caught up." (not an error, UI-023); **skeleton** = 4 suggestion-card blocks ·
satisfies UI-023/024, IMP-003/004/005/007 · nav: pushed from Home / deep link; Back → Home.

### 30.6 Transaction Confirmation sheet (`ConfirmSheet`)
reads `getSuggestion(id)` (seed once) · `useCategories` · `searchByPrefix` for the account
autocomplete · on account match `resolveCategoryForAccount` to pre-fill · stores
`useAddSheetDraft(mode:'confirm')` + `useKeypad` · actions: edit any field; **Add** →
`insertTransaction` (+ `confirmSuggestion` + `upsertFromTransaction`, one txn) → toast "Added …
· View"; **Cancel** / swipe → `requestClose` (dirty ⇒ discard confirm), Suggestion stays pending
(IMP-006) · states: *submitting* (Add spinner, sheet locked, not dismissible); *save error*
inline above Add · edge: amount 0 / >₹10,00,000 → helper + extra confirm (IMP-008); Income →
hide category row (UI-022) · satisfies UI-020/021/045, IMP-003/005/008 · nav: over Review Queue /
deep link.

### 30.7 Add sheet (`AddSheet`)
reads `useCategories` · `searchByPrefix` · `resolveCategoryForAccount` on pick · stores
`useAddSheetDraft(mode:'add')` + `useKeypad` · defaults: direction Expense, method UPI, category
Uncategorized (hidden if Income), date now · actions: **Add** (disabled until `amountMinor>0`) →
`insertTransaction` (+ `upsertFromTransaction` when account set) → toast; **Cancel** →
`requestClose` · states: *invalid* (amount 0/empty → inline, Add disabled), *submitting*, *save
error* · edge: paise shown when typed; future date → "scheduled?" helper · satisfies UI-030/032/045,
IMP-010/011/012/013 · nav: centre Add from any tab; empty-state CTAs.

### 30.8 Edit sheet (`EditSheet`)
reads `getTransaction(id)` (seed) + same helpers · stores `useAddSheetDraft(mode:'edit',
sourceId)` · actions: **Save** → `updateTransaction` (+ `upsertFromTransaction`; `editedByUser=1`)
; **Cancel** → `requestClose` (dirty ⇒ discard confirm) · states as Add + *invalid* when a
required field is cleared · satisfies UI-031, IMP-013 · nav: from Details.

### 30.9 Transactions (`(tabs)/transactions.tsx`)
reads `useTransactionList(query)` (FlashList; FTS join when `search` set) · `useDaySubtotals` ·
applied filter from **route params** (survives tab switch / deep link, §22.2) · stores
`useFilterDraft` (only while the Filter sheet is open) · actions: search input;
**Filter** → `sheets.open('filter')`; remove a filter chip; row → `/transaction/[id]`; swipe →
`ConfirmDialog` → `softDeleteTransaction` + `UndoSnackbar` (`restoreTransaction`) · states:
**empty (no data)** EmptyState + Add; **empty (no matches)** "No transactions match" + Clear
filters (visually distinct, UI-042); **loading** skeleton day-group + rows; **loading more**
footer spinner · edge: 2,000+ virtualized; deleting a day's last row drops its header ·
satisfies UI-040..043, IMP-015/016/018 · nav: tab; entered pre-filtered from Home / Analytics.

### 30.10 Transaction Details (`transaction/[id].tsx`)
reads `useTransaction(id)` · `getCategoryMap` for the chip · stores none · actions: **Edit** →
`sheets.open('edit',{id})`; overflow **Delete** → `ConfirmDialog` → `softDeleteTransaction` →
pop, `UndoSnackbar` on the previous screen; inline **Set category** (Uncategorized) →
`sheets.open('categoryPicker')` → `updateTransaction` (+ rule upsert) · states: *manual* (no
provenance line); *deleting*; *deleted* (pops) · edge: missing note → "Add a note"; future date
plain · satisfies UI-044/046, IMP-013/016 · nav: pushed from any row / post-add toast / stale
notification.

### 30.11 Filter sheet (`FilterSheet`)
reads `useCategories` for the chips; a debounced count via `useTransactionList(draftQuery).length`
for "Show N results" · stores `useFilterDraft` · actions: adjust blocks; **Reset** (disabled when
no filters); **Apply** → write the applied filter to Transactions route params, `close()` · edge:
custom range start>end → inline error on Apply · satisfies UI-041, IMP-015 · nav: over Transactions.

### 30.12 Analytics (`(tabs)/analytics.tsx`)
reads `usePeriodSummary(period)` · `useCategoryBreakdown` · `useDailySeries` (+ mean/median, this
period **and** previous — §26.6) · `useLargestExpenses` · `useUncategorizedCount(period)` ·
stores `useAnalyticsPeriod` (mode + anchor; optional persist `analyticsPeriodMode`) · actions:
Month/Week + stepper (`stepPeriod`, next disabled on current); a category row →
`/transactions?category=<id>&period=…`; a biggest-expense row → Details; "Fix N" →
`/transactions?filter=uncategorized&period=…` · states: **empty (period)** "Nothing recorded for
August" + Add / step; **insufficient (no prior period)** hide the "Last month/week …" tile values
(CR-1); **loading** skeleton cards + chart placeholders · edge: one category ≈90%; income but
zero spend; negative Balance (leading −, full arc); incomplete month → days-elapsed averages ·
satisfies UI-050..056, IMP-030..038 · nav: tab.

### 30.13 Categories (`categories/index.tsx`)
reads `useCategories()` (+ P2 usage counts) · actions: **＋ Add** → `sheets.open('createCategory')`;
row → `sheets.open('editCategory',{id})`; swipe → `ConfirmDialog` ("N transactions become
Uncategorized", count from `deleteCategory`) → reassign + delete; **Other** / **Uncategorized**
have no swipe (silent, no lock icon) · states: Custom section empty → "No custom categories yet" ·
satisfies UI-060, IMP-017/018 · nav: pushed from Settings / any category selector's "Manage".

### 30.14 Create / Edit Category sheet (`CreateCategorySheet` / `EditCategorySheet`)
reads `useCategories` (for the uniqueness check) · stores local form state · actions: name
(≤24, unique case-insensitive — else inline error, IMP-019) + `IconPicker`; **Save** →
`createCategory` / `updateCategory`; on edit (custom only) **Delete** (ghost) → same confirm as
§30.13 · satisfies UI-061 · nav: over Categories.

### 30.15 Settings (`(tabs)/settings.tsx`)
reads `useSetting` for the SMS/Notifications subtitle (On/Off) · static list → **Categories**,
**Payment methods**, **SMS & notifications** (warning glyph when off), **Account rules**,
**Data**, **About**; version in the footer · nav: each row pushes its subpage · satisfies UI-064.

### 30.16 Settings subpages
- **Payment methods** (`payment-methods.tsx`) — static read-only list of the 5 methods + icons;
  footer "Custom accounts are coming later."
- **SMS & notifications** (`sms-notifications.tsx`) — reads live OS status; two `PermissionCard`s
  (SMS; Notifications = **Optional**) with Enable / **Open system settings**; a "Which messages
  CoinFlow reads" explainer. Satisfies UI-063/064, IMP-040/042; re-check on `AppState→active`.
- **Account rules** (`account-rules.tsx`, D16 / P2) — reads `useAccountRules()`; `AccountRuleRow`
  list; row → edit note/category (`updateAccountRule`); swipe → `deleteAccountRule`; empty state
  until the first rule. Backs F8.
- **Data** (`data.tsx`) — **Export** row → `exportJson` + `exportCsv` → `Sharing.shareAsync`
  (IMP-043); **Clear all data** (danger) → two-step `ConfirmDialog` (type `CONFIRM`) →
  `clearAllData` → relaunch into onboarding (IMP-044/065).
- **About** (`about.tsx`) — version; "All your data stays on this device."; licenses + help
  links.

### 30.17 Transaction notification (system surface)
Not a screen — its content, channel, category actions, and known-vs-new action set are specified
in **§31** (Phase 5). Deep-link targets are §28.3. Satisfies UI-024, IMP-003.

### 30.18 Delivered in Phase 5

The notification surface build → **§31**; the error-state / logging matrix → **§32**; the
per-screen `test-id` map feeding `IMP-0xx → test` → **§34.4**.

---

## 31. Notifications

> Reconciles §10 (behaviour) and §17 (the headless pipeline). No new dependency —
> `expo-notifications ~57.0.15` + `expo-task-manager ~57.0.14` were pinned in §16.4. All posting
> and all response handling is JS/TS (D18 / D23 / D24); the Kotlin side never touches
> `expo-notifications`.

### 31.1 Channel

One Android channel, created at first app launch and re-asserted on every launch (idempotent):

| Field | Value |
|---|---|
| `id` | `txn-review` |
| `name` | "Transaction review" |
| `importance` | `HIGH` (heads-up + lock screen; the core loop must be actionable without opening the app) |
| `sound` | default |
| `vibrationPattern` | short single pulse |
| `lockscreenVisibility` | `PRIVATE` — title/body hidden behind the user's secure-lock-screen setting; CoinFlow does not force `PUBLIC` because the title carries an amount |
| `bypassDnd` | false |
| `showBadge` | true |

No second channel in V1 (no reminders, no digests). The channel is created via
`Notifications.setNotificationChannelAsync('txn-review', …)` from a `src/services/notifications/channel.ts` helper called by both the app-launch bootstrap and `SMS_INGEST_TASK` step 7 (a headless post must not assume the UI ever ran).

### 31.2 Categories & the known-vs-new action switch

Two `expo-notifications` categories, registered at module scope in
`src/services/notifications/categories.ts` (imported from the app entry alongside the task
definitions, §17.2, so they exist in a headless context):

| Category id | Buttons (in order) | When used |
|---|---|---|
| `txn-known` | **Save** · **Add** · **Discard** | the parsed account matched an `AccountRule` **that has a category** (§25.1) |
| `txn-new` | **Add** · **Discard** | no rule, or a rule with no category yet |

Button config:

| Button | `identifier` | `opensAppToForeground` | `options` |
|---|---|---|---|
| Save | `SAVE` | `false` | — writes headless (§31.5) |
| Add | `ADD` | `true` | — foregrounds into the Confirmation sheet |
| Discard | `DISCARD` | `false`, `isDestructive: true` | writes headless |

`Save` appears **only** in `txn-known`. Per §6.15 / IMP-003: when the rule has a category but no
stored note, the button is still just **Save** (it writes with `note = null`). The group summary
(§31.4) carries **no** action buttons.

### 31.3 Content & data payload

Built by `buildTxnNotification(suggestion, rule)` in `src/services/notifications/content.ts`:

- **title** — `formatMoney(amountMinor, {signed:false})` + ` ` + `debited` \| `credited`
  (direction word, not a sign — the lock screen has no CoinFlow typographic context). Example:
  `₹450 debited`.
- **body** — `account` + ` · ` + payment-method label; `Unknown account` when `account` is null
  (§6.15). Example: `Swiggy · UPI`.
- **`categoryIdentifier`** — `txn-known` or `txn-new` per §31.2.
- **`data`** (the routing payload, JSON-safe, **no** financial fields beyond ids):
  ```ts
  { kind: 'suggestion', suggestionId: string, dedupeKey: string,
    ruleKey: string | null, postedAt: number }
  ```
  `amountMinor` / `account` / `note` are **not** put in `data` — the headless response re-reads
  the `Suggestion` row by `suggestionId` (it is the source of truth and may have changed).
- **`identifier`** (the notification's own id) — `sug:<suggestionId>`, so a later run can find and
  update/cancel it deterministically.
- **`threadId` / group key** — `txn-review-group` on every post, so the OS can visually stack them
  and the summary (§31.4) owns the same key.

### 31.4 Posting — single vs group (`SMS_INGEST_TASK` step 7)

After the `Suggestion` is durably written (§17.3 step 5) and the rule looked up (step 6):

1. Read `pendingCount = count(suggestion WHERE status='pending')`.
2. **`pendingCount === 1`** → post one notification (`sug:<id>`, §31.3). Cancel any stale group
   summary.
3. **`pendingCount >= 2`** → post/replace the **group summary**: `identifier = 'txn-group'`,
   title `"N transactions to review"`, body empty, **no category / no buttons**, same `threadId`.
   Individual per-suggestion notifications posted earlier are **left in place** (Android stacks
   them under the summary); newly, for the 2nd+ suggestion CoinFlow still posts its individual
   `sug:<id>` notification first, then the summary — so expanding the stack shows each one, and
   IMP-004's "no per-item Add/Discard on the group" is satisfied because the **summary itself**
   carries no buttons.
4. `data` on the summary: `{ kind: 'group' }`.

This runs identically whether the JS context was started by the UI or by the SMS receiver.

### 31.5 Response handling

`Notifications.setNotificationCategoryAsync` + a single background response task cover both the
killed and warm cases:

- **`NOTIFICATION_RESPONSE_TASK`** (registered via
  `TaskManager.defineTask` + `Notifications.registerTaskAsync`, §17.2) — fires for
  `SAVE` and `DISCARD` (both `opensAppToForeground:false`) whether the app is killed or backgrounded.
  - **`SAVE`** → the §17.4(b) transaction, verbatim: re-load `Suggestion` by id → re-match
    `AccountRule` by `normalizedKey` → one DB transaction { insert `Transaction`
    (amount + `occurredAt` from the Suggestion; `note`/`categoryId`/`paymentMethod` from the rule;
    `source='sms'`, `smsRef`, `dedupeKey` copied), `suggestion.status='confirmed'` +
    `confirmedTransactionId`, `AccountRule.hitCount++` + `updatedAt` } → cancel `sug:<id>` →
    refresh or cancel the group summary (`pendingCount` recount).
    - Rule deleted between post and tap → **do not write blind**: fall through to opening the
      Confirmation sheet (set a pending deep link, then `Notifications` will foreground on the
      next user interaction; in practice `SAVE` with no rule is impossible to reach because the
      button only exists in `txn-known`, but the guard stays for the race).
  - **`DISCARD`** → `suggestionRepo.dismiss(suggestionId)` (hard `DELETE`, D26) → cancel
    `sug:<id>` → recount + refresh/cancel the summary. No ledger write (IMP-007).
- **Foreground taps** — `ADD` button and **body taps** carry `opensAppToForeground:true`; handled
  by the JS listener in `_layout.tsx` (§28.3), not the task:
  - cold start → `Notifications.getLastNotificationResponseAsync()` after `<MigrationGate>`.
  - warm → `Notifications.addNotificationResponseReceivedListener`.
  - Both resolve to a `coinflow://` route via the §28.3 table, then `router` navigates once.

`NOTIFICATION_RESPONSE_TASK` obeys the §17.2 budget (< 5 s, no network, wrapped so a throw is
logged scrubbed and swallowed — §32).

### 31.6 Stale-tap routing (formalises §10)

Resolved at handling time by re-reading the `Suggestion` (`getSuggestion(suggestionId)`):

| Current state | `SAVE` / `DISCARD` (headless) | `ADD` / body tap (foreground) |
|---|---|---|
| `pending` | act normally (§31.5) | `coinflow://review?open=<suggestionId>` → Confirmation sheet |
| `confirmed` (already added) | no-op; cancel the notification | `coinflow://transaction/<confirmedTransactionId>` → Details |
| row gone / `dismissed` | no-op; cancel the notification | `coinflow://` → Home |
| underlying `Transaction` soft-deleted | treat as `dismissed` | `coinflow://` → Home |

### 31.7 Permission off — silent (P-7 / IMP-041)

`POST_NOTIFICATIONS` denied → `SMS_INGEST_TASK` still runs every step **except** the post: the
`Suggestion` is written, no notification is attempted (no throw, no log noise). The Review Queue
(F11) and the Home "N to review" action strip + tab badge are the entire surface. Nothing in the
pipeline branches on a *stored* permission flag — step 7 calls
`Notifications.getPermissionsAsync()` live and returns early if not `granted` (§22.4).

### 31.8 Reboot / process-death restore

Android does not persist posted notifications across a reboot, and CoinFlow deliberately does
**not** add a `BOOT_COMPLETED` receiver (keeps the native surface "SMS bridge only", D24). Recovery
is JS-side and lazy:

- **`reconcileNotifications()`** (`src/services/notifications/reconcile.ts`) runs on every app
  launch and on `AppState → active`: diff `pending` Suggestions against
  `Notifications.getPresentedNotificationsAsync()`; re-post (`sug:<id>`, or the summary if ≥ 2)
  for any `pending` Suggestion with no live notification.
- `SMS_INGEST_TASK` step 8 (self-heal, §17.3) does the same on the next incoming SMS.
- Between a reboot and the next app-open-or-SMS the durable Review Queue + badge cover it (P-7).
  This is the accepted trade for not shipping a boot receiver.

### 31.9 Files

`src/services/notifications/` — `channel.ts` · `categories.ts` · `content.ts` · `post.ts`
(single/group decision, §31.4) · `respond.ts` (the `SAVE`/`DISCARD` bodies shared with §17.4b) ·
`reconcile.ts` · `deep-link.ts` (payload → `coinflow://` route, §28.3). The task *definitions*
live in `src/services/tasks/` (§17.2) and call into `respond.ts`.

---

## 32. Error handling

### 32.0 Principles

1. **The SMS receiver and both headless tasks must never crash the app.** Every task body is
   wrapped in a top-level `try/catch` that logs scrubbed (§32.1) and returns cleanly (§17.2).
   A parse throw, a gate throw, a DB error, a notification error — all degrade to "no Suggestion
   this time / no notification this time", never a crash dialog.
2. **No financial data in any log or crash payload** — no SMS body, amount, account, note,
   category, balance, or VPA. This is enforced by a redaction helper, not developer discipline
   (§32.1). Amends nothing in D21; makes it operational.
3. **User-facing errors are actionable (P-4).** Every error state gives the user one concrete next
   step — Retry, Enable, Open settings, or "your data is safe, reopen the app".
4. **Verbose logging is dev-only.** `__DEV__` gates the detailed console output; release builds
   strip `console.*` (§33.5) and emit only the scrubbed crash report *if the user opted in*
   (§33.4).

### 32.1 Logging & redaction policy

- `src/lib/log.ts` — `log.debug/info/warn/error`. In `__DEV__`: full `console`. In release:
  `debug`/`info` are no-ops; `warn`/`error` forward to Sentry **only when `crashReportingEnabled`**
  (§33.4), otherwise drop.
- `redactError(e): { name, message, stack }` — takes only those three fields, then runs
  `scrubText()` over `message` + `stack`: strips anything matching a currency pattern
  (`₹\s?[\d,]+`), a bare 4–12 digit run, a VPA (`\S+@\S+`), and collapses any string literal longer
  than 40 chars to `"[…]"`. Parser code therefore must not embed the SMS body in `Error` messages
  (lint note + code review; the corpus tests assert `parseSms` never throws on fixture input).
- **Allowed in a log/crash line:** exception `name`, a static `message` from CoinFlow's own
  `throw new Error('…')` sites, the scrubbed `stack`, `Platform.OS` + OS version, app version /
  build, the *name* of the failing operation (`'SMS_INGEST_TASK'`, `'migration'`,
  `'export.csv'`), counts (`pendingCount`), and enum values (`direction`, `paymentMethod`).
- **Never:** SMS body, `amountMinor`, `account`, `note`, `description`, category name, sender id,
  `dedupeKey`, file contents, DB rows.

### 32.2 Failure matrix

| # | Failure | User-facing behaviour | Logging |
|---|---|---|---|
| E1 | **Native `SmsReceiver.onReceive` throws** (bad PDU, OEM quirk) | nothing visible; that one SMS is not detected — same class as "app not installed" (§17.4a) | Kotlin `Log.w` tag `CoinflowSms`, message only; no body |
| E2 | **Headless task fails to start** (OS refused the `HeadlessJsTaskService`) | nothing visible; Review Queue stays the fallback; `reconcile` + step 8 recover on the next event | native warn |
| E3 | **`parseSms` throws** (should be impossible — corpus asserts total function) | task catches, returns; no Suggestion | `error` scrubbed, op `SMS_INGEST_TASK/parse` |
| E4 | **Sender/ignore gate rejects** (expected, not an error) | no Suggestion | `debug` only |
| E5 | **DB write of the Suggestion fails** (disk full, locked) | no Suggestion, no notification; next SMS or app-open retries (dedupeKey makes it safe) | `error` scrubbed, op `SMS_INGEST_TASK/insert` |
| E6 | **Migration pending when a task fires** | task calls `ensureMigrated()` first (§20.4); if it runs, proceed; if it throws, defer — skip the write, let the next app-open reconcile | `warn` op `task/ensureMigrated` |
| E7 | **Migration fails at launch** | full-screen non-dismissible **"Couldn't open your data"** + **Try again** (re-run) + "Your transactions are safe on this device." — **no wipe, no auto-reset** (§20.4) | `error` op `migration`, from-version → to-version only |
| E8 | **DB file corrupt / won't open** | same screen as E7 with a secondary, guarded **"Reset app data"** (two-step `ConfirmDialog`, type `CONFIRM`) — the *only* path that wipes, and only on explicit user action | `error` op `db/open` |
| E9 | **Notification post fails / permission revoked mid-run** | silent; Suggestion still written; Review Queue + badge (§31.7) | `warn` op `notify/post` once, not per retry |
| E10 | **`NOTIFICATION_RESPONSE_TASK` (`SAVE`) fails mid-write** | one DB transaction, so it rolls back atomically; the notification stays; the user can tap again or open the app | `error` op `notify/save` |
| E11 | **`ADD` / body tap, but the Suggestion is gone** | §31.6 routing — Details or Home, never a dead sheet | `debug` |
| E12 | **SMS permission denied / permanently denied** | persistent `PermissionBanner` on Home + Review Queue (V-9 / IMP-040); Settings › SMS card shows the state; permanently-denied → **Open system settings** (IMP-042) | none (expected) |
| E13 | **Notification permission denied** | no banner is mandatory, but Settings shows "Off" + warning glyph (UI-064); detection still fills the queue (IMP-041) | none |
| E14 | **A foreground repo write fails** (Add/Edit/Confirm submit, category save, rule edit) | sheet stays open, inline error line above the primary button ("Couldn't save — try again"), button re-enabled; no optimistic row was shown (§22.1) so nothing to roll back | `error` op `repo/<method>` scrubbed |
| E15 | **A screen's live query throws** | that screen's `ErrorState` (alert glyph + line + **Try again** → refetch), rest of the app unaffected (§32.3) | `error` op `query/<hook>` |
| E16 | **FTS5 query fails** (device build lacks FTS5) | transparent fallback to the `searchText` + `LIKE` path (D27); no user-visible change | `warn` once op `search/fts-fallback`, then suppress |
| E17 | **Export: file write or share fails** | Data screen toast **"Couldn't create the export file."** + Retry; nothing partially shared (write to a temp path in cache, share, then delete — §33.1) | `error` op `export/<json\|csv>`, no row contents |
| E18 | **`clearAllData` fails partway** | it runs as one DB transaction + a settings reset; on failure it rolls back and shows "Couldn't clear data — nothing was changed." | `error` op `maintenance/clear` |
| E19 | **Deep link to a `transaction/[id]` that doesn't exist** | `+not-found` → a friendly "That transaction isn't here anymore." + **Go home** | `debug` |
| E20 | **Uncaught render error anywhere** | root error boundary (§32.3): full-screen **"Something went wrong."** + **Reload app** (re-mounts the tree); data untouched | `error` op `boundary`, component stack scrubbed |

### 32.3 Error boundaries

- **Root boundary** — a class component just inside the providers in `_layout.tsx`, above the
  navigator. Catches render/lifecycle throws, shows the E20 screen, offers **Reload app**
  (`expo-updates` `reloadAsync` in release; a state-bump remount in dev). Forwards to Sentry per
  §33.4.
- **Screen-level** — each tab screen and each pushed page wraps its content in
  `<ScreenErrorBoundary fallback={<ErrorState …/>}>` so one screen's failure doesn't blank the
  shell. `ErrorState` (§29.4) provides **Try again**.
- **Sheets** — a throw inside a sheet closes it via `close()` and shows a `Toast` ("Couldn't open
  that — try again"); it must not take down the screen underneath.

### 32.4 Copy (the actionable strings — P-4)

| Situation | Line | Action |
|---|---|---|
| Home data query failed | "Couldn't load your data." | Try again |
| List query failed | "Couldn't load transactions." | Try again |
| Analytics query failed | "Couldn't load analytics." | Try again |
| Save/Add failed (sheet) | "Couldn't save — try again." | (button re-enabled) |
| Migration failed | "Couldn't open your data. Your transactions are safe on this device." | Try again |
| DB corrupt | "Couldn't open your data." | Try again · Reset app data (two-step) |
| Export failed | "Couldn't create the export file." | Retry |
| Missing deep-link target | "That transaction isn't here anymore." | Go home |
| Render crash | "Something went wrong." | Reload app |

No red, no error iconography beyond the neutral alert glyph (V-7 / UI-004).

---

## 33. Security & privacy

### 33.0 Scope (recap of D21)

**In V1:** app-private storage, `android:allowBackup="false"`, no network except opt-in crash
reporting, SMS body never persisted, scrubbed logs. **Not in V1 (Future):** biometric / PIN app
lock, SQLCipher at-rest DB encryption, certificate pinning (nothing to pin — one optional egress).

### 33.1 Storage

- The SQLite file lives in the app-private data dir (`expo-sqlite` default —
  `<app files>/SQLite/coinflow.db`); WAL sidecars alongside. No use of external / shared storage,
  no `WRITE_EXTERNAL_STORAGE`.
- **`android:allowBackup="false"`** + `android:fullBackupContent="false"` injected by the
  `coinflow-sms` config plugin (or `expo-build-properties` — §33.6), so the DB is excluded from
  Android auto-backup / adb backup / cloud backup.
- **Export files** are written to `FileSystem.cacheDirectory` (also app-private), handed to
  `Sharing.shareAsync`, and **deleted in a `finally`** after the share sheet returns. They are
  never written to a world-readable location by CoinFlow; where the user then sends them is the
  user's choice (§12 / IMP-043).
- No `MediaStore`, no clipboard writes of financial data.

### 33.2 No-network assertion

- The Android manifest requests **no `INTERNET`-adjacent capability beyond what the OS grants by
  default**; there is no backend, no analytics SDK, no ad SDK, no font CDN (fonts are bundled,
  §29.1), no remote config.
- The **only** code path that can open a socket is `@sentry/react-native`, and only after
  `Sentry.init()` — which CoinFlow calls **only** when `crashReportingEnabled === true` (§33.4).
  Default state: `init` is never called, the transport is never constructed.
- **Verified by:** (a) a manifest review checklist item in §35.7; (b) a unit test that greps the
  built `src/domain`, `src/db`, `src/features`, `src/services` trees for `fetch(`,
  `XMLHttpRequest`, `WebSocket`, `axios` and fails on a hit outside `src/services/crash/`;
  (c) IMP-045 (manual: run the core loop with a network monitor, assert zero egress with crash
  reporting off).

### 33.3 SMS handling (P-9)

- The SMS body is read in the native receiver, coalesced, passed to JS **in memory**, parsed, and
  discarded at `SMS_INGEST_TASK` step 5. It is **never** written to SQLite, a file, a log, or a
  crash payload (§32.1 redaction).
- What *is* retained per detected transaction: `source='sms'`, `smsRef = { sender, receivedAt }`
  (sender label + timestamp only), and the parsed structured fields the user then confirms.
- `READ_SMS` + `RECEIVE_SMS` are requested because auto-detection is the product (F1). This is
  acceptable **because distribution is direct-install, not the Play Store** (D20) — Play's SMS
  policy does not apply. The Settings › SMS screen explains, in plain language, which messages are
  read and that nothing is uploaded (§30.16, "Which messages CoinFlow reads").

### 33.4 Crash reporting — the P-9 amendment (D34)

| Aspect | Decision |
|---|---|
| SDK | **`@sentry/react-native ~8.24.0`** + the Expo config plugin (`@sentry/react-native/expo`); native crash capture on; `tracesSampleRate: 0` (no performance tracing); `enableAutoSessionTracking: false`; `sendDefaultPii: false` |
| Default | **OFF — opt-in.** `app_setting.crashReportingEnabled` defaults `false` (§22.3). `Sentry.init()` is called from `src/services/crash/index.ts` **only** if the setting is `true` at launch; toggling it on in Settings › Data calls `init` immediately, toggling off calls `Sentry.close()` and takes effect fully on next launch. |
| Disclosure | Because nothing transmits by default, there is **no onboarding step** and the About-screen line **"All your data stays on this device."** stays literally true. Settings › Data carries the toggle with one sentence: *"Send anonymous crash reports (stack traces only — never your transactions or messages)."* |
| `beforeSend(event)` | drop `event.contexts.device.name`, `event.user`, `event.request`, `event.server_name`; run every `exception.value` + every frame `filename`/`function` через `scrubText()` (§32.1); drop the event entirely if any `value` still matches a currency / VPA / long-digit pattern after scrubbing (fail closed) |
| `beforeBreadcrumb(b)` | **return `null` for every breadcrumb whose category is `navigation` and whose route is in the financial set** (`transaction/*`, `analytics`, `review-queue`, any sheet); drop all `console` and `xhr`/`fetch` breadcrumbs; keep only `app.lifecycle` and `error` categories |
| Allowed payload | exception name + scrubbed message + scrubbed stack; `Platform.OS` + version; app version + build number; the failing op name (§32.1); `pendingCount` / enum values. **Nothing else.** |
| Release plumbing | source maps uploaded by the Sentry EAS build hook **on the `production` profile only**; `SENTRY_AUTH_TOKEN` is an EAS secret, never committed; the DSN sits in `app.json → extra.sentryDsn` (a DSN is a write-only ingest key — safe to ship) |
| ProGuard mapping | R8 mapping file uploaded alongside for native stack symbolication |

### 33.5 Release hardening

- **R8 / ProGuard on** for `release` (`android.enableProguardInReleaseBuilds = true`,
  `enableShrinkResourcesInReleaseBuilds = true`) via `expo-build-properties`. Keep rules for
  Expo modules, Reanimated, `@shopify/flash-list`, `react-native-svg`, the `coinflow-sms` module,
  and Sentry (its plugin adds them).
- **Hermes** engine (RN 0.86 default) — bytecode, not readable JS, in the APK.
- **Strip `console.*` in production** — `babel-plugin-transform-remove-console` (keep `error` +
  `warn` so `log.ts` can still route them) in the release Babel env.
- No debug flags: `expo-dev-client` and Sentry `debug:false` in release; `EXPO_PUBLIC_*` carries
  nothing sensitive.
- The app sets `WindowManager.LayoutParams.FLAG_SECURE`? **No** in V1 (blocks screenshots
  globally; deferred with the app-lock work). Documented as a Future toggle.

### 33.6 Final permission list

| Permission | Source | Why | Optional? |
|---|---|---|---|
| `android.permission.RECEIVE_SMS` | `coinflow-sms` plugin | wake on incoming SMS (F1) | yes — app fully usable manually without it (§11) |
| `android.permission.READ_SMS` | `coinflow-sms` plugin | read the message body to parse (F1) | yes |
| `android.permission.POST_NOTIFICATIONS` | `expo-notifications` plugin | the core-loop notification (F2) | yes — queue + badge cover it (P-7) |
| `android.permission.RECEIVE_BOOT_COMPLETED` | — | **not requested** (no boot receiver, §31.8) | n/a |
| `INTERNET` | Android default (implicitly granted) | used **only** by Sentry, **only** when opted in (§33.4) | n/a |

`allowBackup=false` is an `<application>` attribute, not a permission, set as in §33.1.

---

## 34. Testing strategy

### 34.0 Tooling (recap §16.6) & CI

`jest-expo 57.0.5` (preset, RN 0.86 transform) · `@testing-library/react-native 14.0.1` +
`@testing-library/jest-native` matchers · **Maestro** (external binary, YAML flows) for the one
E2E lane. No Detox (D35). `npx tsc --noEmit` + `expo lint` are the other two gates.

**CI (GitHub Actions, `ci.yml`):** on push / PR — `npm ci` → `tsc --noEmit` → `expo lint` →
`jest --ci --coverage`. **No native build, no emulator, no Maestro in CI** (the dev-client +
SMS module make an emulator run heavy; E2E is run locally against an EAS `development` build
before a release — §35.7). A nightly or pre-release manual EAS build is the native smoke.

**Which tier does *this* piece of code need?** (`SPEC/PLAN.md` §9.1 point 2 — decided at write
time, not deferred):

1. **A pure/deterministic function or branch of logic, anywhere in `src/`** — not only
   `src/domain` — gets a **unit** test. This includes `src/db/repositories/*.ts` functions with
   real behavior (upsert semantics, guards, derived fields), not just pass-through queries, and
   feature-layer write paths (`write-confirmed-transaction.ts`, `deep-link.ts`-style resolvers).
   Mock the boundary the same way `respond.test.ts` / `write-confirmed-transaction.test.ts` do:
   `@/db/client`'s `db`, or the specific repo function one level down, never a real SQLite file.
   "Only exercised indirectly through the UI that calls it" is not a substitute — a repo function
   with a real guard (duplicate-name rejection, protected-category delete guard, last-write-wins)
   gets its own test asserting that guard directly.
2. **A screen, sheet, or reusable component with real states or user interaction** gets an
   **RNTL** test per §34.2's per-screen checklist — skeleton/empty/error deltas plus the primary
   interaction, repos and stores mocked.
3. **A user journey spanning multiple screens/sheets where real navigation timing or gesture
   handling is the thing being verified** — the class of bug that only reproduces on-device
   (sheet-present/dismiss races, hardware back-button interception, rapid-tap sequencing) —
   gets a **Maestro** flow (§34.3), written once its full dependency chain is built.

### 34.1 Unit tests (business logic — `SPEC/PLAN.md` §8, the centrepiece)

`src/domain/**` is pure TS with no RN imports (D22) and is the primary target (100% below) — but
per the decision rule above, any other deterministic logic module gets the same unit-test
treatment; it isn't exclusive to this directory:

| Suite | File | What it asserts |
|---|---|---|
| **SMS parser corpus** | `domain/sms/__tests__/corpus.test.ts` + `fixtures/*.json` | the anonymised real-shape SMS → expected `ParseResult` table (§23.6). Covers: major banks (HDFC, ICICI, SBI, Axis, Kotal), UPI apps (GPay, PhonePe, Paytm, CRED), debit + credit, UPI / card / IMPS·NEFT·RTGS / wallet, Indian digit grouping + paise, and every ignore rule (OTP, promo, balance-only, request-money, foreign-currency, not-yet-settled). Asserts `parseSms` is **total** — never throws on any fixture. This file is the single most important test asset. |
| Normalization | `domain/accounts/__tests__/normalize.test.ts` | the §24.2 worked input→key table verbatim, including the §8 near-miss pairs (must / must-not collapse) |
| Categorization | `domain/categorize/__tests__/*.test.ts` | exact-key match only (§24.3); the save/edit upsert semantics (§25.2) — keep learned category when the new save is Uncategorized; cleared note clears `lastNote`; last-write-wins |
| Analytics math | `domain/analytics/__tests__/*.test.ts` | per §26: core aggregates, running balance sign, MoM deltas (Income=0 guard), by-category with the Uncategorized bucket + share, largest-5, daily zero-fill, mean over **days-elapsed** for the current period, **median** of the zero-filled series, arc-fill clamp `[0,1]`, outlier scaling, ISO-week boundaries + previous-ISO-week comparison (D31) |
| Money formatter | `domain/format/__tests__/money.test.ts` | `₹` prefix, Indian grouping (`1,00,000`), always-present sign, thin-space, paise only when non-zero, negative running balance |
| Dates / periods | `domain/format/__tests__/time.test.ts` | relative-vs-absolute switch (V-2), local-day boundary, `monthPeriod` / `isoWeekPeriod` / `previousPeriod` / `stepPeriod`, DST-free (epoch-ms UTC + local math, D28) |
| Undo | `domain/undo/__tests__/undo.test.ts` | soft-delete sets `deletedAt`, restore clears it, reads filter it out, purge removes only rows past the grace window (§27.4) |
| Dedupe key | `domain/sms/__tests__/dedupe.test.ts` | `sha256(sender\|amountMinor\|floor(occurredAt/60000)\|direction)` is stable, and a bank+UPI pair for one payment produces **two** keys (D8, §17.3 step 4) |

Target: 100 % of `src/domain` statements; the parser corpus is the acceptance bar for F1.

### 34.2 Component tests (RNTL — the V-3 states)

One test file per screen / major component, asserting the **skeleton / empty / error** deltas
from §30 plus the primary interaction, with repos and stores mocked:

- Home — skeleton shape, new-user empty (`₹0`, no action strip, Recent EmptyState), query-error
  → "Couldn't load your data" + Retry, action strip renders only when `count>0`.
- Review Queue — 4-card skeleton, "You're all caught up." empty (**not** an error state), known
  row shows inline **Save**, new row does not.
- Transactions — no-data empty vs no-match empty are **visually distinct** (UI-042), loading-more
  footer, swipe→ConfirmDialog→UndoSnackbar.
- Analytics — period empty ("Nothing recorded for August"), insufficient-prior-period hides the
  "Last month/week" tile values (CR-1), skeleton cards.
- Confirm / Add / Edit sheets — invalid (amount 0 → primary disabled), submitting (spinner, sheet
  locked), save-error inline line; Income hides the category row (UI-022).
- Categories / Create-Edit — duplicate name rejected inline (IMP-019); Other has no swipe.
- Settings subpages — SMS card state reflects live permission; Data → two-step clear dialog.
- `ConfirmDialog` / `UndoSnackbar` / `PermissionBanner` / `EmptyState` / `ErrorState` — prop
  contracts and the "no colour / no red" rule (V-7).

### 34.3 E2E (Maestro — J-flows)

YAML flows in `e2e/`, run against an EAS **`development`** build on a physical Android device or
emulator (SMS simulated via `adb emu sms send` / a fixture broadcast):

| Flow | File | Steps |
|---|---|---|
| **J2 — core loop** | `e2e/j2-core-loop.yaml` | seed a known `AccountRule` → fire a fixture transaction SMS → assert the notification → tap **Save** → assert the app did **not** open → open the app → assert the transaction is in the list with the learned note + category and the running balance moved |
| **J4 — manual add** | `e2e/j4-manual-add.yaml` | tab bar centre **Add** → keypad enters an amount → pick category + method → **Add** → assert the toast, the new row, and the updated Home tiles |
| **J9 — delete + undo** | `e2e/j9-delete-undo.yaml` | open a transaction → Delete → confirm → assert row gone + `UndoSnackbar` → **Undo** → assert the row is back and the balance restored |

### 34.4 Traceability matrix (`UI-0xx → IMP-0xx → component → test`)

`SPEC/traceability.md` (generated/maintained during feature work) holds the full grid; the spec
fixes the **column contract** and the `test-id` convention:

- **`test-id` convention:** `screen:element` kebab (`home:balance-hero`, `review:row-save`,
  `add:keypad-key-7`, `analytics:arc-gauge`, `confirm:primary`). Every interactive element named
  in §30 gets one; RNTL queries by it, Maestro asserts on it.
- **Row shape:** `IMP-0xx | criterion | UI-0xx (or —) | component/service | test kind (unit / RNTL / Maestro / manual) | test id or file | status (Pending → Pass)`.
- **Status contract (`SPEC/PLAN.md` §9.1 is the authority; this is the summary):** `Pass` means the
  criterion is implemented **and** carries the test tier(s) §34.1/§34.2 call for at this feature's
  scope — not "works when I tried it once." `Partial` is reserved for a named, bounded deferral
  with an explicit trigger (a specific future feature or dependency that closes it) — it is
  **not** a valid status for "the test wasn't written" or "not verified yet." A row stuck at
  `Partial` with no trigger condition is a bug in the traceability entry itself: either finish it
  or name what unblocks it.
- **Seed rows** (from §13; all `status: Pending` until the build verifies):

| IMP | Test kind | Where |
|---|---|---|
| IMP-001 / 002 | unit | parser corpus + `SMS_INGEST_TASK` gate test |
| IMP-003 | RNTL + Maestro | Review Queue row (known/new) · J2 |
| IMP-004 | unit + manual | `post.ts` single/group decision · manual notification render |
| IMP-005 / 013 / 014 | unit + Maestro | upsert semantics · J2 |
| IMP-006 / 007 | RNTL | Confirm cancel leaves pending · Discard hard-deletes |
| IMP-008 | RNTL | amount 0 / >₹10,00,000 extra-confirm |
| IMP-009 | manual | kill/reboot, `reconcileNotifications` |
| IMP-010..012 | RNTL | Add validation · Income omits category · `type` always stored |
| IMP-015 | unit + RNTL | search over note/description/account · filter AND-combination |
| IMP-016 | unit + Maestro | undo window · J9 |
| IMP-017..019 | RNTL | default set = 9 · reassign-on-delete · duplicate name |
| IMP-020 / 031..037 | unit | analytics math suite (§34.1) |
| IMP-030 | RNTL | period stepper, Month/Week |
| IMP-038 | RNTL | Analytics has no Top-accounts / run-rate / insight cards |
| IMP-040..042 | RNTL + manual | permission banner / states · system-settings deep link |
| IMP-043 / 044 | RNTL + manual | export produces a file · clear-all returns to onboarding |
| IMP-045 | manual | network monitor, crash reporting off — zero egress |

### 34.5 Not automated in V1 (documented manual QA)

Native `SmsReceiver` on real OEM devices (Xiaomi / Samsung / OnePlus battery killers) · actual
lock-screen notification rendering + action buttons · OS permission dialogs · the headless cold
start latency (the D18 field-test metric) · visual parity against `design-prototype/01-midnight/`
(the `UI-0xx` list — `SPEC-UI-UX.md` §7). These live in a pre-release checklist (§35.7).

---

## 35. Build & release

### 35.1 `app.json` changes required

| Key | Change |
|---|---|
| `expo.android.package` | set to `com.ckworkforce.coinflow` (currently unset — required for a store-less signed build) |
| `expo.android.permissions` | leave unset — the `coinflow-sms` plugin injects `RECEIVE_SMS` / `READ_SMS`; `expo-notifications` injects `POST_NOTIFICATIONS`. Do **not** also list them here (double-declaration). |
| `expo.plugins` | add, in order: `expo-font` (with the Manrope + Geist TTF asset list), `expo-notifications` (with the `txn-review` icon + colour), `./modules/coinflow-sms/app.plugin.js`, `["expo-build-properties", { android: { enableProguardInReleaseBuilds: true, enableShrinkResourcesInReleaseBuilds: true, extraProguardRules: "…" } }]`, `["@sentry/react-native/expo", { organization, project, url }]` |
| `expo.scheme` | already `"coinflow"` — used by the `coinflow://` deep links (§28.3); no change |
| `expo.android.allowBackup` | set `false` (or via `expo-build-properties` `android.allowBackup` — pick one, §33.1) |
| `expo.extra.sentryDsn` | add the DSN (write-only ingest key) |
| `expo.extra.eas.projectId` / `owner` | unchanged |
| `expo.version` | ignored for versioning — `appVersionSource: "remote"` in `eas.json` (§35.3) |
| `expo.android.userInterfaceStyle` | set `"dark"` (V1 is dark-only, D33) — currently `"automatic"` at root |

`android:exported`, the `<receiver>` + `<service>` entries, and the `BROADCAST_SMS` permission
attribute come from the `coinflow-sms` config plugin (§17.6), not `app.json`.

### 35.2 Config-plugin / prebuild order

`expo prebuild` (or the EAS build) applies plugins top-to-bottom; `coinflow-sms` must run after
`expo-notifications` (both edit `AndroidManifest.xml`; order keeps the diffs clean) and Sentry's
plugin last (it wraps `MainApplication` + adds the upload hook). CoinFlow does **not** commit the
`android/` folder — it stays a managed (CNG) project; the native module lives in `modules/`, not
in `android/`.

### 35.3 EAS profiles (`eas.json` — already present)

| Profile | Use | Notes |
|---|---|---|
| `development` | daily dev + **E2E** | `developmentClient: true`, `internal` distribution; this is the only build that runs Metro. Install once, iterate over the dev server. |
| `preview` | share / field test | `internal` distribution, a **release** JS bundle in a dev-less APK; this is the D18 field-test build and the pre-release smoke target |
| `production` | the shipped APK | `autoIncrement: true`, `appVersionSource: "remote"`; R8 + Sentry source-map upload on; signed with the EAS-managed keystore |

No `production` App Bundle / Play track — **direct install** (D20): the signed APK from
`eas build -p android --profile production` is distributed via EAS internal distribution links or
sideloaded.

### 35.4 Distribution workflow

1. `eas build -p android --profile production` → EAS signs with the managed keystore, uploads
   Sentry source maps + R8 mapping, produces a download URL.
2. Share the URL (EAS internal distribution) or the `.apk` directly.
3. Installer enables "install unknown apps" for the source once; subsequent versions install over
   the top (same package + signing key).
4. No auto-update channel in V1 (`expo-updates` is only used for the error-boundary `reloadAsync`,
   not OTA). A new version = a new build + a new link.

### 35.5 Versioning

`appVersionSource: "remote"` — EAS owns `versionCode` (`autoIncrement` on `production`) and the
human `version`. `app.json → version` is display-only and not the source of truth. Tag each
release in git (`v1.0.0`) to match the EAS build.

### 35.6 `reset-project` caveat

`npm run reset-project` is **destructive** (moves `src/` + `scripts/` into `example/` and
scaffolds a blank app). It must not be run on this repo again — the template it would restore has
been fully replaced (§18.4). Documented here and in `CLAUDE.md`.

### 35.7 Pre-release checklist

- [ ] `tsc --noEmit` + `expo lint` + `jest` green (CI)
- [ ] parser corpus covers every bank/UPI-app in the tester's own SMS history
- [ ] `preview` build installs on ≥ 2 real OEM devices; core loop works with the screen off
- [ ] fire 20 real transaction SMS → correct Suggestions, notifications, one-tap Save
- [ ] kill the app, fire an SMS, reboot → Suggestion present, `reconcileNotifications` re-posts
- [ ] SMS + notification permissions denied → manual mode fully usable, banners correct
- [ ] Maestro J2 / J4 / J9 pass on the `development` build
- [ ] network monitor: crash reporting **off** → zero egress during a full session (IMP-045)
- [ ] crash reporting **on** → force a test crash → the Sentry event carries **no** amount /
      account / note / SMS text (inspect the payload)
- [ ] `allowBackup=false` verified (`adb backup` produces nothing useful)
- [ ] visual pass against `design-prototype/01-midnight/` for the frozen `UI-0xx` list
- [ ] Settings › About shows the correct version; "data stays on this device" is accurate
- [ ] git tagged; EAS `production` build archived with its Sentry release + mapping

---

## 36. Specification status

**`SPEC-implementation.md` is FROZEN (v1) — 2026-09-01.** Part I (§1–§15, product / behaviour) and
Part II (§16–§35, technical) are complete and consistent with `SPEC-UI-UX.md` (v1 frozen) and
`SPEC/idea.md`. `SPEC/IMPLEMENTATION-PLAN.md` Phases 0–5 are done.

`SPEC/PLAN.md` §11 final-review pass:

- **Product** — audience / problem / value prop (§2), features justified + prioritised (§3),
  non-goals documented (§14). ✓
- **UX** — journeys (§4), navigation (§28), primary actions (§30), empty/loading/error states
  (§30 + §32.2), edge cases (per-feature + §32), accessibility (Reduce-Motion §28.4, tabular
  numerals §29.3, live-region toasts). ✓ (visual side owned by `SPEC-UI-UX.md`)
- **UI** — design system frozen in `SPEC-UI-UX.md` §3; `theme.ts` build target in §29.1;
  component catalog §29.4. ✓
- **Technical** — architecture (§17), data models (§19), persistence (§20), business logic tested
  (§34.1), core journeys tested (§34.3), error handling (§32), security (§33). ✓
- **Specification** — every requirement has an id (`F#` §3, `IMP-0xx` §13, `UI-0xx` in
  `SPEC-UI-UX.md` §7); traceability contract in §34.4; decisions logged D1–D35 (§1). ✓

**Change protocol from here (`SPEC/PLAN.md` §10):** both specs are frozen. A change is a
change-request — update the spec first, then the implementation, then verify. Post-freeze changes
are logged in §37.

Next track: feature implementation (`SPEC/PLAN.md` §9) — one feature at a time, each following
`read spec → implement → test → run → compare to prototype → verify `IMP-0xx` → mark done`.

---

## 37. Change log (post-freeze)

Entries follow `SPEC/PLAN.md` §10 — date, trigger, what changed in this doc, and any linked
change in `SPEC-UI-UX.md` §9.

- **CR-2** (2026-09-01, `SPEC/PLAN.md` §12 step 1 — scaffolding pass) — **`@sentry/react-native`
  version corrected `~8.24.0` → `~7.11.0`.** §16.5 pinned `~8.24.0` at freeze; `npx expo install
  @sentry/react-native` on SDK 57 resolves `~7.11.0` (the Expo-vetted version, with the matching
  `@sentry/react-native/expo` config plugin). `expo-doctor` flags `~8.24.0` as incompatible.
  Compatibility wins over the frozen number (`AGENTS.md`: re-check every library against the v57
  docs at install time). No behavioural change — D21 / D34 / §33.4 stand: opt-in, default OFF,
  `Sentry.init()` only when `crashReportingEnabled === true`, `beforeSend` scrub unchanged. The
  §16.7 risk list already anticipated install-time version corrections. No linked `SPEC-UI-UX.md`
  change.

- **CR-3** (2026-09-01, `SPEC/PLAN.md` §12 step 4 — native SMS pipeline) — three build-time
  corrections, **no behavioural change**:
  1. **`SMS_INGEST_TASK` is registered with `AppRegistry.registerHeadlessTask`, not
     `TaskManager.defineTask`.** §16.4 / §17.2 described *both* background tasks as
     `TaskManager.defineTask`, but §17.6 already mandates the native side be a
     `HeadlessJsTaskService` — and `expo-task-manager` ships **no** SMS `TaskConsumer`, so
     `defineTask` cannot receive that event. The RN headless-task API is the mechanism that
     pairs with `HeadlessJsTaskService` (native task name `CoinflowSmsIngest`). The
     **`NOTIFICATION_RESPONSE_TASK` is unchanged** — still `TaskManager.defineTask` +
     `Notifications.registerTaskAsync` (§17.2 / §31). Both are still registered at module scope
     in `src/services/tasks/index.ts`, imported first from the new `index.js` app entry
     (`package.json` `"main"` changed `expo-router/entry` → `index.js`, which does
     `import './src/services/tasks'; import 'expo-router/entry';`).
  2. **`android.allowBackup: false` moved** from the `expo-build-properties` plugin config to the
     first-class `expo.android.allowBackup` field. SDK 57's `expo-build-properties` no longer
     reads `allowBackup`; the field is the supported path. D21 stands — verified
     `android:allowBackup="false"` in the prebuilt `AndroidManifest.xml`.
  3. **`package.json` `android` / `ios` scripts** rewritten by `expo prebuild` to `expo
     run:android` / `expo run:ios` (from `expo start --android/-ios`). Consistent with §17.6 —
     Expo Go no longer runs CoinFlow from this step on; local dev is a dev-client build.

  Step 4 ships the module + plugin + task registration and a **skeleton** `SMS_INGEST_TASK`
  (sender-present check → `ensureMigrated()` → one bare `pending` Suggestion via
  `suggestionRepo.insertIfNew`, guarded by a `sha256(sender|minuteBucket)` key). The sender
  seed (§17.3.1), domain parser (§23), transaction/ignore gate (§17.3.3), rule match
  (§17.3.6), notification post (§17.3.7 / §31) and self-heal (§17.3.8) remain step 5. No linked
  `SPEC-UI-UX.md` change.

- **CR-4** (2026-09-03, structural audit — `SPEC/PLAN.md` §9.1's own definition-of-done pass
  turned up two screen-ownership gaps in §3's feature list) — **added F6.5 and F8.5; fixed two
  staleness/documentation bugs.** No behavioral or visual change — `SPEC-UI-UX.md` already fully
  specs every screen touched here (§6.2 Home, §6.13/§6.14 Settings); this CR only assigns them an
  owning `F#` on the implementation side, since neither had one:
  1. **F6.5 — App shell & Home (new, P0).** The `(tabs)` navigation shell + the real Home screen
     (§30.4) had a complete data/state-binding spec and `UI-010..014`/`IMP-020`/`D2` acceptance
     criteria, but no feature in §3 claimed "build this screen" — every implementation pass
     through F1–F11 correctly deferred it as "a much larger, separate feature" (see
     `SPEC/traceability.md`'s F4/F11 notes) and it was never picked up. Slotted between F6 and F7
     per the user's direction — it unblocks F7's Home-count surfacing and is a prerequisite for
     any tab-hosted screen (F9's Analytics, F8.5's Settings).
  2. **F8.5 — Settings (new, P1).** Same failure mode: the Settings hub + 4 of its 5 subpages
     (Payment methods, SMS & notifications, Data, About — §30.15/§30.16) were fully specced with
     `IMP-040..045` / `UI-064`/`UI-065` acceptance criteria but had no owning feature; only
     Settings › Account rules was explicitly claimed, by F8. Given its own numbered slot rather
     than folded into F8, keeping account-memory business logic separate from a mostly-static
     config screen (user's call).
  3. **F6's icon-library bullet was stale.** It still read "decision deferred... Library TBD...
     Blocking before the design system freezes" — a leftover from before the icon library was
     chosen. The choice was actually made and recorded elsewhere (D33, `SPEC-UI-UX.md` §3.4:
     Lucide) months before this freeze; F6's own text just never got updated to match. Corrected
     to point at the resolution instead of re-describing it as open.
  4. **F5's behavior bullet undersold its own scope.** It said "Open a row → Details" without
     mentioning that Details' primary action is Edit (§6.6/§30.8, and `SPEC/idea.md` #5's "open a
     transaction and edit its details") — Edit Transaction is built and shipped, just not named in
     F5's own one-line description. Added a clause; no scope change.

  `SPEC/PLAN.md` §12 step 5's feature build order and §0's status table are updated in the same
  pass to carry F6.5 / F8.5 and current progress.
