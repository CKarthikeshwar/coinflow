# CoinFlow — Development Plan

> Define UX → generate UI in code → critique with Impeccable → improve → validate in browser → convert to mobile (Expo/React Native)

This is the single working plan for how CoinFlow gets designed and built. It replaces the earlier separate `PLAN.md` (generic spec-driven process) and `workflow.md` (the Claude Design / Impeccable / web-prototype-first workflow) — the concrete workflow below **is** the process; the surrounding sections give it structure, artifacts, and a verification loop.

---

## 0. Where we are right now

Read this section first — it's the actual state of the project, not aspiration.
**As of 2026-09-01: all design and specification work is complete. Both specs are frozen.
The next real work is feature implementation (§9).**

| Artifact | Status |
|---|---|
| `SPEC/idea.md` | **Done.** Product scope, target users, V1 / V1.5 feature sets, core principles. Settled unless the user changes it. |
| `design-references/` | **Done.** 8 visual references collected (`1.png`–`5.png`, `analytics.png`, `screen1.png`, `screen2.png`). |
| `design-prototype/` | **Done.** `01-midnight/` — the coded web prototype (dark, black-and-white; Manrope + Geist; Lucide): `screens.html`, `p0-screens.html`, `p1-screens.html`, `motion.html`. Critiqued with the Impeccable skill; the design system in `SPEC-UI-UX.md` §3 is extracted from it (§5–§6). |
| `SPEC-UI-UX.md` (repo root) | **Frozen (v1).** Screen inventory + priority (§1), visual direction (§2), design system (§3, all subsections frozen), navigation (§4), global rules (§5), per-screen specs (§6), visual acceptance `UI-0xx` (§7), resolved decisions (§8), post-freeze change log (§9 — CR-1). |
| `SPEC-implementation.md` (repo root) | **Frozen (v1).** Part I §1–§15 (product / behavior, `IMP-0xx`, decisions D1–D17). Part II §16–§37 (technical: stack §16, architecture §17, project structure §18, data models §19, persistence §20, data-access §21, app state §22, SMS parsing §23, normalization §24, categorization §25, analytics §26, formatting/undo §27, navigation §28, components + `theme.ts` §29, screen specs §30, notifications §31, error handling §32, security §33, testing §34, build & release §35, freeze §36, change log §37; decisions D18–D35). |
| `SPEC/IMPLEMENTATION-PLAN.md` + `SPEC/IMPLEMENTATION-PROGRESS.md` | **Done.** The meta-plan that produced Part II of `SPEC-implementation.md`. Phases 0–5 all complete; progress log kept per phase. |
| Expo app (`src/app`, `src/components`) | **In progress.** Scaffolding (deps, persistence, `theme.ts`, the native SMS module) is done. Features built per `SPEC/traceability.md`: **F1, F2, F11, F3, F4, F5, F6** — with an F2–F5 deferral-closing pass (2026-09-03) and a test-tier audit the same day. Template `explore.tsx` / "Welcome to Expo" home are gone. Remaining: **F6.5, F7, F8, F8.5, F9, F12** (§12 step 5). |

**Conclusion:** Discovery, design, prototyping, and both specs are done and frozen (`SPEC-implementation.md`
amended post-freeze per its §37 change log — CR-1..CR-4 — under the §10 protocol below; still v1).
Feature implementation (§9) is underway, one feature at a time against the frozen specs. The
design/implementation boundary in §1.2 is **lifted**: work under `src/app` is expected. Post-freeze
spec changes follow §10 (`SPEC-UI-UX.md` §9 / `SPEC-implementation.md` §37 change logs).

---

## 1. Core development philosophy

CoinFlow is built spec-driven, with a strict separation between *deciding* the product/design and *implementing* it.

Three artifacts stay authoritative through the whole project:

1. **`SPEC/idea.md`** — what CoinFlow is: problem, users, value proposition, features, non-goals. Already written.
2. **`SPEC-UI-UX.md`** — how the user interacts with it: information architecture, user journeys, screens, states, edge cases, design system, UX acceptance criteria.
3. **`SPEC-implementation.md`** — how it's technically built: architecture, data models, state management, navigation, business logic, error handling, security, testing.

```
idea.md  (product)
    ↓
SPEC-UI-UX.md   (design + UX)
    ↓
SPEC-implementation.md  (technical)
    ↓
Implementation
    ↓
Verification
    ↓
Final product
```

