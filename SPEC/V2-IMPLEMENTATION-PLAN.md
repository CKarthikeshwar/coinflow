# CoinFlow V2 — Implementation plan (phases)

> Status: **Phases 0–5 done and verified on-device** (0–3: 2026-09-19; 4: 2026-09-20 on the Samsung with Maestro; 5: 2026-09-20 on the Samsung + a Motorola — send, receive, Accept, settle, denied-SEND_SMS fallback; swipe-away / Reject / notification buttons not exercised). **Phase 6 (Widgets) built and installed 2026-09-20**; the three widgets were checked visually by the user, but taps, live updates, Hide amounts, cold start and month rollover are still to verify (§45.11). Also shipped after the freeze: Settings › Default category + Review Queue *Save all* (UI-UX CR-12 / impl CR-25, verified on the Samsung). Findings in `SPEC-implementation.md` §45.5, as-built notes in §45.6–§45.11. Source of truth for *what* to build:
> `SPEC/SPEC-UI-UX.md` §6.17–§6.24 (CR-4/5/6) and `SPEC/SPEC-implementation.md` Part III §38–§45 (CR-17/18/19).
> Scope/decisions: `SPEC/V2-PLAN.md`. Designs (approved 2026-09-19): the "CoinFlow V2 Design" canvas.
> This file is *how and in what order* — it changes no requirement.

## 0. Ground rules (apply to every phase)

- **Spec-first:** if a phase finds the spec wrong or silent, stop, write a numbered CR, then code (`SPEC/PLAN.md` §10).
  One already caught: the V2 migration is **`0002`**, not `0001` (`0001_fts_search` exists) — fixed in the spec.
- **Order inside a phase:** domain/pure logic + tests → data layer + tests → UI + component tests → on-device check.
- **Definition of done per phase** (V1's contract, `SPEC/PLAN.md` §9.1): `npm run typecheck` + `npm run lint` + `npm test`
  green; the phase's `IMP-/UI-` rows in `SPEC/traceability.md` flipped from *Not started* to `Pass` (or `Partial` with a
  named trigger); `CLAUDE.md` status line updated.
- **Commits are yours.** At the end of each phase I stop, list exactly what changed, and print the `git add` /
  `git commit` commands. I never run git write commands (standing rule).
- **Device actions:** I ask before anything that touches the phone (install, force-stop, screenshots) — as agreed.
- **Dev-client rebuild** is needed only when native code / manifest changes (phases 5 and 6); other phases are JS-only
  (Metro reload).
- **Backward compatibility:** V1 data must open and behave identically after every phase (IMP-086, IMP-073).

## 1. Phase overview

| # | Phase | Delivers | Native rebuild | Depends on |
|---|---|---|---|---|
| 0 | Spikes | Answers to 3 open technical questions; D42 addendum | one throwaway | — |
| 1 | Data & domain foundation | Migration `0002`, 5 tables, repos, pure split/settlement/message logic | no | 0 |
| 2 | Effective-amount analytics | Every aggregate uses effective spend/income; V1 results unchanged | no | 1 |
| 3 | Split UI (manual, local) | Split sheet, Details card, list badges, edit rules — no SMS yet | no | 1, 2 |
| 4 | Settlements & Splits page | Merge sheet, suggested match, Splits page, Home "Owed to you" | no | 3 |
| 5 | Messaging | Send requests, receive branch, notification Accept/Reject, Unattended queue, contacts | **yes** | 3, 4 |
| 6 | Widgets | Snapshot publisher, 3 Kotlin providers, deep links, Settings › Widgets | **yes** | 2 (for Balance), 5 shares the rebuild |
| 7 | Verification & release | Full test/QA pass, audit, docs, version `2.0.0`, tag | final | all |

Phases 5 and 6 both need a native rebuild — if you're happy to wait, I'll do their native work together so you rebuild
once. Phase 6 can also run **before** 5 (it only needs phase 2); the default order keeps the riskiest piece (messaging)
earlier, while there's time to react.

---

## Phase 0 — Spikes (½–1 day, throwaway code)

Purpose: retire the three things the specs mark "unverified" *before* building on them.

| Spike | Question | Method | Outcome recorded in |
|---|---|---|---|
| 0a Widget approach | Does native Kotlin `RemoteViews` on the Samsung launcher work via our module + config plugin, and is `react-native-android-widget` viable on SDK 57 / RN 0.86? | Build one throwaway provider fed by a SharedPreferences JSON; try the library in a scratch branch/dir only | D42 addendum in `SPEC-implementation.md` §44.1 |
| 0b SMS send | Does `SmsManager` from our app send from the default SIM, return per-message results, and stay out of the Messages Sent box? Does the receive side see it (second phone)? | Tiny `sendSms` native function + a manual send/receive on two phones | §42.3 note; confirms/relaxes the "not in Messages" footnote |
| 0c Contacts | Which `expo-contacts` version is SDK-57-compatible; does the permission flow work in the dev client? | `npx expo install expo-contacts`, read one contact, check `expo-doctor` | §16.7-style note |

