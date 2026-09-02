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

**Not yet built (F1 scope ends here; carried to F2/F11):** §17.3 steps 6–8 — account-rule lookup,
notification post (single vs. group summary), self-heal for a killed mid-run. TODO markers left
in `src/services/tasks/sms-ingest.ts` and `src/services/tasks/index.ts`.

**Manual verification still owed** (not automated — Jest mocks the DB layer, no `expo-sqlite`
instance): confirm on-device via the dev-client build that a real incoming SMS from a known
sender actually lands a row in the `suggestion` table, and that this survives the app being
killed (the native → headless-JS wake path). Do this before marking F1 fully done, per
`SPEC/PLAN.md` §9.2 ("implement → run tests → **run the app** → …").