Claude must not make important product, UX, or architectural decisions implicitly when they should instead be written into one of these three documents. If a requirement is ambiguous or contradictory, stop and ask instead of silently guessing.

### 1.1 Project structure

```
coinflow/
├── SPEC/
│   ├── idea.md                # product spec (done)
│   └── PLAN.md                # this file
├── SPEC-UI-UX.md               # UX + design source of truth (to be written)
├── SPEC-implementation.md      # technical source of truth (to be written)
├── design-references/          # inspiration, organized by area
├── design-prototype/           # coded visual prototypes (web), throwaway-safe
├── src/app/                    # actual Expo Router application
├── src/components/
└── ...
```

### 1.2 Design/implementation boundary

While in the design phase (§2–§6), do **not** modify `src/app` or other production application code unless explicitly instructed. All experimentation happens in `design-prototype/`, built as plain coded web pages so it can be opened in a browser and iterated on quickly, without risking the real app. Only after a flow is validated (§6) does it get translated into the actual Expo/React Native implementation (§9).

---

## 2. Information architecture + screen/state inventory

Do this before any visual design. No colors, no typography yet.

### 2.1 Confirm the app's major areas

Derived from `SPEC/idea.md`:

```
CoinFlow
│
├── Home                      (balance / recent activity / quick add)
├── Transaction Confirmation  (from SMS-detected notification)
├── Add Transaction           (manual entry)
├── Transactions              (full list, search, filter)
│   └── Transaction Details / Edit
├── Analytics                 (spending summary, insights, by category/period)
├── Categories                (manage/customize)
└── Settings / Profile
```

Confirm what's a full page vs. a modal vs. a bottom sheet (e.g., "Add Transaction" and "Transaction Confirmation" are almost certainly sheets, not full navigations).

### 2.2 Build the screen/state inventory

This is the design brief input for Claude Design — do not skip it. For every screen in the map above, write:

```
Screen
Purpose
User can...
Inputs
Actions
Navigation (entry points / exit points)
States: empty, loading, error, success, partial data, boundary values
```

