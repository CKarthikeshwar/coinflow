# CoinFlow — Implementation Spec: Progress Log

Running log of work on the technical half of `SPEC-implementation.md`, phase by phase, per
`SPEC/IMPLEMENTATION-PLAN.md`. Newest entries at the top of each phase.

---

## Phase 1 — Foundations (stack, architecture, project structure)

**Status:** ✅ Done (2026-09-01)
**Produced:** `SPEC-implementation.md` §16 Technology stack · §17 System architecture · §18 Project
structure. Added a Contents/TOC block and decisions **D22–D25** to §1. Ticked Phase 1 in
`SPEC/IMPLEMENTATION-PLAN.md` §3.

### Decisions locked (now D22–D25 in `SPEC-implementation.md` §1)

| # | Decision |
|---|---|
| D22 | **Source layout: feature-first** — `src/features/*` over shared `src/ui` · `src/domain` (pure TS) · `src/db` · `src/services` · `src/stores`. `ui`/`domain`/`db` never import from `features`. |
| D23 | **SMS-while-killed: native manifest `BroadcastReceiver` → headless JS task.** All parsing / DB / notification in JS. `expo-background-task` rejected (15-min floor, dead when app killed). |
| D24 | **Notification `Save` while killed: all-JS headless notification-response task.** Native module surface stays "SMS receiver bridge only". |
| D25 | **Sheets = root-mounted `@gorhom` `SheetRegistry`, not `expo-router` modal routes; custom tab bar, not `NativeTabs`** (raised centre Add "FAB notch", greyscale pill; iOS is Future). |

### Stack pinned (see §16 for rationale + rejected alternatives)

- **Data:** `expo-sqlite ~57.0.2` · `drizzle-orm 0.45.2` · `drizzle-kit 0.31.10` (dev)
- **State:** `zustand 5.0.15` (ephemeral only); persisted prefs → a SQLite `app_setting` KV table
- **UI infra:** `@gorhom/bottom-sheet 5.2.14` · `@shopify/flash-list 2.0.2` · `react-native-svg 15.15.4` · `d3-shape 3.2.0` · `d3-scale 4.0.2`
- **Detection:** `modules/coinflow-sms` (in-repo Kotlin module) · `expo-notifications ~57.0.15` · `expo-task-manager ~57.0.14` · `expo-dev-client ~57.0.16` (dev) · `expo-build-properties ~57.0.15`
- **Utils / obs:** `date-fns 4.4.0` · `expo-crypto ~57.0.2` · `@sentry/react-native 8.24.0` (final pin in Phase 5)
- **Testing:** `jest-expo 57.0.5` · `@testing-library/react-native 14.0.1` · Maestro (external)
- **Rejected:** `expo-background-task` (interval floor + dies on kill), NativeWind/Tamagui, TanStack Query, Redux/Jotai, WatermelonDB, Victory/Skia, Luxon, Detox, `react-native-mmkv`

### Risks flagged for install-time re-verification (§16.7)

- `@gorhom/bottom-sheet@5` vs `react-native-reanimated@4.5.1` + worklets on new arch
- `@shopify/flash-list@2.0.2` vs React 19.2 (recycling smoke test on 2,000 rows)
- Drizzle `useLiveQuery` over `expo-sqlite` change listeners on SDK 57
- FTS5 presence in the `expo-sqlite` build (search) — fallback `LIKE`; **decided in Phase 2**

### Carried into later phases

Migration-pending behaviour in a headless task, FTS5 vs `LIKE` → **Phase 2 (§20)**. Permission-request
mechanism, Reduce-Motion plumbing, `SheetRegistry` API, deep-link URL shapes, `theme.ts` rewrite,
component contracts, per-screen wiring → **Phase 4 (§28–§30)**. Notification channel/category IDs,
final crash SDK + default + `beforeSend` scrub, the D18 contingency hybrid (documented, not built) →
**Phase 5 (§31, §33)**.

### Log

- **2026-09-01** — Started Phase 1. Read the frozen inputs it depends on: `SPEC/IMPLEMENTATION-PLAN.md`
  (Phase 1 section + Phase 0 decisions D14–D21), `SPEC-implementation.md` §1–§15, `SPEC-UI-UX.md`
  §3 (design system) / §4 (navigation) / §6 (screens) / §8 (resolved decisions), `SPEC/PLAN.md`,
  `SPEC/idea.md`, and the repo's `package.json` / `app.json` / `tsconfig.json` / `eas.json` /
  current `src/` tree.
- **2026-09-01** — Researched the v57 background-execution story (per `AGENTS.md`): `expo-background-task`
  (WorkManager) has a **15-minute minimum interval** and **does not run when the app is killed** —
  unusable for the SMS core loop. Confirms D18's direction: a manifest-registered native
  `BroadcastReceiver` is the wake trigger, headless JS does the work.
- **2026-09-01** — Resolved the three Phase 1 open sub-questions with the user (see decisions below).
