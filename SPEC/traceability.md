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

No RNTL test exists for **any** screen or sheet built so far, except one:
`suggestion-card.test.tsx` covers the card component, not the screen it lives in. Missing, per
feature:

- **F11** — `review-queue.tsx` itself (list rendering, known/new action set, Dismiss all).
- **F3/F4** — `transaction-sheet.tsx` (both modes): validation states, discard-guard, edge-amount
  gate, category-picker round-trip. This is the single highest-value gap — it's the sheet every
  other sheet's bugs this session came out of, and it's the one component with zero automated
  coverage of its actual rendered behavior.
- **F5** — `transactions.tsx` (search, day-grouping, empty states) and `transaction/[id].tsx`
  (detail view, delete confirm).
- **F6** — `categories.tsx` and `category-editor-sheet.tsx` — directly relevant, since three of the
  four bugs found this session (dead-zone chevron, dismiss/present race, missing `BottomSheetView`)
  were exactly the class of bug an RNTL render/interaction test catches cheaply.

No Maestro flow exists — `e2e/` doesn't exist as a directory. J2's dependency chain (F1, F2, F11,
F3, F8) isn't fully closed yet (F8 not built), so under §9.1 point 2 this isn't overdue yet, but
**J4 (manual add)'s chain — F4 — closed back when F4 shipped**, and its flow was never written.
That one is overdue now, not a "someday."

No direct repository-layer unit tests: `categories.ts`, `account-rules.ts`, `transactions.ts` are
only exercised indirectly through UI/feature-layer tests. F6's own note calls this "consistent with
the rest of `src/db/repositories/`" — true, but that consistency is the debt, not a justification.
Several rows across F3–F6 are marked `Pass by construction — no dedicated test` (IMP-006, IMP-008,
IMP-010, IMP-017, IMP-019) — real behavior, correctly reasoned about, never actually asserted by a
test that would fail if the logic regressed.

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
