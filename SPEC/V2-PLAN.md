# CoinFlow V2 — Plan (decisions recorded; specs drafted)

> Status: **decisions agreed 2026-09-19 (§5); not frozen.** Nothing in `SPEC-UI-UX.md` / `SPEC-implementation.md` changes until the plan is
> agreed. Once agreed, the specs are updated through numbered CR entries (UI/UX §9, technical §37),
> then code follows — the same protocol as V1 (`SPEC/PLAN.md` §10).

Sources: `v2-idea.md` (repo root — the split-payment workflow), `SPEC/idea.md` "VERSION 1.5" (split problem,
settlements, auto-detection, manual split, settlement tracking), plus one new item from the user: **home-screen widgets**.

---

## 1. Scope

V2 has two independent tracks:

| Track | What | Depends on |
|---|---|---|
| **A. Split payments** | Split a transaction between people, request money by SMS, receive requests, merge incoming payments into open splits, see who owes what | New tables, contacts permission (optional), SEND_SMS |
| **B. Widgets** | Three Android home-screen widgets: money summary, queued transactions, quick add (§3) | Nothing — independent of Track A |

Out of scope for V2 (stay parked): recurring transactions, multi-device sync, iOS, bank/UPI APIs, cloud anything.

Release shape (decided): **everything ships as one `v2.0.0`**. Auto split detection is deferred to **`v2.1`**.

---

## 2. Track A — Split payments

### 2.1 The workflow (from `v2-idea.md`, cleaned up)

1. A payment is detected/added (existing flow) → user taps **Edit** on the notification/Confirm sheet.
2. The sheet has a **Split** action, and the same **Split** action is also on the **transaction detail screen** (decided) so any past transaction can be split.
3. Pick people: device contacts (optional permission), people saved earlier in CoinFlow, or **type a number manually**.
4. A split panel: default **equal split**; toggle between **₹ amounts** and **%**; the user's own share is included.
5. **Done** → an SMS in a fixed, readable format is sent to each person ("Rahul, please pay ₹450 — CoinFlow split #ab12…").
6. On the receiving phone, CoinFlow recognises the format and posts a notification: *"[Name] requested ₹450 for a split."*
   - **Accept** → goes into the user's queue (pending payables). **Reject** → discarded silently.
   - Swiped away → goes to an **Unattended requests** list in the app (never lost).
7. The receiver later pays (UPI → detected as a normal debit; or cash/other → added manually). On that transaction: **Edit → Merge** → pick which pending request(s) it settles; if the payment is larger than what is owed, no special "leftover" handling: the transaction simply records **how much of it was used to settle which split** (decided), and the rest is an ordinary transaction.
8. On the requester's side, an incoming credit ("Rahul paid ₹450") is offered as a **settlement** of that person's share (auto-suggested match by amount + person; user confirms).
9. Transactions list shows under each transaction: split-out to whom, paid/pending per person; and on the payer side "paid by X / Y, remainder self-paid". Everything cross-linked so either side can be reviewed later.

### 2.2 Data model (additive migration — V1 is already built for this: `type` enum reserves `reimbursement`/`transfer`/`refund`, IMP-012)

- `person` — id, displayName, phoneNormalized (nullable), contactRef (nullable), source (`contact` | `manual` | `sms`), createdAt.
- `split` — id, transactionId (the original debit), totalMinor, myShareMinor, createdAt, status (`open` | `settled` | `written_off`).
- `split_share` — id, splitId, personId, amountMinor, requestSentAt, status (`pending` | `partial` | `settled` | `waived`).
- `settlement` — id, shareId, transactionId (the incoming credit, type `reimbursement`), amountMinor, createdAt. Many-to-many so one payment can clear several shares and one share can be paid in parts; `amountMinor` is exactly "this much of this transaction settled this share" and is shown on the transaction.
- `split_request_in` — the *received* side: id, fromPersonId, requestedMinor, remoteSplitId, receivedAt, status (`unattended` | `accepted` | `rejected` | `merged`), mergedTransactionId, raw message hash (dedupe).

