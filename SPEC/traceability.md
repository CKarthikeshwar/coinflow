# CoinFlow — Traceability matrix

`UI-0xx → IMP-0xx → component/service → test`, per `SPEC-implementation.md` §34.4. Maintained
incrementally as each feature (`SPEC/PLAN.md` §9, definition of done in §9.1) lands — rows are
added when a feature starts, `status` flips to Pass when its tests are green.

Row shape: `IMP-0xx | criterion | UI-0xx | component/service | test kind | test id / file | status`.

**Status contract (`SPEC/PLAN.md` §9.1 / `SPEC-implementation.md` §34.4):** `Pass` = implemented +
carries the test tier(s) its scope calls for. `Partial` = a *named, bounded* deferral with an
explicit trigger ("closes when F8 lands") — never a stand-in for "didn't write the test" or "not
verified yet." Every `Partial` row below predates this contract (see the audit at the bottom of
this file) and needs a pass to either close it out or attach a real trigger.

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
count per row (marked P2 in §6.11) isn't shown. (`reorderCategories` in the repo is **not** a §6.11
gap — re-reading §30.3, it's onboarding's category-review screen, F12, not started, that calls it
on **Done**; §6.11's own Controls list has no reorder affordance at all. An earlier pass through
this file miscategorized it as an F6 deferral — corrected here, see the 2026-09-03 audit's note.)
Navigating to Manage Categories from mid-Add/Confirm and coming back does not preserve that
sheet's in-progress draft (it resets, same as reopening Add fresh) —
acceptable for how rarely that detour happens, not worth the added state-preservation complexity
this pass.

**Manual verification: done.** On-device (an automated `adb`-driven pass, screenshots + taps, this
one time): Categories lists real default + custom categories, **+** opens a genuinely fresh "New
category" sheet, name + icon selection work, **Save** round-trips into the Custom section, the
trash icon shows the "N transactions become Uncategorized" confirm and deletes correctly back to
the empty state.

**Bug found and fixed while verifying this (own code, not a spec gap):** `category-editor-sheet.tsx`
initially used a plain React Native `<View>` as its root, but the sheet renders with
`enableDynamicSizing: true` (no fixed `snapPoints`, unlike Confirm/Add) — that mode requires the
content be wrapped in `@gorhom/bottom-sheet`'s own `<BottomSheetView>` (or `<BottomSheetScrollView>`,
already correctly used by `category-picker-sheet.tsx`), since only those components report their
measured height back into the library's layout state. A plain `<View>` never does, so
`contentHeight` stayed permanently unset, no snap points could ever be computed, and **+**/row-tap
silently did nothing — `.present()` succeeded, the sheet's content was correctly registered to
render, but it could never compute where on screen to actually put itself. Fixed by swapping the
root to `<BottomSheetView>`. Confirmed via targeted logging (`evaluatePosition` bailing forever on
`detents=undefined` while `contentHeight=-999`) before the fix, then a clean `adb`-driven repro
after it.

Also hardened `@gorhom/bottom-sheet` defensively while investigating (`patches/@gorhom+bottom-sheet+5.2.14.patch`,
alongside the pre-existing PR #2720 mount-time fix from the F3/F4 sheet-rendering bug, see the
cross-cutting fix above): `BottomSheetModal`'s `handleDismiss` can, on Reanimated v4, suffer the
same class of stuck-status bug as the mount case — `statusRef` clears from `DISMISSING` only via
`<BottomSheet onClose>`, which depends on the same fragile animated reaction. Added a JS-driven
watchdog there too. Not the root cause of *this* bug (the actual cause was the missing
`BottomSheetView` wrapper above), but a real, separate latent risk worth keeping patched since it
would otherwise permanently break every sheet on the shared modal instance if it ever fires.

**Second bug found and fixed, same testing pass (own code again):** cancelling a sheet and
immediately tapping a different row (well under the ~300ms a real close animation takes) silently
dropped the new sheet's content — reproduced on-device, user-reported, and confirmed via video
frame analysis (a clean tap on the row's label, not the earlier chevron issue, with no sheet ever
appearing). Root cause: `SheetHost` shares one `BottomSheetModal` across every sheet type, and its
effect called `.present()` for the new sheet the instant `current` changed — but `.dismiss()`'s
close *animation* is still running at that point. `@gorhom`'s portal-render gate checks whether the
modal is still mid-close **at the moment new content is registered**, not at present()-call time,
so a present() that races an in-flight dismiss gets silently dropped and is never retried once the
close actually finishes. Fixed in `sheet-host.tsx` by serializing the two: a `dismissing` ref makes
the effect defer `.present()` while a close is in flight, and the modal's own `onDismiss` callback
(previously just the registry's `close`) now re-checks `current` once the close genuinely
completes — presenting whatever was requested in the meantime, or finalizing the close if nothing
was. General fix, not category-specific: applies to rapid sheet-switching anywhere in the app
(Confirm ↔ Category picker ↔ Add, not just the Categories screen), since it's the shared-modal
timing itself that was racy, not any one sheet's content.

**Third, smaller fix, same pass:** the chevron (`>`) on each Categories row was purely decorative
with no touch handler — visually the most "tappable"-looking part of the row, but tapping it did
nothing (confirmed via video: a tap ~60px off a delete button's trash icon landed on the chevron
instead and silently failed). Fixed by making the chevron open Edit too, same as the row itself, so
there's no dead zone at the row's right edge.

**Fourth bug, next video, general (not category-specific):** hardware/gesture **back** while any
sheet was open did nothing to the sheet itself — confirmed via video, several consecutive back
presses on an open Edit-category sheet with zero effect — and instead fell through to whatever's
behind it: the underlying route, or, with nothing left to pop, straight out of the app entirely to
the phone's home screen (also caught on video, from within a Confirm/Add sheet). Root cause: none
of `@gorhom`'s sheet, `SheetHost`, or `expo-router` intercepted the Android back button — the sheet
is an overlay, not part of the route stack `expo-router`'s own back handling knows about, so an
unhandled press fell through to the native default. Fixed in `sheet-host.tsx` with a
`BackHandler` listener that intercepts back presses while any sheet is open. Applies to every
sheet (`add`/`confirm`/`categoryPicker`/`createCategory`/`editCategory`), not just Categories.

**Revised after user feedback** (first pass just no-op'd back when dirty, mirroring the
swipe/scrim-tap no-op — user correctly pushed back: back should show the same "discard changes?"
prompt Cancel does, not silently do nothing): added `onRequestClose`/`setOnRequestClose` to
`useSheetRegistry` — each sheet body (`transaction-sheet.tsx`, `category-editor-sheet.tsx`)
registers its own `handleCancel` (the dirty-check + discard `ConfirmDialog` logic it already had
for its Cancel button) as this handler while mounted. `requestClose()` calls it instead of closing
directly, so `SheetHost`'s back handler — and anything else that isn't the sheet's own Cancel
button — now gets the *exact* Cancel behavior, not a bypass of it: discard-confirm when dirty,
immediate close when clean. (The nested case — back while the discard-confirm dialog itself is
showing — needs no extra code: RN's `Modal`, which `ConfirmDialog` is built on, already handles
the Android back button itself via its own `onRequestClose` prop.)

**Also fixed, same feedback (real bug, not just the back-button gap):** `dirty` in both
`add-sheet-draft.ts` and `category-draft.ts` was a one-way latch — any `patch()` call set it
`true` forever, so switching Income → Expense and back to Expense (a net no-op) was wrongly
flagged as an unsaved change, and back correctly followed V-6 but for the wrong reason (there
was nothing to discard). Fixed by snapshotting the seeded values as `_initial` on `open()` and
recomputing `dirty` as a real diff against it on every `patch()` — a field patched back to its
original value now correctly clears `dirty` again, same as it never changed.

**Still wrong after that fix, user re-reported:** the diff-based `dirty` was verified correct for
reverts (unit-tested directly against the store: toggle Expense→Income→Expense clears `dirty`),
but the user's actual complaint was a *forward* toggle — switching payment method UPI→Cash, or
Expense→Income, without reverting — still triggering the discard-confirm, which they don't want.
Consistent with how they described the original bug ("just a tab switch"), a `SegmentedControl`
flip isn't data entry the way typing an amount or picking a category is; it shouldn't need a
"discard changes?" prompt on Cancel/back even when it's a genuine, non-reverted change. Fixed by
removing `direction`/`type` and `paymentMethod` from `add-sheet-draft.ts`'s `DIRTY_KEYS` entirely
— only `amountMinor`, `categoryId`, `account`, `note`, `description` count toward `dirty` now.

## Cross-cutting — closing the F2–F5 functional deferrals (2026-09-03)

Following the audit below (§9.1's definition of done), the "Not yet built" items across F2–F5 that
had no closing trigger were built out in one pass, each with the unit tests §9.1 point 2 calls for.

**Notification routing (§28.3/§31.5/§31.6).** New `src/services/notifications/deep-link.ts` —
`resolveNotificationTarget(data)`, pure, re-reads the Suggestion/Transaction by id rather than
trusting the notification's own `data` (a `Suggestion` may have been confirmed/dismissed since the
notification posted). New `src/features/app-shell/notification-router.tsx`, mounted in
`_layout.tsx`, uses `Notifications.useLastNotificationResponse()` — the SDK 57 hook that covers
both cold-start and a warm tap in one reactive value — rather than the spec's literal
`getLastNotificationResponseAsync()` + `addNotificationResponseReceivedListener` pairing; same
§31.6 routing table, simpler mechanism. `SAVE`/`DISCARD` never reach this component (they're
`opensAppToForeground:false`, always handled headless by `NOTIFICATION_RESPONSE_TASK`) — it only
acts on `ADD`/body-tap. 6 unit tests (`deep-link.test.ts`).

**Edit sheet (§6.6/§30.8).** `transaction-sheet.tsx` gained a third `TransactionSheetMode`,
`'edit'` — seeded from `getTransaction(id)` via a new `params.transactionId`, written through a new
`writeEditedTransaction()` in `write-confirmed-transaction.ts` (`updateTransaction` +
`upsertFromTransaction`, matching §30.8's "`updateTransaction` (+ `upsertFromTransaction`;
`editedByUser=1`)" — an early pass at this file had skipped the rule upsert as "F8 isn't built,"
which was wrong: the function already exists in `account-rules.ts`, unused until now).
`transaction/[id].tsx` gained the bottom-anchored **Edit** button §6.8 always specified but that
was never actually added (only the *behavior* was stubbed as a TODO; the button itself didn't
exist), and an Uncategorized "Set category" control in the meta row (opens Edit rather than a
standalone one-tap picker — documented simplification, no separate write path outside the normal
draft/sheet system for a one-off). 8 new/updated unit tests in `write-confirmed-transaction.test.ts`.

