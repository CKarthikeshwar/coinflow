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
state *(Phase 2)* · §23 SMS parsing · §24 Account normalization · §25 Categorization ·
§26 Analytics computation · §27 Formatting / time / undo / running balance *(Phase 3)* ·
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