Effective expense of a split transaction = `myShareMinor`; the outstanding remainder is a receivable, **not** spending. Analytics (§26) must use effective amounts and must not count settlement credits as income (idea.md principle 4).

### 2.3 Messaging protocol (needs a careful spec — highest-risk area)

- **Send:** `SEND_SMS` permission (direct-install APK, so no Play policy issue). **Decided fallback:** if it is denied, open the user's SMS app with the message pre-filled.
- **Format:** versioned and human-readable, e.g. `CoinFlow split v1 | ₹450.00 | ref ab12cd | for: Momos — please pay via UPI`. Must read fine to someone without CoinFlow.
- **Receive:** existing receiver already sees all SMS; add a *second* parser branch for the split format from **any** sender (bank parsing is sender-allowlisted; this is not). It must never create a bank-transaction suggestion.
- **Trust:** anyone can send that text — a request is *untrusted input*. Never auto-accept, never auto-pay; show the sender's number/name clearly; rate-limit/dedupe; ignore malformed. No secrets in the message.
- **Privacy:** contacts permission is optional; manual number entry always works; contact data never leaves the device except the outgoing SMS the user sends.
- **Costs/limits:** carrier SMS charges, DND/spam filters, dual-SIM (choose SIM?) — note in spec.

### 2.4 Auto split detection (idea.md V1.5 §4) — deferred to v2.1 (decided)

Heuristic only: a debit followed within N minutes by ≥2 credits from different senders whose sum ≈ (debit − a plausible share). Surfaces *"Possible split detected — Confirm / Keep separate"*. Ships after manual flow is solid; tuned against the user's real history.

---

## 3. Track B — Widgets (new)

### 3.1 The three widgets (decided)

| Widget | Content | Tap |
|---|---|---|
| **Money summary** | Balance, income and spent for the current period, in one widget | Opens Analytics / Home |
| **Queued transactions** | Pending detected transactions waiting for review (count + the first few) | Opens the Review queue (or the Confirm sheet for one item) |
| **Quick add** | A single button to add a transaction manually | Opens the Add sheet directly (deep link) |

The "Owed to you" widget from the first draft is **dropped**. Sizes, layouts and colours are **not decided yet** — each widget is
designed first as a visual prototype and only built once you have approved it (phase 1 below).
"Balance" needs one clarification in the UI spec: V1 tracks no account balances, so it will be defined as *income − spent for the
selected period* unless you want something else.

### 3.2 Technical approach (decided: spike, leaning native)

- **Go ahead with a spike** comparing (1) native Kotlin (RemoteViews / Jetpack Glance) in the local module, and (2) a JS library such as
  `react-native-android-widget` — which I have **not** verified works on Expo SDK 57 / RN 0.86 / new architecture. Lean: native Kotlin
  for reliability; the spike confirms or overturns that before the spec commits to one.
- **Data feed:** JS pushes a small *snapshot* (totals, pending count, top pending items) into SharedPreferences whenever data changes
  (after writes plus the existing background sweeps) and requests a widget refresh. The widget never opens the SQLite DB itself.
- **Refresh:** event-driven on data change + a cheap periodic refresh (`updatePeriodMillis` ≥ 30 min; Android throttles it anyway).
- **Privacy:** widgets sit on the home screen, so a "hide amounts on widgets" option is proposed (default still open, §5).
- No extra permissions; dark-only to match `theme.ts`. Test on the real Samsung One UI launcher.

---

## 4. Phases