**Bug found while wiring Edit (own code, pre-existing, not introduced today):**
`category-picker-sheet.tsx`'s `pick()` was hardcoded to `open('confirm', params)` regardless of
which sheet opened the picker — so picking a category from the Add sheet would silently reopen it
as Confirm (wrong title, wrong validation gate, `getSuggestion(undefined)` failing open). Fixed by
passing `returnTo: mode` through `openSheet('categoryPicker', ...)` from every caller and having
the picker reopen whichever sheet actually opened it.

**Filter sheet (§6.9).** New `src/features/transactions/filter-sheet.tsx` (Category multi-select ·
Type segmented · Payment method multi-select · date-range preset chips + Custom) and
`filter-params.ts` (pure route-param ↔ query serialization, unit tested). Applied filter lives in
`transactions.tsx`'s own route params (`filter-draft.ts`'s pre-existing header comment already
called this out) via `router.setParams`; the query-side plumbing (`categoryIds`/`type`/`methods`/
`from`/`to` in `useTransactionList`) already existed, unused, since F5's first pass. New shared
`src/ui/chip.tsx` (toggle chip for the sheet, removable chip for Transactions' active-filter row) —
justified as a real shared component since both files needed it, not spec's not-yet-built `Chip`
catalog entry built speculatively. Date range "Custom" uses two plain `yyyy-MM-dd` text fields, not
a calendar picker — no calendar component exists yet and no native date-picker package is
installed (a new native module needs a dev-client rebuild, a separate decision). 5 unit tests
(`filter-params.test.ts`).

**Bug found while wiring Filter (own code, pre-existing):** `SheetHost`'s `dirty` computation fell
through to `useAddSheetDraft`'s `dirty` for any sheet that wasn't the category editor — meaning the
Filter sheet's swipe/scrim-tap-to-close could be silently disabled by a stale `dirty:true` left
over from an unrelated Add/Confirm/Edit session, since nothing clears that flag just because a
different sheet opened. Filter has no discard-guard of its own (worst case of an accidental close
is re-picking the same filters), so it's now hardcoded `dirty:false`.

**Account autocomplete (§6.5) + date/time editing.** Both added to `transaction-sheet.tsx`:
`searchByPrefix` now backs a live dropdown under the Account field (each row shows the remembered
category; picking pre-fills only the category, not note/method — a different, narrower trigger
than F8's "known-rule" pre-fill on a detected suggestion). Date & time is now a tap-to-reveal pair
of `yyyy-MM-dd`/`HH:mm` text fields — same mechanism as Filter's Custom range, not a calendar/clock
picker, for the same reason (no picker component, no native date-picker dependency installed).

**Success toast (§30.6/§30.7).** New `src/stores/toast.ts` (generalized version of `undo.ts`'s
snackbar shape — message + one optional action + auto-hide timer) + `src/ui/toast.tsx` +
`src/features/app-shell/toast-host.tsx`, mounted in `_layout.tsx`. Add/Confirm's `submit()` now
shows "Added ₹… " with a **View** action that pushes `/transaction/[id]`, matching §30.6's
`toast "Added … · View"`. Edit does not get this toast — §30.8 doesn't spec one for it.

**Not a real gap, corrected instead of built:** "Drag-to-reorder categories" — see the Audit
section below.

All verified together: `npm run typecheck` clean, `npx eslint` clean on every touched file,
`npm test` 161/161 passing (up from 143 at the start of this pass).

## Audit — gaps against the definition of done (`SPEC/PLAN.md` §9.1), 2026-09-03

Everything below predates §9.1 — F1 through F6 were built under the older, looser "run tests" loop.
This is the one-time reconciliation pass the new contract requires: name every gap plainly, then
either close it or attach a real trigger. Nothing here is new breakage; it's what was already
quietly true, made visible. Grouped by kind, not by feature.

### A. Test-tier debt (§9.1 point 2 — the specific thing that prompted this audit)

**Closed same day (2026-09-03, second pass) — see section D below for how:** RNTL coverage for
`review-queue.tsx`, `transaction-sheet.tsx` (all three modes), `transactions.tsx`,
`transaction/[id].tsx`, `categories.tsx`, `category-editor-sheet.tsx`, `filter-sheet.tsx`; direct
unit tests for `categories.ts`, `account-rules.ts`, `transactions.ts`. The "Pass by construction —
no dedicated test" rows (IMP-006, IMP-008, IMP-010, IMP-017, IMP-019) are now asserted directly —
see each file's own test for which row it covers.

**Still open:** the J4 Maestro flow now exists (`e2e/j4-manual-add.yaml`) but is **unverified** — no
device/emulator or Maestro CLI was available to actually run it; treat it as a first draft, not a
passing test. J2's dependency chain (F1, F2, F11, F3, F8) still isn't fully closed (F8 not built),
so its flow isn't overdue yet under §9.1 point 2.

### B. Functional deferrals still open (not test gaps — actual behavior not built)

**Closed out same day (2026-09-03), each per §9.1 — see the feature sections below for detail:**
notification `Add`/body-tap + Review-Queue group-summary tap routing (new `deep-link.ts` +
`notification-router.tsx`) · Edit sheet (Transaction Details' Edit button + Uncategorized "Set
category," both wired through the existing `transaction-sheet.tsx` as a third `mode`) · Filter
sheet (new `filter-sheet.tsx` + `filter-params.ts`, Transactions' Filter button + removable chip
row) · account autocomplete (`searchByPrefix` wired to a dropdown) · date/time editing (two text
fields, same mechanism as Filter's custom range) · success toast (new `toast.ts`/`toast.tsx` +
`ToastHost`, "Added ₹… · View").

**Not a real gap — corrected, not closed:** "Drag-to-reorder categories (F6)" was misattributed in
this file's earlier F6 section. `reorderCategories` belongs to F12's onboarding category-review
screen (§30.3), not §6.11's Categories management screen, which has no reorder affordance in the
UX spec at all. Nothing to build here until F12.

**Still open:**

- Native OS-level notification grouping (F2) — not a deferral, a documented library limitation
  (`expo-notifications@57.0.16` has no group-key support without native code beyond D24's "SMS
  bridge only" surface). Correctly documented already; listed here only so it isn't confused with
  a genuine deferral.

### C. What this doesn't mean

Not every "Partial" above needs fixing *right now* — §9.1 point 3 allows deferral. What it doesn't
allow is what several of these had: no trigger, so they never come back up. The fix this audit
makes is informational (naming things plainly); the actual close-out — writing the RNTL tests, the
J4 Maestro flow, deciding Edit/Filter's place in the plan — is follow-up work, prioritized with the
user, not implied by this list existing.

## Closing the test-tier debt (2026-09-03, second pass)

Section A's RNTL/repository gaps, closed the same day as the audit that found them, at the user's
explicit request. Two things had to happen before any of the actual tests could be written:

**1. `SPEC-implementation.md` §34 gained the "which tier does this code need" decision rule** (a
paragraph in §34.0) — unit tests aren't exclusive to `src/domain`; any deterministic logic module
anywhere in `src/` gets one, repository functions with real behavior included. This is now the
standing answer to "should this get a test, and which kind" for all future work, not just this pass.

**2. RNTL had never actually been run against a real sheet/screen in this codebase — it was broken
in four separate ways, only found by trying it:**
- `@gorhom/bottom-sheet` transitively requires `react-native-worklets`' native loader, which
  crashes under Jest. Fixed via `react-native-worklets/jest/resolver` (`jest.config.js`'s
  `resolver`) — the package's own Jest-safe resolution helper, not something built here.
- `BottomSheetView`/`BottomSheetScrollView` need an actual mounted `BottomSheet` context
  (`useBottomSheetInternal` throws without one) that a bare `render()` doesn't provide, and
  isn't what these tests verify anyway — sheet positioning/animation is Maestro's job, not
  RNTL's (the same "which tier" rule). Fixed with a manual mock, `__mocks__/@gorhom/bottom-sheet.tsx`,
  swapping the layout-measuring wrappers for plain `View`/`ScrollView` — picked up automatically
  by Jest for every test file, no per-file wiring.
- `react-native`'s real `Modal` (which `ConfirmDialog` is built on) renders through an
  `AppContainer`/`RootTagContext` that only exists under a real app root, so its content silently
  never appeared in any RNTL query — Modal-gated content (every discard-confirm, delete-confirm)
  looked absent regardless of `visible`. Fixed with `__mocks__/rn-modal.tsx`, wired via
  `jest.config.js`'s `moduleNameMapper` onto `react-native/Libraries/Modal/Modal` (the exact file
  `react-native`'s own index re-exports it from) — keeps the one behavior that matters
  (gating on `visible`) without the app-root machinery.
- `@testing-library/react-native@14`'s `fireEvent.press`/`.changeText` return `Promise<void>` —
  they must be `await`ed or the state update they trigger hasn't flushed before the next
  assertion runs. Silent failure mode: the query afterward just sees stale state, not an error.
  Same family of API-shape surprise this project already hit once with `render()` itself (F11's
  note, "must be awaited, unlike older RNTL docs/examples") — now two for two.

None of this was product code — it's why RNTL had zero real coverage in this codebase despite being
an installed, listed dependency since Phase 1: nobody had gotten a sheet-shaped component to render
in a test before. `suggestion-card.test.tsx` (F11) never hit any of these because `SuggestionCard`
is a plain card with no `@gorhom`/`Modal` involvement.

**Tests added**, all passing (`npm test`: 161 → 247), typecheck and `expo lint` clean throughout:

| File | Kind | Covers |
|---|---|---|
| `db/repositories/categories.test.ts` | unit | `createCategory`/`updateCategory` duplicate-name guard (IMP-019), `deleteCategory` reassign + protected guard (IMP-017/018), `reorderCategories` |
| `db/repositories/account-rules.test.ts` | unit | `upsertFromTransaction` insert/bump/keep-category-when-uncategorized/null-clears-note (§25.2), `searchByPrefix`, `updateAccountRule`, `deleteAccountRule` |
| `db/repositories/transactions.test.ts` | unit | `insertTransaction`/`updateTransaction` (IMP-011, `editedByUser`, re-derived `searchText`/`normalizedAccountKey`), soft-delete/restore, `purgeDeleted`, `hasDedupeKey` (both tables) |
| `features/categories/category-editor-sheet.test.tsx` | RNTL | create/edit mode, duplicate-name inline error (IMP-019), protected-category has no Delete, delete-confirm names the count |
| `features/transactions/transaction-sheet.test.tsx` | RNTL | Add/Confirm/Edit modes, amount-gate disable, Income hides Category (UI-022), discard-guard incl. the toggle-isn't-dirty regression, edge-amount gate (Confirm), Save vs. Add routing |
| `app/review-queue.test.tsx` | RNTL | loading/empty states (empty ≠ error), known/new row Save visibility, Dismiss all + confirm count |
| `app/categories.test.tsx` | RNTL | default/custom split, protected row has no delete affordance, delete-confirm count, row→Edit, +→Create |
| `app/transactions.test.tsx` | RNTL | skeleton, no-data vs. no-match empty (UI-042), row→Details nav, filter chip render/remove, Filter button seeds the sheet |
| `app/transaction/[id].test.tsx` | RNTL | missing-transaction guard, Uncategorized→"Set category", income never shows it, SMS-vs-manual provenance line, Edit/Delete wiring, Undo |
| `features/transactions/filter-sheet.test.tsx` | RNTL | Reset enablement, Apply serializes category/type/date correctly, custom-range start-after-end inline error blocks Apply |
| `features/transactions/filter-params.test.ts` | unit | route-param ↔ query (de)serialization, `expo-router`'s array-form params |
| `services/notifications/deep-link.test.ts` | unit | §31.6 stale-tap table (already added earlier the same day, alongside the notification-routing feature) |

**Still not run, only written:** `e2e/j4-manual-add.yaml` — no Maestro CLI or device/emulator in
this environment. First run will need selector fixes; don't trust it as passing until it's actually
been run once.

## Cross-cutting fix — Android bundling broke (found starting F6.5, 2026-09-03)

Not tied to a single feature, and not introduced by F6.5's own work: `expo export --platform
android` failed with `Unable to resolve module console from
@testing-library/react-native/dist/helpers/logger.js`, tracing back to `src/app/categories.test.tsx`
— a file untouched this session, so the bug predates F6.5. Root cause: every `*.test.tsx` file
co-located with its screen under `src/app/` (the project's existing convention, e.g.
`categories.test.tsx`, `review-queue.test.tsx`) is a valid route-file extension, so expo-router's
file-based routing was sweeping them into the route table alongside the real screens. Metro then
tried to bundle each as an app route for every platform; `@testing-library/react-native` pulls in
Node's `console` module, which native (non-web) bundling can't resolve — web bundling didn't error
on the same import (browser output tolerates it) which is why this was invisible in the one export
check any earlier pass had run. Never caught before because no prior pass ran
`expo export --platform android` (or an equivalent native bundling check) after test files started
living under `src/app/`.

Fixed in `metro.config.js`, not in any test or route file: added `/\.test\.[jt]sx?$/` to
`config.resolver.blockList` (appended to Expo's own default block-list entries, not replacing
them). Metro now never resolves a `*.test.*` file into any bundle or the route table, on any
platform. `jest.config.js` is a wholly separate config, read by `jest`/`jest-expo` directly —
Metro's `resolver.blockList` has no effect on it, so its own `testMatch`/`roots` still find and run
every test file exactly as before; `npm test` is unaffected (247/247 both before and after).
Verified with `expo export --platform android` (now produces a single 7.2MB `.hbc` bundle, no
error) and `--platform web` (still 13 static routes, the `*.test` entries that used to leak into
the sitemap are gone too — a side benefit, not the fix's goal).

## F6.5 — App shell & Home

**Status:** ✅ Done (2026-09-03). Step 2 (moving the existing screens into the shell) turned out to
be a byproduct of step 1 rather than its own pass; step 4 ("connect it all to live data") likewise
landed inside step 3 since Home couldn't be built without it. Step 5 ("test it") closed with
276/276 automated tests plus the user confirming the built app end-to-end on a physical device —
tab bar, Home's hero/tiles/action-strip/recent list, and the permission banner all verified
working. Added `SPEC-implementation.md` CR-4 (2026-09-03) to close
the screen-ownership gap this feature fills; see that CR for why it exists.

**Step 1 — the `(tabs)` navigation shell.** New `src/features/app-shell/tab-bar.tsx`
(`CoinFlowTabBar`, D25/D32, §29.4) — a custom floating pill `tabBar` for `(tabs)/_layout.tsx`
(new), not `NativeTabs`: 4 destinations (Home/Transactions/Analytics/Settings, active `text` /
inactive `text3`) plus a raised centre **Add** button (`sheets.open('add')`), `Elevation.pop`.
Existing `index.tsx` (Home) and `transactions.tsx` (+ their `.web.tsx` twins and
`transactions.test.tsx`) moved from flat `src/app/` into `(tabs)/`, unchanged in behavior — the
route paths (`/`, `/transactions`) are unaffected by the group rename. Two new stub tabs,
`analytics.tsx` and `settings.tsx` (+ `.web.tsx` twins), placeholder "Coming soon" screens that F9
and F8.5 will replace — added only so the shell has its real 4 destinations, per §28.1.

**Simplification (documented, not silent):** the design calls the pill "blurred"
(SPEC-UI-UX.md §3.6) — `expo-blur` isn't installed. Ships as a solid `surface` fill instead, same
shape/elevation; swapping in a real `BlurView` later doesn't touch the layout.

**Real bug found and fixed while building this:** the custom tab bar floats
(`position:'absolute'`) rather than docking, so — unlike the library's default bar — it does
**not** automatically reserve its own space in each screen's layout; `@react-navigation/bottom-tabs`
only exposes its measured height via a context hook (`useBottomTabBarHeight`), which a screen must
call itself. Without this, the floating pill would sit on top of Home's action-strip row and
Transactions' last list row. Fixed by having both screens add `tabBarHeight` to their own bottom
padding; `transactions.test.tsx` gained a mock for `expo-router/js-tabs`'s
`useBottomTabBarHeight` (returns `0`) since RNTL doesn't render inside a real `<Tabs>` navigator.

**Verified:** `npm run typecheck` clean, `npx eslint` clean, `npm test` 247/247 (unchanged count —
no new tests were owed by this step; it's shell/layout work, not new business logic), plus a full
`expo export` for both `--platform web` and `--platform android` (the latter also confirms the
cross-cutting Metro fix above).

**Not yet built after step 1:** relocating the rest of the flat routes (`review-queue.tsx`,
`categories.tsx`, `transaction/[id].tsx`) is **not** planned — per §28.1 these stay pushed pages
outside the tab shell, already correctly placed.

**Step 3 — the real Home screen (§30.4), plus the data layer it needed that didn't exist yet.**
Nothing in the app previously computed a running balance, a period Spent/Income summary, or a
month-over-month delta — this step built that (§26's Home-relevant slice) alongside the screen
itself, since the screen can't exist without it:

- **New `src/domain/period.ts`** — `monthPeriod()` / `previousMonthPeriod()` (§27.3), deliberately
  narrow (month only, no week mode / stepping — that's F9's). **New `src/domain/analytics.ts`** —
  `percentDelta(current, previous)` (§26.3), `null`-guarded on `previous === 0`, pulled out as a
  pure function specifically so the one piece of real branching logic here has a direct unit test
  rather than only being exercised indirectly through a hook (per §34.0's tier rule).
- **New `src/db/repositories/analytics.ts`** (`analyticsRepo`, §21.5) — `useRunningBalance` (§26.2),
  `usePeriodSummary` (§26.1), `useMoMDeltas` (§26.3, composes two `usePeriodSummary` calls +
  `percentDelta`), `useUncategorizedCount` (§26.8, **unscoped** for Home — period-scoped "Fix N" is
  a separate F9 concern). No dedicated hook-level test: the real logic (`percentDelta`) is already
  unit-tested directly; the hooks themselves are aggregate SQL + `COALESCE` guards, the same class
  of "plain query, no branching" the rest of `src/db/repositories/` doesn't test directly either.
- **New UI:** `src/ui/stat-tile.tsx` (`StatTile`, §29.4 — label + figure + trend-glyph delta line,
  "No prior month" when the delta is `null`), `src/features/home/balance-hero.tsx` (`BalanceHero`),
  `src/ui/error-state.tsx` (`ErrorState` — genuinely new; nothing had needed a real query-failure
  state before this), a `'home'` layout added to `Skeleton`. `TopBar` gained the `'brand'` variant
  (wordmark + current month) its own header comment had been anticipating since F11.
- **Rewrote `(tabs)/index.tsx`** — wires all of the above to real data: hero, Income/Spending
  tiles, both action-strip rows (review + the new uncategorized one), Recent (≤8, reuses F5's
  `TransactionCard`), the permission banner (new `src/hooks/use-permission-status.ts` — live
  SMS + notification status, `AppState`-reactive, shared rather than re-inlined), and the
  skeleton / empty (new-user) / error states.

**Bugs found and fixed while building this (own code, not pre-existing):**
1. `formatMoney`'s `sign` option had no way to show a genuine negative magnitude without also
   forcing a `+` on positive values — `sign:'none'` strips `−` too (by design, and correctly
   tested/relied on elsewhere: `content.ts`, `day-group-header.tsx`, `amount-input.tsx` all pass
   already-non-negative amounts). But §27.5 explicitly requires the Home hero to show `₹0`/`₹1,234`
   with no `+`, while still showing `−` for a real negative. Added a third option,
   `sign:'negativeOnly'`, rather than changing `'none'`'s existing, correctly-tested behavior.
2. (Investigated, turned out **not** to be a bug.) The V-1 "thin space" between a sign and `₹`
   looked like a plain space in both `money.ts` and its test file when read as text — it's
   actually already the correct `U+2009` character in both places; the tooling used to inspect it
   just can't render the visual difference from a regular space. No change needed; confirmed with
   a byte-level check before touching anything, so nothing was "fixed" that wasn't broken.
3. The React Compiler's lint flagged a direct `Date.now()` call inside `TopBar`'s render body
   (`react-hooks/purity`). Same class as `formatWhen`'s existing `now = Date.now()` default
   parameter — moved the month-label formatting into a new `formatMonthLabel(ts = Date.now())` in
   `domain/format/when.ts` so the impure default lives behind an imported function boundary, same
   pattern already established, rather than suppressing the lint.
4. `use-permission-status.ts`'s effect triggered `react-hooks/set-state-in-effect` for the same
   reason `review-queue.tsx`'s own (now-duplicated) inline permission check already does — an
   `eslint-disable-next-line` with the same justification comment, matching that precedent exactly
   rather than inventing a new pattern.

**Not done, noted rather than silently skipped:** `review-queue.tsx` has its own inline SMS-only
permission check that predates this step's shared `usePermissionStatus` hook — a real, small
duplication now. Not refactored here (different dismiss-state read mechanism — a one-time
`useState` snapshot there vs. this step's live `useSetting` — makes it more than a drop-in swap,
and out of scope for "build Home"). **Bounded, not vague:** scheduled into F8.5 (`SPEC-implementation.md`
CR-5) — that feature builds Settings › SMS & notifications, which needs the identical live-status
read, so swapping Review Queue onto the shared hook rides along with that pass rather than being a
third open-ended "someday."

**Verified:** `npm run typecheck` clean, `npx eslint` clean, `npm test` 276/276 (247 before this
step + 6 `formatMoney`/`formatPercentDelta` cases + 4 `period.ts` + 5 `analytics.ts` + 14 for the
new `(tabs)/index.test.tsx` — loading / error+retry / empty-new-user / loaded-with-negative-balance
/ both action-strip rows / recent-row navigation / See-all / the permission-banner priority and
dismiss-persistence rules), plus a full `expo export` for both `--platform web` and
`--platform android`. No on-device verification yet — still owed, same as step 1.

**Follow-up, same day — `PermissionBanner` copy + emphasis (user request, post-review).** Two
small changes to `src/ui/permission-banner.tsx`, made after the user actually looked at the built
screen: (1) the SMS message reworded from "SMS permission is off — transactions won't be detected
automatically." to "Need SMS permission to detect transactions automatically." (2) the user asked
to make the alert glyph "more highlighted" and specifically proposed colouring it yellow — a direct
conflict with V-11 (no colour anywhere outside the two already-sanctioned exceptions) and this
component's own frozen description ("neutral inset... not tinted", `app.css`'s prototype comment:
"neutral, hairline, no tint"). Flagged the conflict rather than applying it silently; built a
side-by-side comparison (grey / yellow / a greyscale-emphasis alternative) as an Artifact so the
call could be made by looking at it, not just reading about it. **Chosen: the greyscale option** —
the glyph now sits in a filled `surface3` circle at full-brightness `text` (the same "quiet glyph
in a circle" treatment `ConfirmDialog` already uses for its own warning glyph, §3.6/§29.4) instead
of floating bare at `text3`, and the banner's own border moved from a plain `hairline` to `text3`
for a touch more contrast. No colour introduced; V-11 and the component's own spec text both still
hold exactly as written — this is a contrast/weight refinement within them, not a change to them,
so no `SPEC-UI-UX.md` CR was needed. Verified: `npm test` still 276/276 (no test asserted the old
styling), typecheck/lint clean.

## F7 — Uncategorized handling

**Split with F9, made explicit (`SPEC-implementation.md` CR-6):** the Analytics "Where it went"
Uncategorized row + "Fix N" shortcut cannot exist before F9's Analytics screen does. Everything
else below is F7's own, buildable now.

**Already true before this pass** (built incidentally by earlier features, not re-verified with
new tests here — each already had its own coverage): never-guessed detection (F1/F3's
`resolveCategoryForAccount`); counted in spending totals (structural — `usePeriodSummary`/§26.1
sum by `type`, not `categoryId`, so an Uncategorized expense was never excluded); Home's count
(F6.5's `useUncategorizedCount`); the V-4 dashed-underline list styling on `TransactionCard`
(pre-existing, before this session).

**Built this pass — the filter option, plus a real bug found and fixed:**

- **The bug:** F6.5's Home "N uncategorized" row linked to
  `/transactions?filter=uncategorized` — a **dead link**. `transactions.tsx` never read a `filter`
  param; tapping it opened Transactions showing everything, unfiltered. Found while scoping F7,
  not reported by the user — the on-device pass that verified F6.5 apparently never had an
  uncategorized transaction to tap through with.
- **The fix, and why it's not a one-line patch:** Uncategorized isn't a real `category.id` — it's
  `categoryId IS NULL` (§25.3) — so it can't go through the existing `categoryIds: string[]`
  multi-select the same way a real category does. Added a parallel `uncategorized: boolean` flag
  end to end: `FilterDraft` (`src/stores/filter-draft.ts`) → `RawFilterParams`/`ParsedFilter`
  (`filter-params.ts`, route param `?uncategorized=1`) → `TransactionListQuery` →
  `useTransactionList` (`src/db/repositories/transactions.ts`). `FilterSheet` gained a dedicated
  **Uncategorized** chip in the Category section (the real system category row with
  `key:'uncategorized'` stays excluded from the regular per-category chips, as before — it still
  can't be matched by `categoryId` equality; the new chip is a flag, not that row). Home's link now
  points at `?uncategorized=1`, which actually works.
- **A correctness detail that would have been a second, quieter bug:** `categoryId IS NULL` alone
  also matches every **income** transaction (income is always uncategorized too, IMP-011) — income
  isn't what "Uncategorized" means anywhere else in the spec (§26.8 explicitly scopes its own count
  to `type='expense'`). The query condition mirrors that scope exactly:
  `categoryId IS NULL AND type='expense'`, ORed with any selected real `categoryIds` so
  "Food + Uncategorized" still reads as one combined filter.
- **Simplification (documented, not silent):** the Uncategorized chip renders as an ordinary
  toggle chip (filled/selected), not the dashed-outline variant §3.6's catalog describes for it —
  `Chip` doesn't have that variant yet and adding one wasn't required to make the feature work.
  Same category of deferral as the tap-not-swipe delete simplifications elsewhere in this file.

**Test-tier decision (§34.0):** the real branching logic here (the income-exclusion guard, the OR
with `categoryIds`) is SQL condition construction inside a `useLiveQuery`-based hook — the same
class of code this codebase has consistently *not* given a dedicated hook-level unit test anywhere
(`usePeriodSummary`/`useMoMDeltas` in F6.5 for the identical reason: no in-memory-SQLite harness
exists here to assert a query's real filtered output, and the existing hand-rolled `db` mock in
`transactions.test.ts` doesn't support `.orderBy().limit()` chains `useTransactionList` needs).
Correctness instead rests on: matching the already-frozen §26.8 SQL exactly (not inventing new
scope), plus RNTL coverage of the params actually being written and read correctly end to end.

**Tests added**, `npm test` 276 → 279:
- `filter-params.test.ts` — `uncategorized:'1'` parses `true`, anything else `false`; updated the
  two existing default/empty-string cases to include the new field.
- `filter-sheet.test.tsx` — Uncategorized renders exactly once (not the excluded system category
  row a second time); toggling it and Apply writes `uncategorized:'1'`; combining it with a real
  category writes both. **Replaced** the old test asserting Uncategorized was *absent* — that was
  the bug's own test coverage, asserting the wrong thing on purpose (a category-chip-only reading
  of a spec line that was always meant to include a filter option).
- `(tabs)/index.test.tsx` — updated the one assertion that still expected the dead `?filter=`
  link.

**Verified:** `npm run typecheck` clean, `npx eslint` clean, `npm test` 279/279. No on-device
re-check yet for this specific pass (the fix is small and covered by the RNTL tests above; owed
before F7 is called fully done, same standing gap as F6.5's "automated ≠ on-device" note).

**2026-09-03, later — on-device re-check.** User confirmed on a real device: filter works, the
dead-link bug is fixed. F7 called done.

## F8 — Account memory

**Most of F8's own behaviour already existed before this pass** — built incidentally while F2
(notification one-tap Save), F3 (Confirmation pre-fill), F4 (Add sheet account autocomplete), and
F11 (Review Queue's inline Save) were wired up: `src/db/repositories/account-rules.ts`'s full
`upsertFromTransaction`/`getAccountRule`/`searchByPrefix`/`updateAccountRule`/`deleteAccountRule`/
`useAccountRules()`, already unit-tested (`account-rules.test.ts`, present before this pass). An
earlier traceability entry (F5) even flags that a prior pass wrongly skipped the rule upsert as
"F8 isn't built" when the function already existed and just wasn't called yet.

**What this pass actually built — D16's one remaining piece:** the **Settings › Account rules**
screen (§30.16, UI-UX §6.14) — "the only window into F8's behaviour; silent-only is frustrating
when it learns wrong."

- **`src/app/account-rules.tsx`** (+ `.web.tsx` → `AndroidOnlyNotice`, same split as
  `categories.tsx`) — a pushed route, root-relative like `categories.tsx`/`review-queue.tsx`.
  Lists `AccountRuleRow`s (`src/features/settings/account-rule-row.tsx`, per the §29.4 catalog:
  account · note · category chip · hit count); empty state until the first rule is learned; row
  tap opens the editor sheet; a trailing trash-icon tap deletes (**tap not swipe** — same
  documented simplification as Categories/Review Queue/the transaction list, not a new one).
- **`AccountRuleEditorSheet`** (`src/features/settings/account-rule-editor-sheet.tsx`), a new
  `'editAccountRule'` `SheetName` wired into `SheetHost` alongside the existing sheets. Shaped
  like `CategoryEditorSheet` (header Cancel/title, a dirty-tracked draft store —
  `src/stores/account-rule-draft.ts`, discard + delete `ConfirmDialog`s) rather than reusing the
  transaction-draft-coupled `CategoryPickerSheet` for category selection: an inline single-select
  category list lives directly in this sheet instead of a second sheet hop, since account rules
  aren't part of the Add/Confirm/Edit transaction draft. No "create" mode — rules only ever come
  from `upsertFromTransaction`, so the sheet only ever edits an existing row (`params.normalizedKey`).
- **Entry point, scoped deliberately:** the spec's real entry point — the Settings tab's grouped
  list row — is F8.5's screen, not built yet (`settings.tsx` is still F6.5's "Coming soon" stub).
  Rather than block F8 on F8.5 (wrong order per `SPEC/PLAN.md` §12), the stub gained **one
  temporary row** ("Account rules" → `router.push('/account-rules')`). F8.5 will replace the stub
  wholesale; its own Account rules row will point at this same already-built screen — not rebuilt
  again then.
- **Simplification (documented, not silent):** the delete affordance exists in *both* the list
  row (tap-to-delete) and the editor sheet's footer Delete button — same duplication
  `CategoryEditorSheet`/`categories.tsx` already established for categories, not a new pattern.

**Test-tier decision (§34.0):** the data-layer logic (`upsertFromTransaction`'s last-write-wins /
Uncategorized-keeps-learned-category / explicit-null-clears-note) was already covered by
`account-rules.test.ts` before this pass — not re-tested here. This pass's own new logic is two
RNTL-tier screens/sheets, both covered directly.

**Tests added**, `npm test` 279 → 293:
- `src/app/account-rules.test.tsx` (7) — empty state; row renders account/note/category
  chip/usage count; "No note"/"Uncategorized" fallbacks; row tap opens `editAccountRule` with the
  right `normalizedKey`; delete-confirm calls `deleteAccountRule`; back button.
- `src/features/settings/account-rule-editor-sheet.test.tsx` (7) — pre-fills account/note/category
  from the target rule; Save writes the trimmed note; an all-whitespace note saves an explicit
  `null` (P-6); picking a different category and saving writes the new `categoryId`; Cancel with
  no edits closes silently; Cancel after an edit shows the discard-confirm; Delete confirms then
  calls `deleteAccountRule`.

**Verified:** `npm run typecheck` clean, `npx eslint` clean, `npm test` 293/293. No on-device
check yet for this pass — owed before F8 is called fully done, same standing gap noted on every
recent feature.

**2026-09-03, later — on-device re-check.** User confirmed on a real device: F8's Account rules
screen works end to end. F8 called done.

## F8.5 — Settings

**Ambiguities found and resolved, recorded rather than guessed past silently:**

- **`IMP-065` doesn't exist.** `SPEC-implementation.md` cites it twice (§1 line 244, §20.7) for
  Clear all data's two-step confirm, but the §13 criteria table only ever runs `IMP-001..045` —
  there is no `IMP-065` row anywhere, and `git log -S "IMP-065"` shows it entered the doc on
  2026-09-01 (Phase 2/3 drafting), well before this session. Read as a typo for `UI-065`, which
  *does* exist in `SPEC-UI-UX.md` ("Clear all data requires a two-step confirm") and is exactly
  the requirement those two citations are describing. Treated `IMP-044` + `UI-065` together as
  full coverage; left the doc's own typo alone per user instruction (2026-09-03) rather than
  editing `SPEC-implementation.md`.
- **UPI has no assigned icon.** `SPEC-UI-UX.md` §3.4's payment-method icon list only maps
  Card/Cash/Bank transfer/Wallet to a Lucide glyph; UPI is named but given none (the prototype's
  own UPI glyph is a hand-drawn shape with no direct Lucide equivalent). Found that
  `suggestion-card.tsx`'s `METHOD_ICON` had already silently reused `credit-card` for UPI,
  undocumented. `payment-methods.tsx` repeats that same choice for consistency, documented this
  time in its own file header rather than a second silent guess.
- **`PermissionCard` (onboarding) vs. `statusblock` (the prototype's actual Settings element)**
  — `design-prototype/01-midnight/p1-screens.html` uses two visibly different components for
  onboarding's permission step (`permcard`, an "Allow" CTA card) and Settings' SMS &
  notifications (`statusblock`, a state-pill + single Enable/"Open system settings" button row).
  `SPEC-implementation.md`'s own component catalog (line 2085) already made the call to unify
  both into one shared `PermissionCard` at `features/onboarding/permission-card.tsx` before this
  pass started — not re-litigated here, just followed; its props extended with an optional
  `canAskAgain` (default `true`) beyond the catalog's literal `kind/state/optional?/onRequest`
  list so the same component can pick "Allow" vs. "Enable" vs. "Open system settings" for its
  action label.
- **§30.15 says the SMS & notifications row's subtitle reads `useSetting`**, but §22.4's
  architecture principle is permission status is "read live from the OS, never stored" — and
  every other consumer (Home, Review Queue, this row's own subpage) already reads it live via
  `usePermissionStatus`. Followed the repeatedly-stated architecture principle over the one
  screen-spec line; `settings.tsx` reads `usePermissionStatus` directly, not `useSetting`.
- **About's "licenses / help links"** have no real URL anywhere in the repo's specs, and a URL
  isn't something to invent. Shipped version + the on-device privacy line only; the licenses/help
  rows are a named, bounded deferral (`about.tsx`'s own header) — add them once there's an actual
  URL to point at, not a placeholder one.

**A real functional gap found and fixed, not just a naming one:** IMP-042 ("a permanently-denied
permission's Enable action opens the system settings screen") **was not actually implemented
anywhere** before this pass — Home's and Review Queue's existing `PermissionBanner` "Enable"
handlers both unconditionally re-request, since neither needed the OS's denied-vs-permanently-
denied distinction until now. `usePermissionStatus` (F6.5) gained `smsCanAskAgain`/
`notificationsCanAskAgain` (additive — existing `.sms`/`.notifications` consumers unaffected) so
`sms-notifications.tsx` can be the first caller to actually branch: `canAskAgain ? request() :
Linking.openSettings()`.

**Built this pass:**

- **`usePermissionStatus`** (`src/hooks/use-permission-status.ts`) — extended with
  `smsCanAskAgain`/`notificationsCanAskAgain`; its own new unit test file
  (`use-permission-status.test.ts`, none existed before) since it now carries real branching
  logic, not just a live-read passthrough.
- **`PermissionCard`** (`src/features/onboarding/permission-card.tsx`) — shared component, see
  above. First real consumer is Settings; onboarding (F12) will be the second, later.
- **`ConfirmDialog`'s `twoStep` prop** (UI-065) — a type-`CONFIRM` inset field that gates the
  confirm button; resets on every closing path (confirm/Cancel/scrim/hardware-back), all of which
  already funnel through two internal handlers, not a `visible`-watching `useEffect` (would need
  a synchronous `setState` inside the effect body — this codebase's own lint rule forbids that
  pattern). No dedicated test existed for `ConfirmDialog` itself before this pass; added one.
- **`src/features/settings/export.ts`** (§20.8, D17/IMP-043) — `exportJson()`/`exportCsv()`,
  didn't exist yet. Uses SDK 57's `File`/`Paths` API (not the legacy
  `FileSystem.writeAsStringAsync`), per `AGENTS.md`. JSON = the exact §20.8 shape (live rows
  only). CSV = header + one row per live transaction, signed rupees to 2dp (not the UI's
  Indian-grouped `formatMoney` — a different, plainer format §20.8 explicitly calls for),
  `occurredAt` as ISO-8601 local, RFC-4180-style quoting for fields containing a comma/quote/
  newline.
- **Four new subpages** (root routes + `.web.tsx` → `AndroidOnlyNotice`, same split as
  `categories.tsx`): `payment-methods.tsx` (static), `sms-notifications.tsx` (the two
  `PermissionCard`s + the IMP-042 branch above), `data.tsx` (Export JSON/CSV buttons + the E17
  retry-message path + Clear all data's two-step confirm → `clearAllData()`, which already
  existed and needed no changes), `about.tsx` (version via `expo-constants` + the privacy line).
- **`settings.tsx` rebuilt** from F8's temporary stub into the real grouped list (§30.15): six
  rows, each pushing its subpage; live SMS-derived On/Off subtitle + warning glyph (UI-064);
  version footer.
- **CR-5 (housekeeping, named back in F6.5's own entry)** — `review-queue.tsx` swapped its
  older inline `getSmsPermissions` + `AppState`-subscription copy onto the shared
  `usePermissionStatus` hook, and its banner-dismiss read from a one-time `useState` snapshot of
  `getSetting` to the live `useSetting` (matching Home) — the second change is what actually made
  the hook swap a real drop-in rather than leaving a second, differently-shaped duplication.

**Test-tier decision (§34.0):** `clearAllData()` itself was already built and untested-by-this-
screen in an earlier phase (§20.7's own transaction + reseed + vacuum) — not re-tested here, only
that `data.tsx` calls it correctly. `export.ts` mocks `@/db/client` directly (three tables) with
the same fluent-builder pattern `write-confirmed-transaction.test.ts` established, routed by
table name via `getTableName`.

**Tests added**, `npm test` 293 → 337:
- `use-permission-status.test.ts` (3), `confirm-dialog.test.tsx` (6), `permission-card.test.tsx`
  (7), `export.test.ts` (5), `payment-methods.test.tsx` (3), `about.test.tsx` (2),
  `sms-notifications.test.tsx` (6, incl. the IMP-042 branch both ways), `data.test.tsx` (6, incl.
  the two-step confirm gate and the E17 error path), `(tabs)/settings.test.tsx` (4). Two existing
  `review-queue.test.tsx` permission-banner tests rewritten for the CR-5 hook swap, plus two new
  ones (dismissed-while-still-denied stays hidden; Enable calls `refresh()`).

**Verified:** `npm run typecheck` clean, `npx eslint` clean, `npm test` 337/337, plus a full
`expo export --platform web` (18 static routes, all four new subpages included, unaffected
bundle size pattern from the earlier F5 web-bundling fix). No on-device check yet for this pass —
same standing gap as every recent feature; particularly worth an on-device look given this
feature is the first place `Linking.openSettings()` and the two-step `ConfirmDialog` actually
run on a real permission/database state.

## F9 — Spending summary (Analytics)

The first feature that needed real chart rendering — `react-native-svg`/`d3-shape`/`d3-scale`
were installed since Phase 1 (§16) but completely unused until this pass. Structurally different
from F7/F8/F8.5 (mostly screens/forms over data that already existed): this one builds new
period math, new pure statistics, new SQL aggregates, and five new UI components, on top of a
`(tabs)/analytics.tsx` stub that had been "Coming soon" since F6.5.

**A real config gap found and fixed, not a spec ambiguity:** `d3-shape`/`d3-scale` ship pure ESM
(`"type": "module"`, no CJS build) — the moment either was imported, Jest's default
`transformIgnorePatterns` refused to parse them ("Unexpected token 'export'"). `jest.config.js`
needed both packages **and their own transitive ESM-only deps** (`d3-array`, `d3-color`,
`d3-format`, `d3-interpolate`, `d3-path`, `d3-time`, `d3-time-format`, `internmap`) added to the
transform-inclusion list, same treatment already given to the RN/Expo packages there. Metro (the
real app build) was never affected — only Jest's own transform config was missing this.

**A real correctness hazard caught before it shipped:** the natural place to persist
`analyticsPeriodMode` (§19.5, already a known `app_setting` key) was inside
`useAnalyticsPeriod`'s Zustand `create()` initializer — but that store is pulled in through the
`@/stores` barrel `_layout.tsx` imports at the very top of the app (via `SheetHost`), so its
initializer runs at module-evaluation time, **before** `<MigrationGate>` has migrated the DB. A
synchronous `db.select()` there would read an unmigrated table. Fixed by having the store always
start on the current month/week, and moving the persisted-mode read into the Analytics screen's
own mount `useEffect` instead — it only ever renders after the gate has passed.

**Ambiguities found and resolved, recorded rather than guessed past silently:**

- **§30.12's own navigation text is stale**, the same class of drift F7 already found and fixed
  once: it says category rows link to `/transactions?category=<id>&period=…` and "Fix N" to
  `?filter=uncategorized&period=…`, but the real params (built in F5/F7) are `categoryIds`
  (comma-joined), `uncategorized=1`, and `from`/`to` (epoch-ms) — not those names. Wired to the
  real, current param shape (`CategoryBreakdown`'s `openRow`), not the stale spec text.
- **Custom categories have no assigned colour.** `CategoryPalette`'s 9 hues (§3.1/D33) are keyed
  by the 9 default categories' own `key`; a custom category (`key: null`) has none. Resolved as
  planned when this feature was scoped: `resolveCategoryColor` (`domain/analytics.ts`) cycles a
  custom category through the same 9 hues by its `order` field — deterministic, an occasional hue
  collision accepted for V1.
- **UPI icon gap, again** — same missing-icon issue F8.5 already found and worked around
  (`suggestion-card.tsx`'s undocumented `credit-card` reuse); not relevant to this feature's own
  components directly, noted only because `resolveCategoryColor`'s docstring cross-references the
  same class of "one exception the design spec's table doesn't cover" pattern.
- **`StatTile`'s own header comment claims F9's Mean/Median tiles reuse it**, but `StatTile`'s
  comparison line is a signed **percentage**; CR-1's actual wording needs the previous period's
  **absolute amount** ("Last month ₹1,410"). Built `MeanMedianTile` as its own small component
  instead of stretching `StatTile`'s prop surface to cover a data shape it wasn't designed for.
- **Uncategorized in the donut** — "hatched, not coloured" (§6.10 item 4) implies a textured
  slice; an actual SVG hatch-pattern fill is real extra complexity for the one deliberately-
  uncoloured exception. Simplified: Uncategorized is excluded from the donut's slices entirely
  and only appears in the ranked list below, with a dashed-outline swatch instead of a filled dot
  — reusing the dashed-underline treatment `TransactionCard` already established for Uncategorized
  (V-4), not a new visual language.
- **`useUncategorizedCount(period)`'s own catalog listing is redundant.** `useCategoryBreakdown`'s
  `categoryId: null` row already carries the exact count "Fix N" needs. Built the repo overload
  anyway (symmetric with Home's unscoped call, cheap, may be useful later) but the screen doesn't
  call it a second time for the same number.

**Built this pass:**

- **`domain/period.ts` extended** — `mode`/`label` added to `Period`; `isoWeekPeriod`,
  `previousPeriod` (mode-aware, replacing the month-only `previousMonthPeriod`), `stepPeriod`
  ("next" a no-op once the next period would start in the future), `startOfLocalDay`/
  `endOfLocalDayExclusive`/`dayIndex`. The last three **consolidate a real pre-existing
  duplication**: `transactions.tsx` and `transactions.ts` (the repo) each had an identical private
  `localDayStart` — the repo copy's own comment already said "§27.3 period helper formalises this
  in step 5." Both now import `startOfLocalDay` from here.
- **`domain/analytics.ts` extended** — `buildDailySeries` (zero-filled, clamped to today),
  `meanDailySpend`/`medianDailySpend`, `dailyChartYMax` (p95-based outlier clamp, §26.6),
  `shareOf`, `resolveCategoryColor`. All pure — `CategoryPalette` itself (which imports
  `react-native` via `theme.ts`) is passed in as a plain parameter rather than imported, keeping
  this file free of RN/expo imports like every other domain file.
- **`db/repositories/analytics.ts` extended** — `useCategoryBreakdown`, `useLargestExpenses`,
  `useDailySeries` (raw rows + previous-period rows, feeding the domain math above; previous
  mean/median `null` when the previous period has zero expense rows, not when the *derived* mean
  happens to be zero — a cleaner signal than reusing `useMoMDeltas`' `previous === 0` convention),
  `useUncategorizedCount` gained an optional `period` param (unscoped when omitted, Home
  unaffected).
- **`stores/analytics-period.ts`** — `useAnalyticsPeriod` (mode + stepped anchor); see the
  module-load-time hazard above for why it doesn't read `getSetting` itself.
- **Five new components** (`src/features/analytics/`): `PeriodControl` (Month/Week segmented +
  `‹ label ›` stepper — the left chevron is the one `chevron-right` icon this app has, rotated
  180°, not a second icon), `BalanceArcCard` (the "This month" half-ring arc — the first real use
  of `d3-shape`'s `arc()`, which returns an SVG path `d` string directly when given no rendering
  context), `MeanMedianTile`, `CategoryBreakdown` (donut via `pie()`+`arc()`, ranked list),
  `DailyChart` (area+line via `d3-shape`'s `area()`/`line()` + `d3-scale`'s `scaleLinear`, dashed
  mean line, inline outlier labels), `BiggestExpenses` (reuses `TransactionCard` as-is).
- **`Skeleton` gained an `'analytics'` layout** (arc block + 2 tiles + 2 chart blocks + 3 rows).
- **`(tabs)/analytics.tsx` rebuilt** from the F6.5 stub — period control → arc card → mean/median
  tiles → category breakdown → daily chart → biggest expenses, with loading/error/empty-period
  states matching Home's established pattern (`key`-bump retry, not a threaded refetch call).

**Test-tier decision (§34.0):** the new SQL-layer hooks (`useCategoryBreakdown`,
`useLargestExpenses`, `useDailySeries`, the period-scoped `useUncategorizedCount`) aren't
directly unit tested — same established decision as `usePeriodSummary`/`useMoMDeltas`/
`useRunningBalance` before them (no in-memory-SQLite harness exists here; correctness rests on
matching §26.4/§26.5/§26.6's SQL as written). `useDailySeries`' own JS-side math (bucketing,
mean/median, outlier clamp) is fully covered directly in `domain/analytics.test.ts`; the screen's
own RNTL test verifies the wiring (loading/error/empty selection, props reaching each child,
mode-hydration) with every child component stubbed, since each already has its own thorough test.
SVG `<Text>` isn't queryable via RNTL's `getByText` (it doesn't traverse `Text`→`TSpan`
the way host `Text` does) — `DailyChart`'s outlier-label tests use a `testID` + `getAllByTestId`
instead, reading `.props.children.props.children` through the `TSpan` wrapper.

**Tests added**, `npm test` 337 → 402:
- `domain/period.test.ts` rewritten for the new API (18 cases, up from 4).
- `domain/analytics.test.ts` extended (22 cases, up from 5) — `buildDailySeries` zero-fill/
  clamping, mean vs. median under a rent-day spike, `dailyChartYMax`'s p95 clamp, `resolveCategoryColor`'s
  default-vs-custom-cycling.
- `period-control.test.tsx` (7), `mean-median-tile.test.tsx` (4), `balance-arc-card.test.tsx` (5,
  incl. IMP-037's negative-balance leading `−` and the zero-income no-NaN guard),
  `category-breakdown.test.tsx` (6, incl. the Fix-N navigation), `daily-chart.test.tsx` (5, incl.
  the outlier-label assertions), `biggest-expenses.test.tsx` (3), `(tabs)/analytics.test.tsx` (6
  — hydration, loading, error, empty, loaded, period-label wiring).

**Verified:** `npm run typecheck` clean, `npx eslint` clean, `npm test` 402/402, plus a full
`expo export --platform web` (still 18 static routes, `/analytics` and `/(tabs)/analytics`
included, unaffected bundle size). No on-device check yet — same standing gap as every recent
feature, but worth flagging harder here than usual: none of the SVG layout (arc geometry, donut
proportions, chart scaling) has been visually confirmed on a real screen, only reasoned through
and unit-tested for correctness of the underlying numbers — RNTL can't screenshot.

**Open follow-up (2026-09-03, unresolved) — empty-state layout fix not visually confirmed.**
User flagged on-device that the empty-period state ("Nothing recorded for September" +
**Add transaction**) rendered oddly — sitting right under the period control near the top, with a
large dead gap below. Fixed in source: `PeriodControl` now joins the `EmptyState` inside one
centered `flex:1` group (`analytics.tsx`'s `emptyWrap`) instead of sitting outside it — but this
fix has **not been confirmed working on-device**. Across several rounds (Fast Refresh reload,
full Metro restart, a full `expo run:android` native rebuild) the device kept showing the old,
pre-fix layout. Root-caused to Metro's on-disk file-map cache
(`%TEMP%\metro-file-map-expo-*`/`metro-cache`) not invalidating for this file — confirmed via
`adb logcat` (bundle loads succeeded, no error) and by diffing the actual bundle Metro served
against source (F8/F8.5/F9 strings were entirely absent from an `index.bundle` fetch, meaning
something was stale at the Metro layer, not just the device). Killed the stale Metro process and
deleted both cache directories — user reported the layout **still unchanged** after the next
rebuild, so the cache-clear did not fully resolve it either. Left unresolved at user's request to
move on; **owed:** re-verify the empty-state grouping on-device next time this screen is touched,
and if still stuck, try a clean `git clean`-safe reinstall (uninstall the app first, not just
`adb install -r`, in case Android's own APK-diffing is also involved) rather than another
Metro-side cache clear.

## F12 — Onboarding & permissions

**The last feature in §9's priority list.** Mostly wiring together things that already existed —
`useOnboarding` (Phase 2, unused until now), `PermissionCard` (built for Settings in F8.5, this
is its second intended consumer), and `deleteCategory`/`reorderCategories` (F6) — rather than new
infrastructure, unlike F9.

**A real routing collision, not just stale spec text this time:** §28.1's own route tree names
step 3 `(onboarding)/categories.tsx` — but `src/app/categories.tsx` already exists (F6, Category
management, reached from Settings). `(onboarding)` is a route *group* (adds no URL segment), so
both files would resolve to the same `/categories` path. Named it `category-review.tsx` instead —
same screen the spec describes, no clash.

**A second real correctness hazard caught before it shipped — the same class as F9's
`analytics-period` store, but at the *app root* this time, so the blast radius would have been
total.** The natural place for "first launch → redirect to onboarding" is a live check at the
root layout: `useSetting('onboardingDone')`, redirecting via `<Redirect>` while `!value`. But
`useLiveQuery`'s own `.web.ts` stub (§18.3) returns `updatedAt: undefined` **forever** on web — no
query ever resolves there by design. A shared root layout gating render on that would have left
the *entire* web build stuck rendering nothing, permanently, not just the individual DB-touching
screens §18.3 already scoped that risk to. Fixed the same way every other web-specific behaviour
in this app is fixed: `src/app/_layout.web.tsx`, a separate, simpler file with no onboarding
redirect at all — the existing per-screen `.web.tsx` → `AndroidOnlyNotice` split already handles
web correctly on its own.

**A design-text ambiguity, resolved by an existing precedent, not invented fresh:** §6.1 lists the
category-review step as showing "the 9 default categories" with checkboxes — but one of those 9
`kind:'default'` rows is **Other**, which is `isProtected:true`. "Deselect = delete" (§30.3's own
wording) can't apply to a category `deleteCategory` refuses to remove. Rather than invent a new
rule, followed the one `categories.tsx` (F6) already established: protected categories get no
delete affordance, silently, no lock icon, no explanation. This screen shows only the 8 real
default categories (`kind:'default' && !isProtected`); Other doesn't appear in the toggle list at
all, the same way it has no swipe-delete on the Categories management screen.

**One deliberate scope trim, documented on the file itself:** §6.1's opening line calls for an
abstract graphic on every step; `permissions.tsx` skips it — two full `PermissionCard`s plus
heading/Continue/Skip already fill a content-dense screen with no scroll container, and adding a
graphic risked overflow on shorter devices for no real gain on the one step that didn't need it.

**Built this pass:**

- **Three onboarding screens** (`src/app/(onboarding)/`, each + `.web.tsx` → `AndroidOnlyNotice`):
  `welcome.tsx` (static), `permissions.tsx` (two `PermissionCard`s, the exact `canAskAgain`
  branch `sms-notifications.tsx` established in F8.5 — this is IMP-042's second real
  implementation, not a new one), `category-review.tsx` (toggleable list → `deleteCategory` on
  Done, `setSetting('onboardingDone', true)`, explicit `router.replace('/')`).
- **`(onboarding)/_layout.tsx`** — a plain `<Stack>` shell, headerShown false, matching every
  other route group in this app.
- **Root redirect** — `src/features/app-shell/root-navigator.tsx` (`RootNavigator`), live
  `useSetting('onboardingDone')`-gated `<Redirect>` vs. `<Stack>`. Deliberately **not** inlined in
  `_layout.tsx` itself — that file's own import tree (`MigrationGate` → `@/db/client` →
  `SQLite.openDatabaseSync`) makes it untestable without mocking the whole provider stack; living
  as its own file in `features/app-shell/` (where `SheetHost`/`NotificationRouter` already live)
  keeps it unit-testable in isolation. `_layout.tsx` now just imports and renders it.
- **`src/app/_layout.web.tsx`** — the web-only root layout split described above.
- **Shared onboarding UI** (`src/features/onboarding/`): `OnboardingLayout` (back-button-optional
  shell + step dots + footer), `StepDots` (3-dot progress), `OnboardingGraphic` (hand-rolled
  `react-native-svg` abstract shapes — one composition per step, no commissioned illustration,
  per §6.1's own instruction).

**Test-tier decision (§34.0):** `OnboardingGraphic` has no test — pure decoration, no branching
logic, same "display-only, no coverage warranted" call this codebase already makes for similarly
decorative pieces. Everything else that has real logic (the three screens, `OnboardingLayout`,
`StepDots`, `RootNavigator`) is covered directly.

**Tests added**, `npm test` 402 → 430: `root-navigator.test.tsx` (4 — resolving/redirect/stack,
each branch), `step-dots.test.tsx` (3), `onboarding-layout.test.tsx` (4), `welcome.test.tsx` (3),
`permissions.test.tsx` (7, incl. the IMP-042 branch and the Skip-does-the-same-as-Continue
check), `category-review.test.tsx` (7, incl. the protected-categories-excluded assertion and the
full Done flow — delete toggled-off, setSetting, reset, replace nav).

**Verified:** `npm run typecheck` clean, `npx eslint` clean, `npm test` 430/430, plus a full
`expo export --platform web` (24 static routes now, up from 18 — the three onboarding screens
each register both their group-stripped and group-prefixed alias, same pattern `(tabs)` routes
already show; `/` unaffected at 30KB, confirming `_layout.web.tsx` correctly took over for web
without pulling the onboarding redirect's live query along with it). No on-device check yet —
same standing gap as every recent feature, and this one's the highest-stakes to skip: it's the
very first screen a fresh install shows, and the redirect logic itself (never used anywhere in
this app before) has only been exercised through a mocked `RootNavigator`, never against a real
migrated database on a real device.

---

**F1–F12 are now all built.** Every feature in `SPEC/PLAN.md` §9's priority list has a
`SPEC/traceability.md` entry. What's left before calling V1 done is the accumulated on-device
verification debt this file has been tracking pass over pass (F8.5, F9, and now F12 most
urgently — onboarding is the one every fresh install actually depends on), plus `SPEC/PLAN.md`
§11's final quality review pass across Product / UX / UI / Technical / Specification.
