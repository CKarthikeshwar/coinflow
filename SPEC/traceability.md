# CoinFlow — Traceability matrix

`UI-0xx → IMP-0xx → component/service → test`, per `SPEC-implementation.md` §34.4. Maintained
incrementally as each feature (`SPEC/PLAN.md` §9) lands — rows are added when a feature starts,
`status` flips to Pass when its tests are green.

Row shape: `IMP-0xx | criterion | UI-0xx | component/service | test kind | test id / file | status`.

## Cross-cutting fix — web bundling broke (§18.3)

Not tied to a single feature: `npm run web` / `expo export --platform web` failed with
`Worker chunk not found for: expo-sqlite/web/worker.ts`, discovered once F11/F3 wired real
database reads into `src/app` files and the always-mounted `SheetHost`. Root cause: every
`src/db/repositories/*.ts` file imported `useLiveQuery` **directly** from `drizzle-orm/expo-sqlite`,
which statically pulls in `expo-sqlite`'s WASM-backed web worker — regardless of whether the hook
is ever called, and regardless of `db/client.ts`'s existing (correct) `.web.ts` split, since that
split only covers `db` itself, not this separate import. Fixed by adding `src/hooks/use-live-query.ts`
+ `.web.ts` (the "live-query wrappers" file §18's project structure already anticipated) and
pointing all 5 repository files at it instead of the package directly — the web variant returns a
static empty result and never touches `expo-sqlite`. Also added `src/app/index.web.tsx`,
`src/app/review-queue.web.tsx`, and `src/features/app-shell/sheet-host.web.tsx` — per §18.3, web
is meant to render one "CoinFlow is an Android app" placeholder (`src/ui/android-only-notice.tsx`)
with zero database access, not a broken/empty version of the real screens. Verified with
`expo export --platform web` (now produces 4 static routes, ~24KB each) and `--platform android`
(unaffected — same 7.1MB bundle either way).

## Cross-cutting fix — Add/Confirm sheet never rendered on-device (§28.2/§16.7)

Not tied to a single feature: on a real Android device, **every** `SheetHost` sheet (F3's Confirm,
F4's Add) silently did nothing — the button dimmed, `openSheet()`/`.present()` were confirmed
(via logging) to run correctly with no thrown error anywhere (JS console or native Logcat), yet no
sheet ever appeared. Invisible in Jest (mocks the whole native module) and in `expo export` bundle
checks, so it surfaced only once real on-device testing began post-F5.

Root cause, found by instrumenting `@gorhom/bottom-sheet`'s own source line-by-line: `SheetHost`'s
effect ran `ref.current?.dismiss()` on `current == null` **unconditionally**, including on the
component's very first mount — i.e. it called `.dismiss()` on a `BottomSheetModal` that had never
been presented. Gorhom's `handleDismiss()` has no guard for that case: it unconditionally sets its
internal `statusRef.current = MODAL_STATUS.DISMISSING` and only ever clears it back via the
"already closed" branch, which this call doesn't qualify for — so `statusRef` gets stuck at
`DISMISSING` **permanently**. From then on, every future `.present()` call succeeds and correctly
flips the modal's own `mount` state to `true`, but the portal-render callback that actually
registers the sheet's content (`handlePortalRender`, gated on `statusRef.current !== DISMISSING`)
silently no-ops forever — so the sheet's content is never handed to the `PortalHost` that would
render it. No exception anywhere in the chain; every layer "succeeds."

Fixed in our own code, not the library: `sheet-host.tsx` now tracks whether the sheet has ever
actually been presented (`hasPresented` ref) and only calls `.dismiss()` after that's true, never
on the initial `current == null` mount.

Separately, while root-causing this, also found and defensively patched (via `patch-package`,
`patches/@gorhom+bottom-sheet+5.2.14.patch`) an unrelated, real, currently-unmerged upstream bug:
`@gorhom/bottom-sheet@5.2.14` + `react-native-reanimated@4.x` has documented cases (gorhom/
react-native-bottom-sheet#2721) where a sheet's mount-position `useAnimatedReaction` can silently
fail to register when the JS thread is busy at mount, leaving it parked off-screen with no error —
exactly the class of risk flagged (unverified) in `SPEC-implementation.md` §16.7. Applied the fix
from the still-open upstream PR #2720 (JS-driven fallback that re-evaluates mount position if the
reaction never fires) as defense-in-depth; it wasn't the cause of this specific bug, but is a real
gap in the current library/Reanimated-v4 combination worth keeping patched.

Manual verification owed since F3/F4 (see their sections below) for "the sheet actually opens
on-device" is now **confirmed** — Add Transaction opens correctly on a physical device.

## F1 — Automatic transaction detection

| IMP | Criterion | UI-0xx | Component/service | Test kind | Test id / file | Status |
|---|---|---|---|---|---|---|
| IMP-001 | A qualifying SMS creates exactly one pending Suggestion and writes nothing to the ledger. | — | `src/domain/parser/parse-sms.ts` · `src/services/tasks/sms-ingest.ts` | unit | `src/domain/parser/parse-sms.test.ts` (corpus, 47 cases) · `src/services/tasks/sms-ingest.test.ts` (IMP-001 block) | Pass |
| IMP-002 | A non-qualifying SMS (OTP, promo, balance-only, request-money, non-matching sender) creates no Suggestion. | — | `src/domain/parser/ignore-rules.ts` · `src/constants/sms-senders.ts` · `src/services/tasks/sms-ingest.ts` | unit | `src/domain/parser/parse-sms.test.ts` (ignore-gate fixtures) · `src/services/tasks/sms-ingest.test.ts` (IMP-002 block) | Pass |

**F1 §17.3 steps 6–8 (account-rule lookup, notification post, self-heal) are now built as part of
F2** — see below. F1 itself (steps 1–5, "create the Suggestion") is otherwise complete.

## F2 — Transaction notification

| IMP | Criterion | UI-0xx | Component/service | Test kind | Test id / file | Status |
|---|---|---|---|---|---|---|
| IMP-003 | A single-transaction notification shows amount + direction + account. Known account → Save/Add/Discard; new account → Add/Discard only. Body tap opens Confirmation. No confidence indicator. | — | `src/services/notifications/channel.ts` · `categories.ts` · `content.ts` · `post.ts` | unit | `src/services/notifications/content.test.ts` · `post.test.ts` | Partial — content/actions/posting done; **`Add`/body-tap → Confirmation sheet needs F3's navigation tree (§28), not built yet** |
| IMP-004 | With 2+ pending Suggestions, notifications are delivered as one group that opens the Review queue (no per-item Add/Discard on the group). | — | `src/services/notifications/post.ts` (`refreshGroupSummary`) | unit | `post.test.ts` | Partial — group-summary content/count logic done; **native OS-level stacking not available** (see note below); "opens the Review queue" needs F11, not built yet |
| IMP-005 | Adding a Suggestion (via Confirmation or the notification's `Save`) writes the transaction, removes it from the queue, and upserts its `AccountRule`. | — | `src/services/notifications/respond.ts` (`handleSave`) | unit | `respond.test.ts` | Pass for the notification-`Save` path; the Confirmation-sheet path is F3 |
| IMP-007 | Dismissing a Suggestion (queue or notification) removes it permanently and adds nothing. | — | `src/services/notifications/respond.ts` (`handleDiscard`) | unit | `respond.test.ts` | Pass for the notification-`Discard` path; the queue-swipe path is F11 |
| IMP-009 | Suggestions and their notifications survive an app kill / device reboot. | — | `src/services/notifications/reconcile.ts` | unit (gating only) | `sms-ingest.test.ts` (asserts `reconcileNotifications` is called) | Partial — logic built; **on-device kill/reboot verification not automated**, owed manually |

**Known platform/library gap (discovered during implementation, not a product decision):** the
installed `expo-notifications@57.0.16` has no `threadId`/group-key field on
`NotificationContentInput`, and its Android builder never calls `Notification.Builder#setGroup()`.
Spec §31.3/§31.4 assumed real OS-level nesting under the group summary; that isn't available
without native code beyond the "SMS bridge only" module surface (D24). Individual and summary
notifications post correctly (right content, right count) but appear as separate entries, not a
collapsed stack. Documented in `src/services/notifications/post.ts`.

**Category identifiers changed from spec:** `txn-known`/`txn-new` → `txnKnown`/`txnNew` (no
hyphen) — `expo-notifications`' own `setNotificationCategoryAsync` docs warn that `:`/`-` in a
category id "might not work as expected". Pure identifier-string change, no behavior difference.
See `src/services/notifications/categories.ts`.

**Not yet built (carried to F3/F11):** the `ADD`/body-tap foreground routing into the Confirmation
sheet (needs the §28 navigation tree + the sheet itself — neither exists in `src/app` yet); "N
transactions to review" opening the Review Queue screen (F11, doesn't exist yet).

**Manual verification still owed** (not automated — Jest mocks `expo-sqlite` and
`expo-notifications`): on a real device, confirm a qualifying SMS actually posts a visible
notification with the right buttons, that tapping `Save`/`Discard` while the app is killed writes
the transaction / deletes the suggestion, and that a reboot doesn't lose a pending suggestion's
visibility (Review Queue badge, once F11 exists, is the fallback today).

## F11 — Review queue

Also the first real navigation: `src/app/index.tsx` (Home) is still a placeholder (§30.4 is a much
larger, separate feature) but now carries the one real, spec'd piece it needs to exist for this —
the "N to review" action-strip row (§6.2) — and `src/app/review-queue.tsx` is a genuine pushed
route. Both currently live flat under `src/app/` rather than the eventual `(tabs)/` group (§28.1)
since the full tab shell isn't built yet.

| IMP | Criterion | UI-0xx | Component/service | Test kind | Test id / file | Status |
|---|---|---|---|---|---|---|
| IMP-003 | (continued from F2) Review Queue lists every pending Suggestion with the known/new action set. | UI-023/024 | `src/app/review-queue.tsx` · `src/features/detection/suggestion-card.tsx` | RNTL | `suggestion-card.test.tsx` | Partial — card + screen built; no RNTL test of the screen itself (DB/notifications mocking owed) |
| IMP-004 | (continued from F2) "N transactions to review" now actually opens the Review Queue. | — | `src/features/home/action-strip.tsx`, Home → `router.push('/review-queue')` | — | — | Pass (manual code review; no navigation test written) |
| IMP-005 | (continued from F2) Review Queue's inline **Save** writes the transaction the same way the notification's Save does. | — | `review-queue.tsx` reuses `respond.ts`'s `handleSave` directly (§17.4b shared path, exactly as spec'd) | unit (via `respond.test.ts`, already covers `handleSave` itself) | — | Pass |
| IMP-007 | (continued from F2) Review Queue dismiss removes a Suggestion permanently, adds nothing. | — | `review-queue.tsx` reuses `respond.ts`'s `handleDiscard`; "Dismiss all" → `dismissAllPending` + `cancelAllSuggestionNotifications` | unit (`handleDiscard` via `respond.test.ts`) | — | Pass for per-row dismiss; "Dismiss all" has no dedicated test |

**Simplification vs. spec (documented, not silent):** the card's "overflow → Dismiss" is a direct
tap-to-dismiss icon button, not a swipe gesture. Same functional outcome, simpler to build
correctly in this pass. Noted in `src/features/detection/suggestion-card.tsx`.

**Not yet built (was true at F11's own completion; the card-tap → Confirmation piece is now
built, see F3 below):** the full `(tabs)/` navigation shell, deep links (§28.3), and the rest of
Home (§30.4: balance hero, income/spending tiles, recent activity, quick add) remain separate,
larger, not-yet-started work.

**Infra fixes made along the way (not feature-specific, benefit every future component test):**
`jest.config.js` didn't transform `lucide-react-native` (ESM-only export) or handle its
`"react-native"` package.json export condition — added to `transformIgnorePatterns` +
`moduleNameMapper`. Also discovered `@testing-library/react-native@14`'s `render()` is `async`
(a real API change from earlier versions) — must be `await`ed, unlike older RNTL docs/examples.

**Manual verification still owed:** on-device, confirm Review Queue actually lists a real pending
suggestion, that inline Save/Dismiss work, and that the permission banner shows/hides correctly
against real OS permission state.

## F3 — Transaction Confirmation

First use of the sheet system: `SheetHost` (§28.2) is now mounted at the app root
(`GestureHandlerRootView` → `BottomSheetModalProvider` → `<SheetHost/>`, alongside the `<Stack/>`),
and Review Queue's card tap now actually opens it (`sheets.open('confirm', {suggestionId})`) —
resolving the "not yet built" item F11 left open.

**Bug found and fixed while building this (affects F1/F2/F11 too, not just F3):** §25.1 defines
"known account" as a rule with a non-null `categoryId` **or** a non-null `lastNote` — F2's
`content.ts` and `respond.ts` only checked `categoryId`, so a rule with a learned note but no
category was wrongly treated as "new" (missing the one-tap `Save` button, and `handleSave` would
have silently no-op'd on it). Fixed by extracting `resolveCategoryForAccount` /
`isKnownAccountRule` into `src/domain/categorize.ts` (§25, previously unbuilt) and having F2's
`content.ts`/`respond.ts` and F11's `review-queue.tsx` all use the one corrected implementation.
Covered by `src/domain/categorize.test.ts` + updated cases in `content.test.ts` / `respond.test.ts`.

| IMP | Criterion | UI-0xx | Component/service | Test kind | Test id / file | Status |
|---|---|---|---|---|---|---|
| IMP-003 | (continued) `Add`/body-tap → Confirmation sheet, pre-filled from the Suggestion + learned rule, all fields editable. | UI-020/021/045 | `src/features/transactions/confirm-sheet.tsx` | unit (write path only) | `write-confirmed-transaction.test.ts` | Partial — sheet built and wired from Review Queue; **notification `Add`/body-tap still doesn't reach it** (needs §28.3 deep links / cold-start routing in `_layout.tsx`, not built); no RNTL test of the sheet itself |
| IMP-005 | (continued) **Add** writes the transaction + confirms the Suggestion + upserts the `AccountRule`, all in one DB transaction. | — | `src/features/transactions/write-confirmed-transaction.ts` | unit | `write-confirmed-transaction.test.ts` | Pass |
| IMP-006 | Cancelling the Confirmation sheet leaves the Suggestion pending. | — | `confirm-sheet.tsx` (`handleCancel` + discard `ConfirmDialog`) | — | — | Pass by construction (no write happens on cancel/discard) — no dedicated test |
| IMP-008 | Amount `₹0` or `> ₹10,00,000` shows helper text and requires an extra confirm before it can be added. | — | `confirm-sheet.tsx` (`isEdgeAmount` → helper text + a second `ConfirmDialog` gate on Add) | — | — | Pass by construction — no dedicated test |

**Simplifications vs. spec (documented, not silent — see the file-header comment in
`confirm-sheet.tsx`):**
- Date & time is shown, not editable — no date/time picker built yet.
- Account is a plain text field, not the "shows matching past accounts as you type" autocomplete
  (`searchByPrefix` already exists in the repo, just isn't wired to a dropdown here).
- The amount block doesn't collapse to a sticky summary bar on scroll, and the numeric keypad
  doesn't swap for the OS keyboard when a text field is focused (§6.4's polish motion) — both
  stay visible together; same function (edit amount via keypad, edit text via OS keyboard,
  submit), less animation.
- Payment method is a 5-option `SegmentedControl` row, not its own picker sheet.
- The V-6 discard-guard is implemented by **disabling** swipe-down/scrim-tap-to-close while the
  draft is dirty (forcing the explicit **Cancel** button, which does the real dirty-check +
  discard dialog) rather than intercepting the gesture and reopening — see the comment in
  `sheet-host.tsx`. Same outcome (can't lose unsaved input by accident), simpler mechanism.

**Not yet built:** the notification's `Add` button / body tap and the Review Queue group summary
tap still don't open anything (need §28.3's deep-link table + cold-start/warm response handling
in `_layout.tsx`); the Category Picker's "Manage categories →" footer link (Categories/F6 doesn't
exist yet).

**Manual verification still owed:** the sheet actually opening on-device is now **confirmed** (see
the cross-cutting sheet-rendering fix above); the numeric keypad entering amounts correctly,
category picking round-tripping back to the sheet, and Add actually landing a row in the
`transaction` table remain unverified.

## F4 — Add Transaction

`src/features/transactions/confirm-sheet.tsx` was generalized into
`src/features/transactions/transaction-sheet.tsx` — one `TransactionSheetBody({mode})` component
for both Confirm (F3) and Add (F4) rather than duplicating the ~200 shared lines (fields, keypad,
discard-guard, write call). `sheet-host.tsx` now also routes `SheetName:'add'` to it. Reuses
`write-confirmed-transaction.ts`'s `'add'`-mode branch untouched (already covered by
`write-confirmed-transaction.test.ts`, written during F3).

| IMP | Criterion | UI-0xx | Component/service | Test kind | Test id / file | Status |
|---|---|---|---|---|---|---|
| IMP-010 | Add validation — amount empty/0 keeps **Add** disabled with an inline hint; no other field is required. | UI-030/032 | `transaction-sheet.tsx` (`addDisabled`) | — | — | Pass by construction — no dedicated test |
| IMP-011 | Income transactions store no category, regardless of what was selected before switching direction. | — | `write-confirmed-transaction.ts` (shared with F3) | unit | `write-confirmed-transaction.test.ts` | Pass |
| IMP-012 | `type` is always stored (`expense`/`income`), derived from direction. | — | `write-confirmed-transaction.ts` (shared with F3) | unit | `write-confirmed-transaction.test.ts` | Pass |
| IMP-013 | Saving with a non-empty account upserts its `AccountRule` (creates or bumps `hitCount`), same as Confirm. | — | `write-confirmed-transaction.ts` (shared with F3) | unit | `write-confirmed-transaction.test.ts` | Pass |

**Entry point is temporary:** the real trigger is the raised centre **Add** button in the bottom
tab bar (§4), which doesn't exist (no `(tabs)/` shell built yet). Added a plain "Add transaction"
button to the Home stub (`src/app/index.tsx`) instead, purely so this is reachable and testable —
not the intended final placement. Empty-state CTAs (Home/Transactions/Analytics, §6.5) don't exist
either, since those screens don't exist yet.

**Same deferrals as F3** (date/time editing, account autocomplete, keypad/OS-keyboard swap
animation, payment method as a segmented row) — see F3's section above; they now apply to both
sheets since it's one shared component.

**Not yet built:** the success toast (§30.7 mentions one; `ui/toast.tsx` isn't built) — the sheet
just closes silently on success, same as Confirm.

**Manual verification still owed:** the Add sheet actually opening on-device is now **confirmed**
(see the cross-cutting sheet-rendering fix above); that it shows correct defaults (Expense, UPI,
Uncategorized, now), the disabled-until-amount>0 gate actually blocks the button, and a
manually-added transaction lands correctly with `source:'manual'` remain unverified.

## F5 — Transaction list

New routes `src/app/transactions.tsx` and `src/app/transaction/[id].tsx` (+ `.web.tsx` twins,
following the pattern the earlier web-bundling fix established). Reuses `useTransactionList`
(already built in Phase 2/3, search + day-subtotals included), `getCategoryMap`,
`softDeleteTransaction`/`restoreTransaction`, and the already-scaffolded `useUndo` store. New UI:
`TransactionCard`, `DayGroupHeader`, and `UndoSnackbar` (+ `features/transactions/undo-host.tsx`,
the DB-aware wrapper, mounted once at the app root next to `SheetHost`).

| IMP | Criterion | UI-0xx | Component/service | Test kind | Test id / file | Status |
|---|---|---|---|---|---|---|
| IMP-015 | Search matches note + description + account; list groups by day, newest first. | UI-040/043 | `transactions.tsx`, `useTransactionList` | unit (search/grouping logic pre-existing) | — | Pass for search + grouping; **no dedicated screen test** |
| IMP-016 | Swipe-delete → confirm + Undo (~5s), same soft-delete/restore mechanism from the Confirmation/Add flows. | UI-042 | `transaction/[id].tsx` (delete), `undo-host.tsx` | — | — | Partial — **delete is a tap (overflow icon), not a swipe**; confirm+undo mechanism itself is real |
| IMP-018 | Opening a transaction shows every field, a provenance line for detected ones, and lets you delete it. | UI-044/046 | `transaction/[id].tsx` | — | — | Pass for view + delete; **Edit is a no-op** (Edit sheet not built) |

**Simplifications vs. spec (documented, not silent):**
- No Filter sheet / filter chips this pass — search alone; category/type/method/date-range
  filtering is a smaller, separate follow-up (`useTransactionList` already accepts those params,
  so the query side is ready whenever the Filter sheet UI gets built).
- Delete is a direct tap on a trash icon in Details, not a swipe gesture on the list row.
- Details' **Edit** button and the Uncategorized **Set category** inline control are both TODO
  no-ops — both need the Edit sheet (§30.8), not built yet.
- No `Chip` component (§29.4) yet — Details' meta row (direction/category/method) is plain
  hairline-separated text, not chips.

**Not yet built:** the Edit sheet itself; the Filter sheet; the `edited` marker (P2) mentioned in
§6.8's states list.

**Manual verification still owed:** on-device, confirm the list actually renders real data with
correct day grouping and subtotals, search narrows results, FlashList scrolls smoothly with a
non-trivial row count, and delete-then-undo genuinely restores the row.

## F6 — Categories

First P1 feature. The repository layer (`src/db/repositories/categories.ts` — `createCategory`,
`updateCategory`, `deleteCategory`, `reorderCategories`, the `DuplicateCategoryNameError`/
`ProtectedCategoryError` guards) already existed from an earlier phase, unused by any UI; this
pass adds the two screens that actually exercise it: `src/app/categories.tsx` (§6.11, pushed page)
and `src/features/categories/category-editor-sheet.tsx` (§6.12, one mode-aware sheet for both
Create and Edit, wired into `SheetHost`'s `'createCategory'`/`'editCategory'` `SheetName`s —
previously placeholders). The Category Picker's "Manage categories →" footer link (a TODO left
by F3) now closes the picker and pushes `/categories`, resolving that item.

Added `countTransactionsForCategory` to the repository (new — the delete-confirm dialog's "N
transactions become Uncategorized" body needs a live count) and a `src/stores/category-draft.ts`
store mirroring `add-sheet-draft.ts`'s shape (`dirty` drives `SheetHost`'s V-6 discard-guard for
these two sheets the same way it already does for Confirm/Add).

| IMP | Criterion | UI-0xx | Component/service | Test kind | Test id / file | Status |
|---|---|---|---|---|---|---|
| IMP-017 | The default category set is exactly the nine from `SPEC/idea.md`; "Other" cannot be deleted. | UI-060 | `src/db/seed-data.ts` (pre-existing) · `categories.tsx` (no delete affordance on protected rows) · `category-editor-sheet.tsx` (no Delete button on protected rows) | — | — | Pass by construction — no dedicated test |
| IMP-018 | Deleting a custom category reassigns its transactions to Uncategorized. | UI-060 | `categories.ts` (`deleteCategory`, pre-existing) exercised from `categories.tsx` and `category-editor-sheet.tsx` | — | — | Pass (pre-existing repo logic; newly reachable from UI) |
| IMP-019 | Duplicate category names are rejected. | UI-060/061 | `categories.ts` (`nameTaken`, pre-existing) · `category-editor-sheet.tsx` (live client-side check disables **Save** + inline error; server-side `DuplicateCategoryNameError` as a backstop) | — | — | Pass by construction — no dedicated test |

**Testing note:** consistent with the rest of `src/db/repositories/` (none of which is unit-tested
directly in this codebase — DB access is mocked at the Jest boundary, and repo logic is exercised
indirectly through the UI/feature layers that call it), no new repository test file was added for
`categories.ts`. `npm test` (143 tests, unchanged) still passes; `typecheck`/`lint` are clean.

**Simplification vs. spec (documented, not silent):** row delete on the Categories screen is a
direct tap on a trash icon, not a swipe gesture — the same "tap not swipe" simplification already
used for Review Queue's dismiss (F11) and the transaction list's delete (F5).

**Not yet built:** the Settings hub itself (§6.13/6.14) doesn't exist, so "Entry: Settings ›
Categories" isn't reachable that way yet — only via the Category Picker's "Manage categories"
link, which is sufficient for this pass since Settings is separate, not-yet-started work. Usage
count per row (marked P2 in §6.11) isn't shown. Reordering (`reorderCategories` exists in the
repo) has no drag-to-reorder UI. Navigating to Manage Categories from mid-Add/Confirm and coming
back does not preserve that sheet's in-progress draft (it resets, same as reopening Add fresh) —
acceptable for how rarely that detour happens, not worth the added state-preservation complexity
this pass.

**Manual verification still owed:** on-device, confirm the Categories screen lists real default +
custom categories, Add/Edit/Delete round-trip correctly against the database, the duplicate-name
guard actually blocks Save, and deleting a category with real transactions genuinely reassigns
them to Uncategorized (list/Details reflect it immediately).