| # | Phase | Output |
|---|---|---|
| 0 | Spikes | Widget approach (native vs library); SMS send/receive on the real phone |
| 1 | **UI spec + widget design (next)** | UI/UX CRs for split screens and the three widgets; widget prototypes reviewed and approved by you *before* any build |
| 2 | Implementation spec | Technical CRs: data model/migration, message protocol, widget data feed, analytics changes; traceability rows |
| 3 | Widgets | Money summary, Queued transactions, Quick add |
| 4 | Manual split (local) | Split action (Confirm/Edit sheet + transaction detail), people picker, split panel, effective-expense analytics, badges |
| 5 | Settlements / merge | Merge flow, suggested match, per-transaction "used to settle" record |
| 6 | Messaging | Send request SMS (+ fallback), receive parser, accept/reject notification, Unattended list |
| 7 | Verification + release | Tests, on-device pass, changelog, tag `v2.0.0` |
| — | v2.1 | Auto split detection |

### 4.0 Status (2026-09-19)

Phase 1 (UI spec) and phase 2 (implementation spec) are **drafted**: `SPEC-UI-UX.md` §6.17–§6.24 / §7 / §9 CR-4, CR-5 and
`SPEC-implementation.md` §13 / §37 CR-17…CR-19 / Part III §38–§45, with matrix rows in `SPEC/traceability.md` ("V2").
The widget layouts stay **provisional** until the prototype is approved (UI-099). The three previously open items
were given defaults in the specs (default SIM · hide amounts off · Balance = Income − Spent) and can be flipped by a CR.

### 4.1 Traceability (required at every phase)

`SPEC/traceability.md` is updated **as work lands, not at the end** — same contract as V1 (`SPEC/PLAN.md` §9.1, `SPEC-implementation.md` §34.4):

- **Phase 1 (UI spec):** every new screen/widget requirement gets a `UI-0xx` ID in `SPEC-UI-UX.md` (via a CR entry in §9) and a row in the matrix with status *not started*.
- **Phase 2 (implementation spec):** every technical requirement gets an `IMP-0xx` ID (via a CR in §37), linked to its `UI-0xx`. New data-model, protocol and widget-feed items each get a row.
- **Phases 3–6 (build):** as each feature lands, its row is filled in — `UI-0xx → IMP-0xx → component/service → test kind → test id/file → status`. Status flips to `Pass` only when the test tier the scope calls for exists and is green; `Partial` only with a named trigger, never as a vague "not verified yet".
- **Feature IDs:** new `F#` entries for Track A (split, settle, messaging) and Track B (each widget), tracked like F1–F12.
- **Phase 7:** an audit pass — no row left ambiguous, on-device verification debt listed explicitly, `CLAUDE.md` status and the traceability "audit" section updated.

Each V2 CR in either spec also gets a matching dated note in the traceability file (as done for CR-16).

---

## 5. Decisions (2026-09-19)

| # | Question | Decision |
|---|---|---|
| 1 | Release cut | Everything as **v2.0**; auto-detection is v2.1 |
| 2 | Widget approach | Spike; lean native Kotlin |
| 3 | Widget set | 3 widgets: money summary (balance/income/spent), queued transactions, quick add. Designed and approved by you before build |
| 4 | Split placement | Confirm/Edit sheet **and** transaction detail screen |
| 5 | SEND_SMS denied | Fall back to opening the SMS app pre-filled |
| 6 | Payment larger than owed | No leftover handling; record how much of the transaction settled which split |
| 7 | Auto-detection | v2.1 |

**Still open (will be raised during the spec phase):** hide amounts on widgets by default? · dual-SIM: pick the SIM per send or use the default? ·
what "Balance" means in the summary widget (proposed: income − spent for the period). Assumed, not asked: the request SMS must read fine to someone without CoinFlow.

---

## 6. Risks

- **Messaging is the hard part:** spoofed requests, carrier filtering of automated-looking SMS, dual-SIM, SEND_SMS review friction. Mitigated by "always user-confirmed, never automatic".
- **Data-model correctness:** effective-expense math touches analytics everywhere — needs domain tests first (like V1's `analytics.test.ts`).
- **Widgets on OEM launchers** (Samsung One UI here) behave differently; test on the real device.
- **Migration:** additive only; V1 data must survive untouched (run existing migration tests + a snapshot test of a V1 DB).
