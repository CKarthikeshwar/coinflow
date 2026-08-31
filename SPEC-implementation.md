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
