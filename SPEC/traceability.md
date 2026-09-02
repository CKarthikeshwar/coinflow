# CoinFlow — Traceability matrix

`UI-0xx → IMP-0xx → component/service → test`, per `SPEC-implementation.md` §34.4. Maintained
incrementally as each feature (`SPEC/PLAN.md` §9) lands — rows are added when a feature starts,
`status` flips to Pass when its tests are green.

Row shape: `IMP-0xx | criterion | UI-0xx | component/service | test kind | test id / file | status`.

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
