# CoinFlow — Development Plan

> Define UX → generate UI in code → critique with Impeccable → improve → validate in browser → convert to mobile (Expo/React Native)

**Plain-English, before you read anything else:** "UX" means User Experience — how it feels for a person to actually use the app (is it clear what to tap, does it feel fast, is it confusing). "UI" means User Interface — the actual visual screen: colors, buttons, layout. "Impeccable" is the name of a design-review tool/skill used in this project to critique screens for visual and usability problems. "Expo" and "React Native" are the software frameworks CoinFlow's mobile app is built with (React Native lets you write one codebase that runs as a real Android/iOS app; Expo is a set of tools built on top of React Native that makes building, running, and shipping that app easier). So the one-line summary above means: "Figure out how the app should behave and feel → build the actual screens as real code → have a design-critique tool point out problems → fix them → check that it works by clicking through it in a web browser → then turn that browser version into the real mobile app."

This is the single working plan for how CoinFlow gets designed and built. It replaces the earlier separate `PLAN.md` (generic spec-driven process — "spec-driven" means: write down what you're going to build and why, in a document, *before* writing code, and treat that document as the source of truth) and `workflow.md` (the Claude Design / Impeccable / web-prototype-first workflow — a "prototype" here is a rough, quick, throwaway version of a screen built just to test ideas, not the final polished product) — the concrete workflow below **is** the process; the surrounding sections give it structure, artifacts (an "artifact" in this plan just means "a concrete file or document produced along the way," e.g. a spec file, a prototype, a screenshot — not the final app itself), and a verification loop (a repeating cycle of building something, checking it against a requirement, and fixing it before moving on).

---

## 0. Where we are right now

Read this section first — it's the actual state of the project, not aspiration.
**As of 2026-09-01: all design and specification work is complete. Both specs are frozen.
The next real work is feature implementation (§9).**

**Plain-English — "frozen" spec:** a spec (short for "specification" — a written document describing exactly what should be built and how) is "frozen" once it's considered finished and stable. After that point nobody is supposed to casually edit it; any change has to go through the formal change-request process in §10, with the change logged (see the "CR-#" and "change log" mentions in the table below) rather than silently edited in place. Freezing a spec is what lets other documents and other people safely rely on its section numbers and IDs never shifting under them.

| Artifact | Status |
|---|---|
| `SPEC/idea.md` | **Done.** Product scope, target users, V1 / V1.5 feature sets, core principles. Settled unless the user changes it. |
| `design-references/` | **Done.** 8 visual references collected (`1.png`–`5.png`, `analytics.png`, `screen1.png`, `screen2.png`). |
| `design-prototype/` | **Done.** `01-midnight/` — the coded web prototype (dark, black-and-white; Manrope + Geist; Lucide): `screens.html`, `p0-screens.html`, `p1-screens.html`, `motion.html`. Critiqued with the Impeccable skill; the design system in `SPEC-UI-UX.md` §3 is extracted from it (§5–§6). |
| `SPEC/SPEC-UI-UX.md` | **Frozen (v1).** Screen inventory + priority (§1), visual direction (§2), design system (§3, all subsections frozen), navigation (§4), global rules (§5), per-screen specs (§6), visual acceptance `UI-0xx` (§7), resolved decisions (§8), post-freeze change log (§9 — CR-1). |
| `SPEC/SPEC-implementation.md` | **Frozen (v1).** Part I §1–§15 (product / behavior, `IMP-0xx`, decisions D1–D17). Part II §16–§37 (technical: stack §16, architecture §17, project structure §18, data models §19, persistence §20, data-access §21, app state §22, SMS parsing §23, normalization §24, categorization §25, analytics §26, formatting/undo §27, navigation §28, components + `theme.ts` §29, screen specs §30, notifications §31, error handling §32, security §33, testing §34, build & release §35, freeze §36, change log §37; decisions D18–D35). |
| `SPEC/IMPLEMENTATION-PLAN.md` + `SPEC/IMPLEMENTATION-PROGRESS.md` | **Done.** The meta-plan (a "plan for making the plan" — the working document that was used to produce the technical spec itself) that produced Part II of `SPEC-implementation.md`. Phases 0–5 all complete; progress log kept per phase. |
| Expo app (`src/app`, `src/components`) | **Feature-complete (F1–F12 all built).** Scaffolding ("scaffolding" = the basic skeleton/setup work — installing dependencies, wiring up storage, etc. — done before any real feature can be built on top of it) (deps, persistence, `theme.ts`, the native SMS module) is done. Every feature in `SPEC/traceability.md`'s priority list is built: **F1, F2, F11, F3, F4, F5, F6, F6.5, F7, F8, F8.5, F9, F12** — with an F2–F5 deferral-closing pass (2026-09-03), a test-tier audit the same day, F6.5/F7/F8 verified on-device 2026-09-03. Template `explore.tsx` / "Welcome to Expo" home are gone. Remaining before V1 is done: the accumulated on-device verification debt (**F8.5, F9, F12** all still owe theirs — F12 most urgently, it's onboarding, the very first thing a fresh install shows) and `SPEC/PLAN.md` §11's final quality review pass. |

