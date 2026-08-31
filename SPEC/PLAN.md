# CoinFlow — Development Plan

> Define UX → generate UI in code → critique with Impeccable → improve → validate in browser → convert to mobile (Expo/React Native)

This is the single working plan for how CoinFlow gets designed and built. It replaces the earlier separate `PLAN.md` (generic spec-driven process) and `workflow.md` (the Claude Design / Impeccable / web-prototype-first workflow) — the concrete workflow below **is** the process; the surrounding sections give it structure, artifacts, and a verification loop.

---

## 0. Where we are right now

Read this section first — it's the actual state of the project, not aspiration.

| Artifact | Status |
|---|---|
| `SPEC/idea.md` | **Done.** Product scope, target users, V1 and V1.5 feature sets, and core product principles are already defined. Treat it as settled unless the user changes it. |
| `SPEC-UI-UX.md` (repo root) | Empty. This is the formal UI/UX spec — written *after* mockups stabilize (see §7). |
| `SPEC-implementation.md` (repo root) | Empty. Written *after* the UI/UX spec is frozen (see §8). |
| `design-references/` | Empty. Visual reference collection hasn't started. |
| `design-prototype/` | Empty. No web prototype screens built yet. |
| Expo app (`src/app`, `src/components`) | Freshly scaffolded from the default `expo-router` template (`index.tsx`, `explore.tsx`, tab navigation). No CoinFlow-specific screens exist yet. |

**Conclusion:** Product discovery is done. Nothing else is. The next real work is Information Architecture + the screen/state inventory (§2), then visual direction and a first coded prototype (§3–§4). Do not start writing React Native screens under `src/app` yet — prototype in `design-prototype/` first, per the design/implementation boundary in §1.2.

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
2. Implement **incrementally, one feature at a time** — never "build the entire app." For each feature: read the relevant spec section → implement → run tests → run the app → compare against the approved prototype → verify acceptance criteria → fix issues → mark the requirement complete. A feature isn't done because it compiles.
3. Maintain traceability: `UI-00x` (UX requirement) → `IMP-00x` (implementation requirement) → component/service → test. This keeps requirements from silently disappearing during implementation.

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

1. Write the §2.2 screen/state inventory for the seven V1 screens listed above, in `SPEC/` (new file, e.g. `SPEC/screens.md`, or as a section appended here later once it stabilizes).
2. Collect a handful of visual references into `design-references/` and settle §3's design brief (personality, typography direction, color direction).
3. Build the Home → Transaction Confirmation flow as a coded prototype in `design-prototype/`, using the Impeccable skill for critique once a first pass exists.
4. Only after that flow feels right: extract the design system, then work through the remaining screens in priority order.
5. Do not touch `src/app` for real feature work until §6–§7 are done and `SPEC-UI-UX.md` is frozen.
