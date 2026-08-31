# CoinFlow — Implementation Specification

> **Scope.** Features, workflows, product rules, data model, and system behavior — everything that
> is **not** a screen or a visual element (those are in `SPEC-UI-UX.md`). Screen references below
> use the names and section numbers from that document.
>
> **Status: DRAFT — not finalized.** Per `SPEC/PLAN.md`, `SPEC-UI-UX.md` is finalized first and
> the design prototype is built from it; this document is finalized afterward, together with the
> technical design called for in `SPEC/PLAN.md` §8 (technology stack, architecture, project
> structure, application state, persistence choice, error handling, testing strategy, security).
> The sections here are the product / behavior groundwork the technical spec will build on — they
> are expected to change.
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

**Technical (§16+ — written across `SPEC/IMPLEMENTATION-PLAN.md` Phases 1–5):**
§16 Technology stack · §17 System architecture · §18 Project structure *(Phase 1 — done)* ·
§19 Data models (final) · §20 Persistence & migrations · §21 Data-access layer · §22 Application
state *(Phase 2 — done)* · §23 SMS parsing · §24 Account normalization · §25 Categorization ·
§26 Analytics computation · §27 Formatting / time / undo / running balance *(Phase 3 — done)* ·
§28 Navigation · §29 Component architecture · §30 Screen specs *(Phase 4)* · §31 Notifications ·
§32 Error handling · §33 Security & privacy · §34 Testing strategy · §35 Build & release *(Phase 5)*

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
  account. Filter by category, type, payment method, date range. Open a row → Details. Swipe →
  delete (confirm + Undo, ~5 s window).
- **Edge cases:** zero transactions (empty state); thousands (virtualized); same-second
  transactions (stable order by insertion); a day with only income.

### F6 — Categories · P1
- **Defaults:** Food, Transport, Shopping, Entertainment, Education, Bills, Groceries, Health,
  Other. **Other** is the protected catch-all (cannot be deleted). **Uncategorized** is a system
  state, not a user category, and is not editable.
- **Behavior:** create / rename / re-icon / delete custom categories (no colour — D12). Deleting a
  category moves its transactions to **Uncategorized**.
- **Icon set (decision deferred):** with no colour, the icon is the sole visual category
  identifier in lists, so V1 needs a proper, consistent icon library covering the 9 defaults +
  Uncategorized + income + the 5 payment methods + app chrome. Library TBD (Lucide / Phosphor /
  SF Symbols / custom) — see `SPEC-UI-UX.md` §3. Blocking before the design system freezes.
- **Edge cases:** duplicate name → blocked; deleting a category used by many transactions →
  confirm names the count; name length capped (~24 chars).

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
8. **Technical spec (`SPEC/PLAN.md` §8).** In progress — the phased plan, the chosen stack, and
   the architecture decisions (D18–D21) are in `SPEC/IMPLEMENTATION-PLAN.md`; the sections
   themselves (§16 Technology Stack onward) are written across Phases 1–5.

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
| `@sentry/react-native` | `8.24.0` + its Expo config plugin | crash reporting scrubbed per D21 — stack traces only. **Final SDK + the on-with-opt-out vs opt-in default are confirmed in Phase 5 (§33)**; listed here for completeness | GlitchTip / Bugsnag (revisited in Phase 5); no crash reporting (D21 chose to add it) |

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

### 17.7 Deferred to later phases

Notification channel / category IDs and the exact action-button config (§31, Phase 5) ·
migration-pending behaviour in a task (§20, Phase 2) · FTS5 vs `LIKE` for search (§20, Phase 2) ·
the permission-request mechanism and the Reduce-Motion plumbing (§28–§30, Phase 4) · the final
crash SDK + its default and the `beforeSend` scrub (§33, Phase 5) · the contingency hybrid
(native posts a provisional notification, JS replaces it) — **documented, not built**; adopt only
if a ~2-week field test on OEM battery-killer devices shows > ~5 % dropped events or > ~10 s
median latency (D18 / D23).

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