Priority order for V1 (matches `idea.md`'s core loop of detect → review → confirm → done):

1. Home
2. Transaction Confirmation (SMS-detected)
3. Add Transaction (manual)
4. Transactions list + Transaction Details
5. Analytics / Spending Summary
6. Categories management
7. Settings

V1.5 (split expenses/settlements) screens come later — don't design them yet; note them in the inventory as "Future" so they aren't forgotten, per the non-goals discipline in `idea.md`.

Keep the earlier discipline for every screen: also record its **edge cases** — boundary values (₹0, very large amounts, long merchant names, thousands of transactions), duplicate/outdated data, network failure mid-action, and the "not every transaction is an expense" distinction called out as a core principle in `idea.md`.

---

## 3. Visual direction (before generating anything)

Decide, and write down:

- **Product personality** — e.g. minimal, fast, friendly, low-friction (not "premium banking app"; CoinFlow's whole point is effortlessness, so the UI should feel light and quick, not dense with financial chrome).
- **Visual references** — collect inspiration into `design-references/`, organized by area:

  ```
  design-references/
  ├── home/
  ├── transactions/
  ├── analytics/
  ├── navigation/
  ├── components/
  └── miscellaneous/
  ```

  These don't need to be finance apps — pull typography from one source, cards from another, chart style from a third. Build a design *vocabulary*, not a clone of one app. For each reference worth keeping, note: what's good, what's not, what pattern it demonstrates, and whether it fits CoinFlow.

- **Design brief** — once direction feels stable, write a short brief (product, target user, personality, design principles, typography direction, color direction, navigation shape, core screens, key interactions, things to avoid). This becomes the standing context handed to Claude Design instead of re-explaining the app every time.

---

## 4. Generate the first prototype

Use `design-prototype/` and the **Impeccable** skill/agent for this stage.

- **Don't generate the whole app at once.** Start with one important flow — the core loop from `idea.md`:

  ```
  Home → Transaction notification → Confirm/Review transaction → Done
  ```

  This flow exercises the most important interaction in the product (fast confirmation) and will surface the visual language decisions (cards, typography, spacing, motion) that every later screen depends on.

- Build it as real, interactive coded web pages (HTML/CSS or a lightweight React setup inside `design-prototype/`) — not static frames — so it can actually be clicked through in a browser.

---

## 5. Critique, refine, extract the design system

Loop: **Generate → Critique → Refine → Test → Repeat.**

- Use Impeccable as a design QA/refinement pass on the first prototype, not as the first step. Ask it to evaluate:
  - **Hierarchy** — is the most important info (balance, amount) visually dominant?
  - **Spacing** — inconsistent spacing/alignment?
  - **Typography** — is the type scale doing real hierarchy work?
  - **Accessibility** — contrast, touch target size, color-only signaling?
  - **Consistency** — do components share visual rules?
  - **UX** — unnecessary steps or confusing navigation?
- Claude generates, the user judges, Impeccable critiques/refines, Claude implements the changes. Iterate until the core flow feels right.
- Once 3–5 screens/states look good, **extract the design system from what was actually built** (don't design it abstractly beforehand): typography scale (display/heading/subheading/body/caption), colors (background/surface/primary/secondary/text/muted/success/warning/error/chart colors), spacing scale, radii, and the reusable component list (button, card, input, transaction row, balance card, chart, nav, modal/sheet, toast, badge, tabs, filter). Write this into the design-system section of `SPEC-UI-UX.md` once captured (§7).
- From this point, new screens are requested as "build screen X using the existing CoinFlow design system" rather than open-ended generation — this is what makes the remaining screens fast and consistent.

---

## 6. Build out remaining screens, then test

- Work through the screen/state inventory (§2.2) in priority order, each one built against the now-established design system.
- Test each flow in the browser prototype directly, not just by looking at it:
  - Can I figure out what to do?
  - Can I complete the task quickly (esp. the confirm-transaction flow — this is CoinFlow's whole value prop)?
  - Are primary actions obvious?
  - Does navigation make sense?
  - Do empty/loading/error states make sense in context, not just in isolation?
- **Responsive testing matters here even though CoinFlow ships as a mobile app**, because the prototype is a desktop-capable web page. Don't just shrink the desktop layout — mobile often needs a different composition entirely (e.g., a desktop side-nav becomes a bottom tab bar, not a squeezed sidebar). The web prototype is a UX/interaction proving ground, not a pixel-accurate final mobile layout.

---

## 7. Write and freeze `SPEC-UI-UX.md`

Once product scope is clear, journeys are understood, screens are designed, states/edge cases are considered, the design system is established, and the prototype is approved — write the formal spec. Structure:

```
1. Product Definition (problem, target users, value proposition, goals, non-goals — pull from idea.md)
2. Feature Specification (per feature: purpose, user, priority, entry point, flow, outcome, dependencies, edge cases)
3. Information Architecture (nav hierarchy, screen relationships — from §2.1)
4. User Journeys (every major journey, entry → exit, success/failure states)
5. Design System (colors, typography, spacing, shapes, components, interaction principles — from §5)
6. Screen Specifications (per screen: purpose, users, entry/exit points, primary/secondary actions, layout, components, content, navigation, interactions, states, edge cases, accessibility, acceptance criteria)
7. Global UX Rules (e.g. destructive actions require confirmation; loading states never leave a blank screen; errors explain what happened and what to do; monetary values format consistently)
8. UX Acceptance Criteria — objectively verifiable, not "looks good". E.g.:
   "An empty transaction history displays an empty state with a clear action to add a transaction."
   "Submitting an invalid transaction does not create a transaction and provides actionable validation feedback."
```

Add a verification checklist with IDs so an agent can check conformance later:

```
UI-001  Home displays the current balance.        Verification: run app, inspect Home. Status: Pending
UI-002  Home contains a primary "add transaction" action.
UI-003  Navigation contains exactly the defined destinations.
UI-004  Empty transaction list shows an empty state with a call to action.
UI-005  Loading state exists for Home and Transactions.
UI-006  Error state exists and is actionable.
...
```

**Freeze the spec** once all of the above holds. After freezing: any product/UX change updates `SPEC-UI-UX.md` first, then the implementation — never the other way around (see §10).

---

## 8. Technical design + `SPEC-implementation.md`

Switch from "what should it do" to "how do we build it." Decide (informed by `AGENTS.md`: **Expo has changed — read the versioned v57 docs before writing code**, since the app already targets `expo` `~57.0.18` / RN `0.86.3` / React 19 / expo-router):

- Navigation: `expo-router` (already the app's `main` entry) — map §7's IA to actual routes/groups.
- State management, local persistence (transactions, categories need to survive restarts — likely on-device storage, no backend for V1 given `idea.md`'s scope).
- SMS detection: platform constraints matter a lot here (Android SMS reading vs. iOS's much tighter restrictions) — this needs an explicit decision and fallback design (manual entry is already the fallback per `idea.md` §4), not an implicit assumption.
- Data models: at minimum `Transaction` (amount, direction, category, payment method, merchant, timestamp, type — expense/income/transfer/reimbursement/refund per the "not every transaction is spending" principle), `Category`, and whatever a parsed-but-unconfirmed SMS suggestion needs.
- Notifications: local notification triggered on SMS detection.
- Testing strategy: unit tests for business logic (categorization, split-expense math, SMS parsing), integration tests across modules, a few UI tests for the core confirm-transaction journey, manual visual comparison against the approved prototype.
- Security: SMS content and transaction data are sensitive — define storage, no unnecessary logging of financial data, no unnecessary network transmission.

Then write `SPEC-implementation.md` with sections: Technology Stack, Architecture, Project Structure, Data Models, Application State, Navigation, Components, Business Logic, Error Handling, Security, Testing Strategy. Do not let technical convenience silently change product behavior decided in `SPEC-UI-UX.md` — if it conflicts, that's a spec change (§10), not a quiet workaround.

---

## 9. Implementation with Claude Code

Once both specs exist:

1. Give Claude Code access to `SPEC/idea.md`, `SPEC-UI-UX.md`, and `SPEC-implementation.md` as the source of truth. Don't invent product behavior that conflicts with the UX spec, or architecture that conflicts with the implementation spec. Ambiguity → stop and ask.
2. Implement **incrementally, one feature at a time** — never "build the entire app." For each feature: read the relevant spec section → implement → write the tests §9.1 calls for → run tests → run the app → compare against the approved prototype → verify acceptance criteria against §9.1's bar → fix issues → mark the requirement complete. A feature isn't done because it compiles, and it isn't done because a human clicked through it once either.
3. Maintain traceability: `UI-00x` (UX requirement) → `IMP-00x` (implementation requirement) → component/service → test. This keeps requirements from silently disappearing during implementation.

### 9.1 Definition of done (per feature) — no speed-running past this

Feature velocity does not substitute for completeness. Writing the test, covering the edge case,
or wiring the real entry point **is** part of implementing the feature — not a follow-up to get to
later. Before a feature's `SPEC/traceability.md` rows can show `Pass`, all of the following hold —
or the gap is named as an explicit, bounded deferral (point 3), never silently skipped because the
next feature was more interesting:

1. **Behavior matches spec.** Every `IMP-0xx` criterion in the feature's `SPEC-implementation.md`
   section is implemented as written, or the deviation is logged as a **simplification**
   (still spec-compliant in outcome, with the "why" written down) — not a silent shortcut.
2. **Tests at the tiers `SPEC-implementation.md` §34 defines, written as part of this pass, not
   left "owed":**
   - Unit tests for any new pure logic (`src/domain`, business-logic branches in repos/services) —
     §34.1.
   - An RNTL test for every new screen/sheet/major component this feature adds or materially
     changes, covering at minimum the primary interaction and the states §34.2 lists for it
     (skeleton/empty/error where applicable, validation, discard-guard). "No RNTL test of the
     screen itself" is not an acceptable steady state for a feature marked done.
   - A Maestro flow is **not** required per feature — a J-flow usually spans several features — but
     the moment the *last* feature in a J-flow's dependency chain lands, that flow's `.yaml` is
     written before that feature is marked done, not deferred again.
3. **Deferrals are explicit and bounded, never vague.** If something genuinely can't be finished in
   this feature's pass — normally because it depends on a feature not built yet — say so precisely
   in the traceability row / section note: what's deferred, the actual blocking dependency (not
   "ran out of time"), and the trigger that closes it ("becomes required when F8 lands," not "not
   yet built" with nothing else). A deferral with no trigger is scope silently dropped — don't
   write one; either fix it now or name what unblocks it.
4. **Manual on-device findings get automated before the feature is marked done**, wherever the bug
   is reproducible outside real SMS/OS timing (i.e. anything that isn't a genuine device/OS-only
   concern — see §34.5's "not automated in V1" list for what legitimately stays manual). A bug
   found by clicking through the app gets a regression test in the same pass that fixes it, not a
   note that it was fixed once.

This is the concrete bar `status: Partial` in `SPEC/traceability.md` is checked against — see its
header. "Run tests" in step 2 above means: write what this feature's own scope calls for per this
section, then run it — not just re-run whatever already happened to exist.

---

## 10. Spec change protocol

The specs stay ahead of the implementation, always. When a new idea comes up mid-build:

```
New idea → Is it actually required for V1?
    Yes → Update the relevant spec → Update implementation → Verify
    No  → Log it under Future/Backlog in idea.md, don't build it now
```

Never let the implementation quietly diverge from `SPEC-UI-UX.md` or `SPEC-implementation.md`. If the built thing differs from spec on purpose, decide why, update the spec, then adjust the code to match — spec and code should never silently disagree about what's true.

---

## 11. Final quality review (before calling V1 done)

**Product** — target audience clear · problem clear · value prop clear · features justified · non-goals documented.

**UX** — every major journey defined · navigation coherent · primary actions obvious · empty/loading/error states exist · edge cases handled · accessibility considered.

**UI** — design system consistent · all major screens have prototypes · components/typography/spacing/color consistent · prototype approved.

**Technical** — architecture matches `SPEC-implementation.md` · data models defined · business logic tested · core journeys tested · error handling exists · security addressed.

**Specification** — `SPEC-UI-UX.md` and `SPEC-implementation.md` complete · requirements have IDs and verification methods · implementation traces back to requirements · specs reflect the actual shipped product.

---

## 12. Next actions (do these now, in order)

Steps 1–7 of this plan (discovery → design → prototype → freeze both specs) are **done** (§0).
Implementation (§9) is the current track. Do these in order:

1. **Scaffolding pass.** ✅ Done. `npx expo install` every dependency pinned in
   `SPEC-implementation.md` §16, re-verified against SDK 57 (§16.7); test runner configured
   (`jest-expo` + `@testing-library/react-native`); `app.json` changes applied (§35.1).
2. **Theme + template teardown.** ✅ Done. `src/constants/theme.ts` (§29.1) + `<AppBackground>` +
   `src/ui/icon.tsx` built; `ThemedText` / `ThemedView` moved to `src/ui/`; template `explore.tsx`
   and the "Welcome to Expo" home deleted (§18.4).
3. **Persistence.** ✅ Done. Drizzle schema (§19), migrations + `<MigrationGate>` + the idempotent
   seed (§20), the repository layer (§21), the Zustand stores (§22).
4. **Native SMS pipeline.** ✅ Done. `modules/coinflow-sms` (Kotlin receiver + headless task host)
   + its config plugin (§17.6) built; local dev now requires `expo run:android` / a dev-client
   build (Expo Go no longer runs the app).
5. **Features, one at a time, in priority order** (§9). P0: F1 detection → F2 notification →
   F11 review queue → F3 confirmation → F4 manual add → F5 list — all **done**
   (`SPEC/traceability.md`). Then, current order: **F6** (done) → **F6.5 app shell & Home** (P0,
   **next** — added `SPEC-implementation.md` CR-4, 2026-09-03: the `(tabs)` shell + the real Home
   screen had no owning feature until then) → F7 → F8 → **F8.5 Settings** (added, same CR) → F9 →
   F12. For each:
   read the spec section → implement → write the tests §9.1 calls for → run tests → run the app →
   compare against `design-prototype/01-midnight/` → verify its `IMP-0xx` + `UI-0xx` against §9.1's
   definition of done → mark done. Keep a `SPEC/traceability.md` grid (`UI-0xx → IMP-0xx →
   component → test`, per §34.4) current as you go — including a periodic pass back over already
   "done" features to close out any deferral whose trigger condition has since been met (e.g. a
   feature that unblocks a notification deep link, or completes a Maestro flow's dependency chain).
6. **Pre-release.** The §11 final quality review; the D18 ~2-week field test on real OEM
   battery-killer devices (dropped-event rate + cold-start latency — decides whether the §17.7
   native-notification contingency gets built); the `SPEC-implementation.md` §35.7 checklist.
7. **Ship.** Signed `production` APK via EAS internal distribution / direct install (D20) — no
   Play Store.

Any product/UX/architecture change that surfaces mid-build is a change-request (§10): update the
relevant frozen spec (+ its change log) first, then the code.