> **Plain-English — the ID system used throughout this and the other SPEC files:** these short codes are how different documents refer to the exact same requirement or decision without retyping it. `UI-0xx` = a numbered UX/visual requirement defined in `SPEC-UI-UX.md`. `IMP-0xx` = a numbered technical/behavioral requirement defined in `SPEC-implementation.md`. `D#` (e.g. `D14`) = a numbered "locked decision" — a specific technical or product choice that was deliberately made and is not meant to be silently revisited. `F#` (e.g. `F6`, `F6.5`) = a numbered feature, tracked in `SPEC/traceability.md` (the "traceability matrix" — a table that lines up each requirement with the code and test that satisfies it, so nothing gets silently dropped). `CR-#` = a "change request" — a logged, deliberate change made to an already-frozen spec, recorded in that spec's own change log section rather than just quietly edited in. `§` followed by a number means "section number" in whichever document is being discussed. These IDs and section numbers must never be renumbered or reused for something else, because other documents (and other people) refer back to them by that exact code.

**Conclusion:** Discovery, design, prototyping, and both specs are done and frozen (`SPEC-implementation.md`
amended post-freeze per its §37 change log — CR-1..CR-4 — under the §10 protocol below; still v1).
Feature implementation (§9) is underway, one feature at a time against the frozen specs. The
design/implementation boundary in §1.2 is **lifted** (meaning: that restriction no longer applies): work under `src/app` is expected. Post-freeze
spec changes follow §10 (`SPEC-UI-UX.md` §9 / `SPEC-implementation.md` §37 change logs).

---

## 1. Core development philosophy

CoinFlow is built spec-driven, with a strict separation between *deciding* the product/design and *implementing* it (i.e., first figure out and write down what the app should be and how it should work, and only afterward start writing the actual application code).

Three artifacts stay authoritative (meaning: treated as the final, trusted word — if code and a document disagree, the document is assumed right until the document itself is changed) through the whole project:

1. **`SPEC/idea.md`** — what CoinFlow is: problem, users, value proposition (the concrete benefit the app delivers to a user, and why that's worth having), features, non-goals (things the app deliberately will *not* do, written down so nobody accidentally builds them later). Already written.
2. **`SPEC-UI-UX.md`** — how the user interacts with it: information architecture (**Plain-English:** how the app's screens and features are organized and connected, like a map or table of contents for the whole app), user journeys (the step-by-step path a person takes through the app to accomplish something, e.g. "open app → see a detected transaction → tap confirm → done"), screens, states (what a screen looks like in a particular situation — e.g. "loading", "empty", "error", as opposed to just its normal/default look), edge cases (unusual or extreme situations a feature must still handle correctly, e.g. a transaction of ₹0 or an extremely long merchant name), design system (the reusable set of colors, fonts, spacing rules, and components everything is built from, so all screens look and feel consistent), UX acceptance criteria (concrete, checkable statements that let someone verify a UX requirement is actually met, rather than a vague "it should feel nice").
3. **`SPEC-implementation.md`** — how it's technically built: architecture (the overall shape/structure of the codebase — which parts exist and how they talk to each other), data models (the structure of the information the app stores, e.g. what fields a "Transaction" record has), state management (how the app keeps track of information that can change while it's running, e.g. which screen you're on or what data is currently loaded), navigation, business logic (the actual rules and calculations behind a feature — e.g. how to decide which spending category an SMS-detected purchase belongs to), error handling, security, testing.

This diagram shows the required order: each document is only written once the one above it exists, and the actual coding ("Implementation") only starts once both specs exist below it.

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

Claude must not make important product, UX, or architectural (structural/technical) decisions implicitly (i.e., silently, as an unstated side-effect of writing code) when they should instead be written into one of these three documents. If a requirement is ambiguous or contradictory, stop and ask instead of silently guessing.

### 1.1 Project structure

This is the folder layout of the repository (the project's set of files, tracked with git) as originally planned — see §0 above for what's actually done vs. still pending right now:

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

("Source of truth" = the one authoritative place to look for the correct answer, per §1's authoritative-artifacts explanation above.)

### 1.2 Design/implementation boundary

While in the design phase (§2–§6 — the stretch of work covering information architecture through prototype refinement, before any spec is frozen), do **not** modify `src/app` or other production application code (the real code that ships in the actual app, as opposed to a throwaway prototype) unless explicitly instructed. All experimentation happens in `design-prototype/`, built as plain coded web pages so it can be opened in a browser and iterated on quickly, without risking the real app. Only after a flow (a user journey / sequence of screens, as defined above) is validated (§6) does it get translated into the actual Expo/React Native implementation (§9) — i.e., only then does someone actually rebuild that same screen/flow as real mobile-app code.

---

## 2. Information architecture + screen/state inventory

Do this before any visual design. No colors, no typography (the styling and sizing of text) yet — the point of this step is to nail down *what screens exist and what they need to do*, before worrying about what they look like.

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

**Plain-English:** a "full page" (or "full navigation") is a screen you navigate to that takes over the whole display, usually with its own back button/history entry. A "modal" is a screen or box that pops up on top of the current screen and blocks interacting with it until it's dismissed. A "bottom sheet" is a panel that slides up from the bottom of the screen over the current content — commonly used for quick, short-lived actions (like confirming one transaction) rather than a full trip to a new screen.

### 2.2 Build the screen/state inventory

This is the design brief (a written description of what needs to be designed and why, handed to a designer or design tool as the starting brief for its work) input for Claude Design — do not skip it. For every screen in the map above, write:

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

V1.5 (split expenses/settlements) screens come later — don't design them yet; note them in the inventory as "Future" so they aren't forgotten, per the non-goals discipline in `idea.md`. ("V1" = "version 1", the first release; "V1.5" = a planned, smaller follow-up release after V1, adding a defined extra chunk of scope — here, splitting a shared expense between people and settling up who owes whom.)

Keep the earlier discipline for every screen: also record its **edge cases** (as defined above: unusual/extreme situations a screen must still handle correctly) — boundary values (values at or beyond the normal expected range — e.g. ₹0, very large amounts, long merchant names, thousands of transactions), duplicate/outdated data, network failure mid-action, and the "not every transaction is an expense" distinction called out as a core principle in `idea.md` (i.e., money moving through the app isn't always spending — it could also be income, a transfer between the user's own accounts, a refund, etc., and the design has to account for that).

---

## 3. Visual direction (before generating anything)

Decide, and write down:

- **Product personality** — e.g. minimal, fast, friendly, low-friction (not "premium banking app"; CoinFlow's whole point is effortlessness, so the UI should feel light and quick, not dense with financial chrome). ("Chrome" here is a UI-design term for the visual surrounding decoration of an interface — borders, bars, icons, ornamentation — as opposed to the actual content; "low-friction" means requiring little effort or few steps from the user.)
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

- **Design brief** — once direction feels stable, write a short brief (product, target user, personality, design principles, typography direction, color direction, navigation shape, core screens, key interactions, things to avoid). This becomes the standing context (background information given once and reused, instead of repeated every time) handed to Claude Design (an AI design tool used to generate/draft screens) instead of re-explaining the app every time.

---

## 4. Generate the first prototype

Use `design-prototype/` and the **Impeccable** skill/agent for this stage.

- **Don't generate the whole app at once.** Start with one important flow — the core loop from `idea.md`:

  ```
  Home → Transaction notification → Confirm/Review transaction → Done
  ```

  This flow exercises the most important interaction in the product (fast confirmation) and will surface the visual language decisions (**Plain-English:** the recurring visual choices — cards, typography, spacing, motion (on-screen animation/movement) — that give the whole app a consistent look and feel, the same way a "writing style" is a recurring set of word choices) that every later screen depends on.

- Build it as real, interactive coded web pages (HTML/CSS or a lightweight React setup inside `design-prototype/`) — not static frames (still, non-clickable images that only show what a screen looks like, like a photograph rather than a working page) — so it can actually be clicked through in a browser.

---

## 5. Critique, refine, extract the design system

Loop: **Generate → Critique → Refine → Test → Repeat.** ("Loop" = a repeating cycle you go around multiple times, not a one-time sequence — you keep generating, critiquing, and refining the same flow until it's good, not just once through.)

- Use Impeccable as a design QA (quality assurance — the practice of deliberately checking work for problems before considering it finished)/refinement pass on the first prototype, not as the first step. Ask it to evaluate:
  - **Hierarchy** — is the most important info (balance, amount) visually dominant? ("Visual hierarchy" means using size, color, and placement so a viewer's eye is naturally drawn to the most important thing first.)
  - **Spacing** — inconsistent spacing/alignment?
  - **Typography** — is the type scale (the fixed set of font sizes/weights the design reuses everywhere — e.g. one size for headings, a smaller one for body text — rather than picking a new size for every label) doing real hierarchy work?
  - **Accessibility** (how usable the app is for people with disabilities or limitations, e.g. low vision or motor difficulty) — contrast (how much a text color visually stands out against its background — low contrast is hard to read), touch target size (how big a tappable button/area is — too small is hard to hit reliably, especially for people with limited dexterity), color-only signaling (relying purely on color to convey meaning, e.g. "red = expense" with no other cue — a problem for colorblind users)?
  - **Consistency** — do components (reusable, self-contained UI building blocks — a button, a card, an input field — used repeatedly instead of one-off custom pieces) share visual rules?
  - **UX** — unnecessary steps or confusing navigation?
- Claude generates, the user judges, Impeccable critiques/refines, Claude implements the changes. Iterate until the core flow feels right.
- Once 3–5 screens/states look good, **extract the design system from what was actually built** (don't design it abstractly beforehand — i.e., build real screens first, then notice and name the patterns that emerged, rather than inventing a design system on paper before anything real exists): typography scale (display/heading/subheading/body/caption), colors (background/surface/primary/secondary/text/muted/success/warning/error/chart colors), spacing scale, radii (the roundedness of corners, e.g. on buttons or cards), and the reusable component list (button, card, input, transaction row, balance card, chart, nav, modal/sheet, toast [a small temporary notification message], badge, tabs, filter). Write this into the design-system section of `SPEC-UI-UX.md` once captured (§7).
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
- **Responsive testing matters here even though CoinFlow ships as a mobile app**, because the prototype is a desktop-capable web page. ("Responsive testing" = checking that a web page's layout still works correctly at different screen sizes, e.g. phone-width vs. desktop-width.) Don't just shrink the desktop layout — mobile often needs a different composition (arrangement of elements on the screen) entirely (e.g., a desktop side-nav [a vertical menu of links running down the side of a page] becomes a bottom tab bar [a horizontal row of destination buttons fixed to the bottom of the screen, standard on mobile apps], not a squeezed sidebar). The web prototype is a UX/interaction proving ground (a place to test whether the *behavior and flow* work, before worrying about exact pixel-for-pixel visuals), not a pixel-accurate final mobile layout.

---

## 7. Write and freeze `SPEC-UI-UX.md`

Once product scope is clear, journeys are understood, screens are designed, states/edge cases are considered, the design system is established, and the prototype is approved — write the formal spec. Structure (note: the numbers 1–8 below are this spec's *own* internal section numbers inside `SPEC-UI-UX.md`, separate from this `PLAN.md` file's §1–§12 numbers):

```
1. Product Definition (problem, target users, value proposition, goals, non-goals — pull from idea.md)
2. Feature Specification (per feature: purpose, user, priority, entry point [where in the app this feature is first reached from], flow, outcome, dependencies [other features/screens this one relies on existing first], edge cases)
3. Information Architecture (nav hierarchy, screen relationships — from §2.1)
4. User Journeys (every major journey, entry → exit, success/failure states)
5. Design System (colors, typography, spacing, shapes, components, interaction principles — from §5)
6. Screen Specifications (per screen: purpose, users, entry/exit points, primary/secondary actions, layout, components, content, navigation, interactions, states, edge cases, accessibility, acceptance criteria)
7. Global UX Rules (e.g. destructive actions [actions that delete or irreversibly change something, like deleting a transaction] require confirmation; loading states never leave a blank screen; errors explain what happened and what to do; monetary values [amounts of money] format consistently)
8. UX Acceptance Criteria — objectively verifiable (checkable by an actual test, not just a subjective opinion), not "looks good". E.g.:
   "An empty transaction history displays an empty state with a clear action to add a transaction." (a "call to action" — a clearly visible button/link inviting the user to do the one relevant next thing)
   "Submitting an invalid transaction does not create a transaction and provides actionable validation feedback." ("validation" = checking that entered data is actually acceptable, e.g. rejecting a negative amount; "actionable feedback" means the error message tells the user specifically what to fix, not just that something went wrong.)
```

Add a verification checklist with IDs so an agent (an AI coding assistant, or a person, working through this checklist later) can check conformance (whether the actual built app matches what the spec says) later:

```
UI-001  Home displays the current balance.        Verification: run app, inspect Home. Status: Pending
UI-002  Home contains a primary "add transaction" action.
UI-003  Navigation contains exactly the defined destinations.
UI-004  Empty transaction list shows an empty state with a call to action.
UI-005  Loading state exists for Home and Transactions.
UI-006  Error state exists and is actionable.
...
```

**Freeze the spec** (see the "frozen" gloss in §0 above) once all of the above holds. After freezing: any product/UX change updates `SPEC-UI-UX.md` first, then the implementation — never the other way around (see §10).

---

## 8. Technical design + `SPEC-implementation.md`

Switch from "what should it do" to "how do we build it." Decide (informed by `AGENTS.md`: **Expo has changed — read the versioned v57 docs before writing code**, since the app already targets `expo` `~57.0.18` / RN `0.86.3` / React 19 / expo-router — these are version numbers of the frameworks/libraries in use; because these tools change significantly between versions, always check the docs for the *specific* version being used rather than relying on general/older knowledge of them):

- Navigation: `expo-router` (already the app's `main` entry [the file that runs first when the app starts]) — map §7's IA (information architecture, defined above) to actual routes/groups (the real code-level screen paths and how they're grouped, e.g. `/home`, `/settings`).
- State management, local persistence (**Plain-English:** "persistence" means data is saved to permanent storage so it's still there after the app is closed and reopened, as opposed to living only in memory while the app runs) (transactions, categories need to survive restarts — likely on-device storage, no backend for V1 given `idea.md`'s scope — meaning: no remote server storing user data for the first version; everything lives on the phone itself).
- SMS detection: platform constraints matter a lot here (Android SMS reading vs. iOS's much tighter restrictions — Android and iOS are the two mobile operating systems, and iOS is far more restrictive about letting apps read text messages) — this needs an explicit decision and fallback design (a backup plan for when the primary approach isn't available or fails — manual entry is already the fallback per `idea.md` §4), not an implicit assumption.
- Data models (the structure of stored information, as defined in §1 above): at minimum `Transaction` (amount, direction, category, payment method, merchant, timestamp, type — expense/income/transfer/reimbursement/refund per the "not every transaction is spending" principle), `Category`, and whatever a parsed-but-unconfirmed SMS suggestion needs (i.e., the in-between data the app holds for a transaction it *thinks* it detected in an SMS but the user hasn't yet confirmed).
- Notifications: local notification (a phone notification generated entirely on-device by the app itself, not sent from a remote server) triggered on SMS detection.
- Testing strategy: unit tests (automated tests that check one small, isolated piece of logic in isolation) for business logic (categorization, split-expense math, SMS parsing), integration tests (automated tests that check multiple pieces working together correctly) across modules, a few UI tests (automated tests that simulate a user interacting with the actual screens) for the core confirm-transaction journey, manual visual comparison against the approved prototype.
- Security: SMS content and transaction data are sensitive — define storage, no unnecessary logging (recording of information, e.g. to debug files, that could later be read by someone else) of financial data, no unnecessary network transmission (sending data over the internet).

Then write `SPEC-implementation.md` with sections: Technology Stack, Architecture, Project Structure, Data Models, Application State, Navigation, Components, Business Logic, Error Handling, Security, Testing Strategy. Do not let technical convenience (choosing the technically easier path) silently change product behavior decided in `SPEC-UI-UX.md` — if it conflicts, that's a spec change (§10), not a quiet workaround.

---

## 9. Implementation with Claude Code

Once both specs exist:

1. Give Claude Code (Anthropic's AI coding assistant / CLI tool, the one actually writing the app's code) access to `SPEC/idea.md`, `SPEC-UI-UX.md`, and `SPEC-implementation.md` as the source of truth. Don't invent product behavior that conflicts with the UX spec, or architecture that conflicts with the implementation spec. Ambiguity → stop and ask.
2. Implement **incrementally, one feature at a time** — never "build the entire app." For each feature: read the relevant spec section → implement → write the tests §9.1 calls for → run tests → run the app → compare against the approved prototype → verify acceptance criteria against §9.1's bar (the minimum standard something has to clear before it counts as finished) → fix issues → mark the requirement complete. A feature isn't done because it compiles (i.e., because the code has no syntax errors and successfully builds — that only proves the code is *valid*, not that it *works correctly*), and it isn't done because a human clicked through it once either (a single manual click-through can miss edge cases that a real test would catch).
3. Maintain traceability (as defined in §0's ID glossary above — keeping an unbroken, checkable link from requirement to code to test): `UI-00x` (UX requirement) → `IMP-00x` (implementation requirement) → component/service → test. This keeps requirements from silently disappearing during implementation.

### 9.1 Definition of done (per feature) — no speed-running past this

**Plain-English — "definition of done":** a checklist of everything that must be true before a piece of work is allowed to be called "finished," so that "done" always means the same, complete thing rather than whatever felt done in the moment.

Feature velocity (how fast features get built) does not substitute for completeness. Writing the test, covering the edge case,
or wiring the real entry point **is** part of implementing the feature — not a follow-up to get to
later. Before a feature's `SPEC/traceability.md` rows can show `Pass`, all of the following hold —
or the gap is named as an explicit, bounded deferral (a deliberately postponed piece of work, written down with a clear reason and a clear future trigger for when it must be finished — see point 3), never silently skipped because the
next feature was more interesting:

1. **Behavior matches spec.** Every `IMP-0xx` criterion in the feature's `SPEC-implementation.md`
   section is implemented as written, or the deviation is logged as a **simplification**
   (still spec-compliant in outcome, with the "why" written down) — not a silent shortcut.
2. **Tests at the tiers (levels/categories of testing, from small isolated unit tests up to full end-to-end flow tests — §34 of `SPEC-implementation.md` defines exactly which tiers exist) `SPEC-implementation.md` §34 defines, written as part of this pass, not
   left "owed" (i.e., not left as an unfulfilled debt to come back and pay off later):**
   - Unit tests for any new pure logic (**Plain-English:** "pure logic" is a calculation or rule that just takes inputs and produces outputs with no side effects like network calls or database writes, which makes it easy to test in isolation) (`src/domain`, business-logic branches in repos/services) —
     §34.1.
   - An RNTL test (a React Native Testing Library test — an automated test that renders a screen/component the way the real app would and simulates a user interacting with it, without needing a physical phone) for every new screen/sheet/major component this feature adds or materially
     changes, covering at minimum the primary interaction and the states §34.2 lists for it
     (skeleton [a placeholder layout shown while real content is still loading]/empty/error where applicable, validation, discard-guard [a confirmation prompt that stops a user from accidentally losing unsaved input]). "No RNTL test of the
     screen itself" is not an acceptable steady state (a condition allowed to persist indefinitely) for a feature marked done.
   - A Maestro flow (an automated end-to-end test — Maestro is a tool that drives the actual compiled app like a real user would, tapping through a full multi-screen journey, called a "J-flow" here — "J" for "journey") is **not** required per feature — a J-flow usually spans several features — but
     the moment the *last* feature in a J-flow's dependency chain (the ordered set of features that all have to exist before that full journey can be tested end-to-end) lands, that flow's `.yaml` (the file format Maestro test scripts are written in) is
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
   found by clicking through the app gets a regression test (an automated test written specifically so that if this exact bug ever comes back, a test fails immediately instead of it slipping through unnoticed) in the same pass that fixes it, not a
   note that it was fixed once.

This is the concrete bar `status: Partial` in `SPEC/traceability.md` is checked against — see its
header. "Run tests" in step 2 above means: write what this feature's own scope calls for per this
section, then run it — not just re-run whatever already happened to exist.

---

## 10. Spec change protocol

**Plain-English — "protocol":** a fixed, agreed-upon procedure to follow every time a certain situation comes up, so the same kind of decision is handled the same way each time rather than improvised ad hoc.

The specs stay ahead of the implementation, always. When a new idea comes up mid-build:

```
New idea → Is it actually required for V1?
    Yes → Update the relevant spec → Update implementation → Verify
    No  → Log it under Future/Backlog in idea.md, don't build it now
```

Never let the implementation quietly diverge from (drift away from / stop matching) `SPEC-UI-UX.md` or `SPEC-implementation.md`. If the built thing differs from spec on purpose, decide why, update the spec, then adjust the code to match — spec and code should never silently disagree about what's true.

---

## 11. Final quality review (before calling V1 done)

Each `·`-separated item below is its own separate checklist item — all of them must hold, not just most.

**Product** — target audience clear · problem clear · value prop clear · features justified · non-goals documented.

**UX** — every major journey defined · navigation coherent (makes sense and hangs together as a whole, rather than each screen's navigation feeling like it was designed separately) · primary actions obvious · empty/loading/error states exist · edge cases handled · accessibility considered.

**UI** — design system consistent · all major screens have prototypes · components/typography/spacing/color consistent · prototype approved.

**Technical** — architecture matches `SPEC-implementation.md` · data models defined · business logic tested · core journeys tested · error handling exists · security addressed.

**Specification** — `SPEC-UI-UX.md` and `SPEC-implementation.md` complete · requirements have IDs and verification methods · implementation traces back to requirements (every requirement can be followed forward to the actual code and test that satisfies it — see the traceability gloss in §9) · specs reflect the actual shipped product (the written spec still accurately describes what was really built, not an earlier plan that's since drifted).

---

## 12. Next actions (do these now, in order)

Steps 1–7 of this plan (discovery → design → prototype → freeze both specs) are **done** (§0).
Implementation (§9) is the current track. Do these in order:

1. **Scaffolding pass.** ✅ Done. `npx expo install` (the command that installs a package while
   making sure the version is compatible with the installed Expo SDK) every dependency (an external
   library the project's code relies on) pinned (locked to a specific version, rather
   than left to float to whatever the "latest" version happens to be at install time) in
   `SPEC-implementation.md` §16, re-verified against SDK 57 (SDK = "Software Development Kit" — the
   bundled set of tools/libraries Expo provides; "57" is the version) (§16.7); test runner configured
   (`jest-expo` + `@testing-library/react-native` — the automated-testing tools used in this
   project); `app.json` (Expo's main app-configuration file) changes applied (§35.1).
2. **Theme + template teardown.** ✅ Done. `src/constants/theme.ts` (§29.1) + `<AppBackground>` +
   `src/ui/icon.tsx` built; `ThemedText` / `ThemedView` (the app's reusable "theme-aware" text/view
   building blocks, mentioned in `CLAUDE.md`) moved to `src/ui/`; template `explore.tsx`
   and the "Welcome to Expo" home (the placeholder screens that `create-expo-app` generates by
   default in a brand-new project, before any real app is built on top of them) deleted (§18.4).
3. **Persistence.** ✅ Done. Drizzle schema (Drizzle is the library used to define the shape of the
   on-device database — a "schema" is that definition of what tables/columns exist) (§19), migrations
   (versioned, ordered steps that upgrade the on-device database's structure over time as the app's
   data needs change) + `<MigrationGate>` (a component that blocks the app from showing any screen
   until those migrations have finished running) + the idempotent seed ("idempotent" means safe to
   run more than once without causing duplicate or broken data; a "seed" is the initial starter data
   loaded into a fresh database, e.g. default categories) (§20), the repository layer (the layer of
   code that other parts of the app go through to read/write stored data, rather than talking to the
   database directly) (§21), the Zustand stores (Zustand is the library used to hold and share
   in-memory application state across the app while it's running) (§22).
4. **Native SMS pipeline.** ✅ Done. `modules/coinflow-sms` (Kotlin receiver + headless task host —
   "Kotlin" is the programming language Android system-level code is written in; a "receiver" is
   Android-specific code that gets woken up when a text message arrives; "headless" means it runs in
   the background with no visible screen)
   + its config plugin (§17.6) built; local dev now requires `expo run:android` / a dev-client
   build (Expo Go no longer runs the app — "Expo Go" is Expo's generic pre-built testing app that
   normally lets you preview a project instantly without compiling anything yourself, but it can't
   include this project's custom native SMS code, so a real custom build — a "dev client" — is
   required instead).
5. **Features, one at a time, in priority order** (§9). ("P0" and "P1" below are priority tiers —
   P0 is the more urgent/foundational tier, P1 the next tier after it; "on-device" means actually
   installed and run on a real physical phone, as opposed to only run in an automated test or a
   simulator.) P0: F1 detection → F2 notification →
   F11 review queue → F3 confirmation → F4 manual add → F5 list — all **done**
   (`SPEC/traceability.md`). **F6** (P1, done) and **F6.5 app shell & Home** (P0, added
   `SPEC-implementation.md` CR-4, 2026-09-03: the `(tabs)` shell (the overall screen structure that
   provides the bottom tab bar and wraps every tab's screens) + the real Home screen had no
   owning feature until then) are also both **done**, F6.5 verified on-device 2026-09-03. **F7**
   (P1, done, verified on-device 2026-09-03) and **F8 account memory** (P1, done 2026-09-03 —
   most of its own behaviour already existed from F2–F5/F11; this pass built the Settings ›
   Account rules screen the spec calls its only window into that behaviour; verified on-device
   2026-09-03) are both done. **F8.5 Settings** (P1, added, same CR as F6.5/F8's CRs, done
   2026-09-03 — the real grouped Settings screen + its four remaining subpages; also closed
   CR-5's housekeeping item and fixed a real gap, IMP-042's permanently-denied → Open system
   settings branch (the specific behavior needed when a user has permanently denied the app a
   permission, e.g. SMS access, and the app must now direct them to the phone's own Settings app to
   re-enable it), that no earlier feature had actually implemented; on-device check still
   owed) is done too. **F9 Spending summary** (P1, done 2026-09-03 — the first feature needing
   real chart rendering: `d3-shape`/`d3-scale` (charting-math helper libraries) installed since Phase 1, unused until now; built
   the arc gauge (a curved dial-style chart), category donut (a ring-shaped pie chart broken down by
   spending category), and daily chart from scratch, plus `domain/period.ts`'s week
   mode/stepping and the daily-series math §26.6 calls for; on-device check owed harder than
   usual — none of the SVG (Scalable Vector Graphics — the drawing format used to render these
   charts) layout has been visually seen yet) is done too. **F12 Onboarding &
   permissions** (P1, done 2026-09-03, the last feature in this list — welcome/permissions/
   category-review + the root `<Redirect>` (the code that automatically sends a fresh install
   straight to the onboarding flow) that's the first thing a fresh install actually
   shows; caught a second app-boot-scope hazard the same shape as F9's `analytics-period` one,
   this time by giving the root layout its own `_layout.web.tsx` split (see `CLAUDE.md`'s
   explanation of `.web` sibling files — a separate version of a file used only when running on
   web) rather than letting a
   live query (a database read that's subscribed to live-update as data changes) stuck-forever on
   web block the entire site; on-device check owed, and this is the
   highest-priority one left to actually do) is done too. **All of F1–F12 are now built** — see
   `SPEC/traceability.md`'s closing note. What's left: clearing the accumulated on-device debt
   (unfinished on-device verification work that has been deliberately postponed but still has to be
   paid off — §11 below can't really start until that's done) and then §11's own final review pass.
   Per-feature loop, kept here for reference on any future spec change or fix:
   read the spec section → implement → write the tests §9.1 calls for → run tests → run the app →
   compare against `design-prototype/01-midnight/` → verify its `IMP-0xx` + `UI-0xx` against §9.1's
   definition of done → mark done. Keep a `SPEC/traceability.md` grid (`UI-0xx → IMP-0xx →
   component → test`, per §34.4) current as you go — including a periodic pass back over already
   "done" features to close out any deferral whose trigger condition has since been met (e.g. a
   feature that unblocks a notification deep link [a link that opens the app directly to a specific
   screen when a notification is tapped], or completes a Maestro flow's dependency chain).
6. **Pre-release.** The §11 final quality review; the D18 ~2-week field test (real-world testing
   done on actual phones over an extended period, not just a quick one-off check) on real OEM
   ("OEM" = Original Equipment Manufacturer — the phone's actual maker, e.g. Samsung or Xiaomi)
   battery-killer devices (phone models/manufacturers known for aggressively killing background
   apps/processes to save battery, which risks missing SMS-detection events) (dropped-event rate
   [how often an incoming SMS event is missed entirely] + cold-start latency [how long the app
   takes to become usable from a fully-closed state] — decides whether the §17.7
   native-notification contingency [a backup plan, built only if needed, to trigger notifications
   from native Android code instead of JavaScript] gets built); the `SPEC-implementation.md` §35.7
   checklist.
7. **Ship.** Signed (digitally signed with a release certificate, as Android requires before an app
   can be installed outside of development) `production` APK (APK = "Android Package" — the
   installable file format for Android apps) via EAS (Expo Application Services — Expo's
   cloud build/release infrastructure) internal distribution / direct install (D20) — no
   Play Store (the app is not published to the Google Play Store; users install the APK file
   directly instead).

Any product/UX/architecture change that surfaces mid-build is a change-request (§10): update the
relevant frozen spec (+ its change log) first, then the code.