**Needs from you:** the phone plugged in, and a second phone (or a friend's number) able to receive an SMS for 0b.
**Exit:** three short findings written into the spec; go/no-go on native-Kotlin widgets. Spike code is deleted or kept
only as the seed of phases 5/6.

## Phase 1 — Data & domain foundation (pure, no UI)

**Build**
- `src/db/schema.ts`: `person`, `split`, `split_share`, `settlement`, `split_request_in` (+ types); FKs/CHECK/indices per §39.
- `npx drizzle-kit generate` → `src/db/migrations/0002_v2_splits.sql` (+ meta, `migrations.js`); the generated file is committed.
- Extend `maintenance.ts` (Clear all data, §20.7) and Export (§20.8) to the new tables; purge tombstones (§20.6).
- Domain (`src/domain/`): `split.ts` (`equalShares`, `percentToMinor`, `validateSplit`, `effectiveAmount`, `shareState`,
  `splitState`, `recomputeYourShare`), `settlement.ts` (`allocate`), `person.ts` (`normalizePhone`),
  `split-message.ts` (`encodeRequest`, `decodeRequest`), `suggest-settlement.ts` — **each with its `.test.ts` written first**.
- Repositories: `persons.ts`, `splits.ts`, `settlements.ts` (`settle` = one DB transaction), `split-requests.ts` — each with tests.
- New settings keys (`splitYourName`, `widgetHideAmounts`, `widgetSnapshotAt`).

**Tests:** property tests (Σ shares = total for random inputs; remainder-to-you), message round-trip + fuzz + GSM-7 + length,
migration snapshot (`migration-v2.test.ts`: V1 fixture through `0001` → `0002`, V1 reads unchanged), cascade/Undo, uniqueness.
**Traceability:** IMP-070…072, 075–077, 078, 079 (decode part), 083–086, 087, 088 (repo part) → Pass.
**Exit:** all green; app still boots and V1 screens unchanged on the phone (a JS reload is enough). **~2–3 days.**

## Phase 2 — Effective-amount analytics

**Build**
- `analyticsRepo` gains the two SQL fragments (§41) and every statement (Spent, Income, Balance/arc, category breakdown, largest
  expenses, daily series, week mode, MoM deltas, running balance) switches to them; `owedToYouMinor()` / `youOweMinor()`.
- Rows with effective amount 0 dropped from "Largest expenses".

**Tests:** the **existing V1 `analytics.test.ts` fixtures must pass unchanged** (IMP-073's fast path); new cases — split debit,
waived share, credit partly settled, a debit that settles a request (no spending change).
**Traceability:** IMP-073, 074, 096 (data side) → Pass.
**Exit:** with no splits in the DB the Analytics screen looks identical to today (checked on the phone). **~1–2 days.**

## Phase 3 — Split UI (manual, local — no SMS)

**Build** (`src/features/splits/`, sheets registered in `SheetRegistry`, §43.2)
- Split sheet: People stage (search, chips, Saved people, Add a number; the **Contacts row is a stub** until phase 5) →
  Amounts stage (You first, equal default, ₹|%, Remaining gating) → save. **"Send requests" is disabled/"Save split"** in this
  phase; sending arrives in phase 5.
- `Split…` row in the Confirm/Edit sheets and Details; the split-aware amount-edit rule (IMP-089); `useSplitDraft` store.
- Details: Split card (You + people, status chips, request line), overflow (Split…, Edit split, Remove split, Waive a share).
- Transactions list: split badge + "Your share ₹N"; Filter sheet Splits chip.
- Design source: the approved canvas (dark tokens from `theme.ts`, Lucide icons).

**Tests:** RNTL for stages/gating/edit rules, repo integration. **Traceability:** UI-070–072, 074–075, IMP-089 → Pass.
**Exit (on the phone):** split a real transaction, see effective spend change on Home/Analytics, edit and remove the split. **~3–4 days.**

## Phase 4 — Settlements & the Splits page

**Build**
- Merge sheet (candidates, Suggested pre-tick, caps, "₹X of ₹Y used", Undo snackbar) from Details / person menu / banner /
  "You owe" rows; **Suggested settlement** banner on credits in the Confirm sheet and Details.
- Splits page (`src/app/splits/index.tsx`): Owed to you (grouped by person), You owe, Requests (list only — populated by
  phase 5), Show settled; per-person menu (Mark all paid…, Resend later).
- Home "Owed to you ₹N" row (only when > 0); Details "Settlements" section; deep link `coinflow://splits`.
- Manual creation of "You owe" items is **out of scope** here (they come from received requests, phase 5) — for testing I'll
  seed them through a dev-only fixture path that is not shipped.

**Tests:** merge caps/atomicity/undo, banner rules, page states. **Traceability:** UI-073*, 076–078, 081, IMP-075/083/085 (UI side) → Pass.
(*result list of UI-073 completes in phase 5.)
**Exit:** settle a share against a real credit on the phone. **~3 days.**

## Phase 5 — Messaging (needs a native rebuild + a second phone)

**Build**
- Native (`modules/coinflow-sms`): `SmsSender.kt` + `sendSms(phone, text)` (default SIM, sent-intent result, 30 s timeout);
  config plugin adds `SEND_SMS`; `expo-contacts` + plugin (`READ_CONTACTS`), just-in-time prompts with rationale.
- JS: `src/services/splits/send-requests.ts` (write split first, send sequentially, per-recipient state, SMS-app fallback),
  result list in the Split sheet, Contacts section of the picker, Resend / reminder.
- Receive: request branch in `smsIngestTask` **before** the bank sender gate (numeric senders only), `receive-request.ts`
  (upsert, withdraw, bounds, rate limit), inbox-only guarantee for the sweeps (own sent text never re-ingested).
- Notifications: channel `split-requests`, category `split-request` with Accept/Reject in `NOTIFICATION_RESPONSE_TASK`,
  grouping, stale-tap routing; Requests tab actions (Accept/Reject/Undo); Settings › **Splits & people** (contacts access,
  "Your name in requests", SIM row, Saved people).

**Tests:** unit (decode/encode already in phase 1; branch routing, rate limit, Accept/Reject headless), integration with mocked native.
**On-device (manual QA, needs the second phone):** send → receive → Unattended → Accept → pay → settle; SEND_SMS denied →
pre-filled SMS app; swipe-away keeps Unattended; alphanumeric/bank SMS never becomes a request.
**Traceability:** IMP-078–082, 088, 098, UI-071 (contacts), 073, 079, 080 → Pass. **~4–5 days.**

## Phase 6 — Widgets (needs the same native rebuild)

**Build**
- `src/services/widgets/publish.ts` (snapshot v1 via `analyticsRepo`, debounced 1 s) + triggers: repo writes, hide-amounts
  setting, app open/foreground, end of every headless task/sweep.
- Native: `publishWidgetSnapshot(json)` function; `SummaryWidgetProvider`, `QueueWidgetProvider`, `QuickAddWidgetProvider`
  (`RemoteViews` layouts from the approved canvas: Summary 4×2 + 2×2, Queue 4×2 + 4×3 — **no 2×2 queue**, Quick add 1×1 + 2×1),
  `res/xml/widget_*_info.xml` with previews/descriptions, colours copied from `theme.ts`, staleness (`periodEndMs`) and
  hide-amounts rendering; registration in `app.plugin.js`.
- Deep links: `coinflow://add` (new `src/app/add.tsx` redirect), `coinflow://review[?open=]`, `coinflow://analytics`.
- Settings › **Widgets** (Hide amounts, how-to-add card).

**Tests:** snapshot content/masking/debounce (jest), deep-link resolution; native rendering is manual.
**On-device (Samsung One UI):** add each widget, sizes, tap targets incl. cold start, hide amounts, a real SMS updating the queue
widget with the app closed, month rollover (or a simulated date).
**Traceability:** IMP-090–097, UI-090–098 → Pass. **~4–5 days.**

## Phase 7 — Verification & release

- Full audit of the V2 rows in `SPEC/traceability.md`; every `Partial` has a named trigger; on-device debt listed.
- Regression: V1 upgrade check on the phone with existing data (IMP-086); analytics parity; a full manual pass of J-flows.
- Docs: `CLAUDE.md` status, `README` feature list, spec status notes, changelog.
- Version bump `2.0.0` in `app.json` + `package.json`, then you tag `v2.0.0` (release commands as before). **~2 days.**

## 2. Rough timeline & the parts most likely to slip

Total ≈ **3–4 weeks** of focused work; phases 5 and 6 carry the risk (native code, second-device testing, OEM launcher quirks).
Likely slip points, with the mitigation already in the plan:
- SMS delivery/filtering quirks (spike 0b first; SMS-app fallback exists).
- Widget behaviour on One UI after midnight/month rollover (staleness rule §44.5; verified on-device in phase 6).
- Analytics regressions (phase 2 gate: V1 fixtures unchanged).

## 3. What I need from you, by phase

| When | Need |
|---|---|
| Now | Approve (or reorder) this plan |
| Phase 0 | Phone attached via USB; a second phone/number for the SMS test; OK to install a throwaway dev build |
| After each phase | You run the commit commands I print; you glance at the phase's on-device check |
| Phase 5/6 | OK to run `expo prebuild --clean` + rebuild the dev client (once, together) |
| Phase 7 | Decide the release moment; you push the tag |

## 4. Open choices for you (defaults noted)

1. **Order:** keep the default (messaging before widgets), or do the smaller **widgets first** for an earlier visible win?
2. **One rebuild:** batch the native work of phases 5+6 into a single rebuild (default), or rebuild per phase?
3. **Dev-only seed for "You owe" testing** in phase 4 (default) vs. waiting for phase 5 to test the merge-a-debit path.
