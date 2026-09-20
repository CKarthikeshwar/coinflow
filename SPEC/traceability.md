# CoinFlow — Traceability matrix

**Plain-English: what this document even is.** A "traceability matrix" is a big spreadsheet-style
record that answers one question, over and over, for every single requirement in the product: *"we
said we'd build X — where in the code did we actually build it, and what proof do we have that it
works?"* Each row below ties together four things: a requirement's ID, the actual source-code file
that implements it, what kind of automated check (if any) was written for it, and whether that
check currently passes. Think of it as a paper trail: if someone (a future developer, an auditor,
you six months from now) asks "does CoinFlow actually detect SMS transactions correctly, and how do
we know?", this file is where you look.

> **ELI5:** Imagine a school project where the teacher gave you a checklist of 50 things the project
> must do ("must have a title page," "must cite 3 sources," etc.). Instead of just turning in the
> project and hoping, you keep a second sheet where, next to each checklist item, you write down
> exactly which page of your project satisfies it, and whether you've actually double-checked that
> page is correct. That second sheet is this file.

`UI-0xx → IMP-0xx → component/service → test`, per `SPEC-implementation.md` §34.4. Here, `UI-0xx`
and `IMP-0xx` are just ID codes (like ticket numbers) minted in the other two spec files:
`UI-0xx` IDs live in `SPEC/SPEC-UI-UX.md` (design/UX requirements — what the screen should look like
and how it should behave) and `IMP-0xx` IDs live in `SPEC/SPEC-implementation.md` (technical
requirements — what the code must actually guarantee). "component/service" means the specific
source file(s) in `src/` that implement that requirement. The arrow chain just means: a design
requirement (`UI-0xx`) is implemented by a technical requirement (`IMP-0xx`), which is implemented
by a real file, which is (ideally) checked by a real automated test. This file is maintained
incrementally as each feature (`SPEC/PLAN.md` §9, "definition of done" in §9.1) lands — rows are
added when a feature starts, and the row's `status` flips to `Pass` once its tests are green
("green" is a common testing-tool color convention meaning "all checks passed," as opposed to "red"
for failing).

Row shape: `IMP-0xx | criterion | UI-0xx | component/service | test kind | test id / file | status`.
("Criterion" is just the plain-English description of what that requirement demands — the actual
rule being checked. "Test kind" tells you what category of automated check was written; the first
time each kind shows up in this document below, it's explained in full — look for `unit`, `RNTL`,
and `Maestro`/E2E as you read on.)

**Status contract (`SPEC/PLAN.md` §9.1 / `SPEC-implementation.md` §34.4):** `Pass` = implemented +
carries the test tier(s) its scope calls for (i.e., not just "the code exists" but "the code exists
*and* has the level of automated testing this kind of requirement is supposed to have"). `Partial` =
a *named, bounded* deferral with an explicit trigger ("closes when F8 lands" — meaning: this stays
incomplete on purpose, and we've written down exactly what future event will make us come back and
finish it). `Partial` must never be used as a vague stand-in for "didn't write the test" or "not
verified yet" — those are gaps that need to be either fixed or explicitly named as `Partial`
deferrals, not left ambiguous. Every `Partial` row below predates this contract (see the audit at
the bottom of this file) and needs a pass to either close it out or attach a real trigger.

## Cross-cutting fix — web bundling broke (§18.3)

**"Cross-cutting" means:** this bug and fix isn't a story about one single feature (F1, F2, etc.)
— it's about something that affects the whole app's plumbing, so it gets its own write-up instead
of living under one feature's heading. There are several "Cross-cutting fix" sections in this
document; each one is this kind of app-wide issue.

**Plain-English: what "bundling" means.** Before an app can run, all of its many separate source
code files need to be gathered up, translated, and packed into one (or a few) delivery files —
the same way a shipping company doesn't send you 200 separate boxes for 200 separate items, it
consolidates them into one crate. This packing step is called "bundling," and the tool that does it
here is Metro (for the Android app) or, for the web build, a bundler working through `expo export
--platform web`. "Web bundling broke" means: the step that packs up the website version of the app
failed outright — the packing tool hit something it couldn't process and refused to produce output.

Not tied to a single feature: `npm run web` / `expo export --platform web` failed with
`Worker chunk not found for: expo-sqlite/web/worker.ts`, discovered once F11/F3 wired real
database reads into `src/app` files and the always-mounted `SheetHost` (`SheetHost` is the
component, described in detail in the next section below, that keeps the app's bottom-sheet popups
— like the Add/Confirm screens — mounted and ready at all times). Root cause: every
`src/db/repositories/*.ts` file imported `useLiveQuery` **directly** from `drizzle-orm/expo-sqlite`
(`useLiveQuery` is a "hook" — a small reusable function, following React's naming convention of
starting with `use`, that lets a screen automatically re-render whenever the underlying database
data changes; `drizzle-orm` is the library CoinFlow uses to talk to its SQLite database in a more
convenient way than writing raw SQL by hand — an "ORM," Object-Relational Mapper, translates between
database rows and normal code objects). Importing it this way statically pulls in `expo-sqlite`'s
WASM-backed web worker (**Plain-English:** "WASM" — WebAssembly — is a way to run compiled,
near-native-speed code inside a web browser; a "web worker" is a background thread a browser page
can run code on without freezing the main screen. Here it means: the web build was dragging in a
whole browser-based database engine it was never going to use) — regardless of whether the hook is
ever called, and regardless of `db/client.ts`'s existing (correct) `.web.ts` split (recall from
`CLAUDE.md`: a `.web.ts`/`.web.tsx` file automatically overrides its non-`.web` sibling only on the
web build), since that split only covers `db` itself, not this separate import. Fixed by adding
`src/hooks/use-live-query.ts` + `.web.ts` (the "live-query wrappers" file §18's project structure
already anticipated) and pointing all 5 repository files at it instead of the package directly —
the web variant returns a static empty result and never touches `expo-sqlite`. Also added
`src/app/index.web.tsx`, `src/app/review-queue.web.tsx`, and
`src/features/app-shell/sheet-host.web.tsx` — per §18.3, web is meant to render one "CoinFlow is an
Android app" placeholder (`src/ui/android-only-notice.tsx`) with zero database access, not a
broken/empty version of the real screens (this matches `CLAUDE.md`'s note that CoinFlow is
Android-only for V1, and the web build exists mainly so the code still compiles/runs there, not to
offer a real web product). Verified with `expo export --platform web` (now produces 4 static
routes — self-contained web pages ready to be hosted, ~24KB each) and `--platform android`
(unaffected — same 7.1MB bundle either way).

## Cross-cutting fix — Add/Confirm sheet never rendered on-device (§28.2/§16.7)

**Plain-English, before the story:** a "sheet" here (as in `SheetHost`, "bottom sheet") is the
popup panel that slides up from the bottom of the screen — the thing you see when you tap "Add
transaction" or tap a suggested transaction to confirm it. It's built on a third-party library
called `@gorhom/bottom-sheet`. "On-device" means testing on an actual physical Android phone, as
opposed to automated tests that run on a computer without a real screen. "Native module" refers to
code written in Android's own languages (Kotlin/Java) rather than JavaScript — it does things
JavaScript alone can't, like drawing OS-level UI or reading SMS. `Jest` is the automated test-runner
tool this project uses (`npm test`); when a test needs something it can't actually run (like a real
native UI library), it substitutes a fake stand-in called a "mock" so the test can still run without
that dependency — but that also means the mock can hide a bug the real thing would have hit.

Not tied to a single feature: on a real Android device, **every** `SheetHost` sheet (F3's Confirm,
F4's Add) silently did nothing — the button dimmed, `openSheet()`/`.present()` were confirmed
(via logging — printing debug messages to a console, the most basic way to check "did this line of
code actually run?") to run correctly with no thrown error anywhere (JS console or native Logcat —
Logcat is Android's own system log, viewable via the `adb` command-line tool), yet no sheet ever
appeared. Invisible in Jest (mocks the whole native module, so the mocked version doesn't have the
real bug) and in `expo export` bundle checks (those only confirm the app *packages* correctly, not
that it behaves correctly once running), so it surfaced only once real on-device testing began
post-F5.

Root cause, found by instrumenting `@gorhom/bottom-sheet`'s own source line-by-line (i.e., temporarily
adding logging *inside* the third-party library's code to watch exactly what it does step by step —
a debugging technique for when you can't tell what's wrong just by reading the code): `SheetHost`'s
effect (a React "effect" is a piece of code that runs automatically after a component renders or
updates — the standard place for side effects like calling into a native library) ran
`ref.current?.dismiss()` on `current == null` **unconditionally**, including on the component's
very first mount (i.e., the very first time it appears on screen) — i.e. it called `.dismiss()`
(close the sheet) on a `BottomSheetModal` that had never even been opened yet. Gorhom's (the
library author's username, used as shorthand for "the library's own code") `handleDismiss()`
function has no safety check for that case: it unconditionally sets its internal
`statusRef.current = MODAL_STATUS.DISMISSING` (an internal flag meaning "this sheet is in the
process of closing") and only ever clears that flag back via the "already closed" branch, which
this particular call doesn't qualify for — so the flag gets stuck reading `DISMISSING`
**permanently**, forever, from that very first, erroneous close call onward. From then on, every
future `.present()` (open the sheet) call succeeds and correctly flips the modal's own internal
`mount` state to `true`, but the portal-render callback that actually registers the sheet's visible
content (`handlePortalRender`, which only proceeds when `statusRef.current !== DISMISSING`) silently
does nothing, forever — so the sheet's content is never handed off to the `PortalHost` (the part of
the library responsible for actually drawing the sheet's content on top of everything else) that
would render it on screen. No exception is ever thrown anywhere in this chain; every layer reports
"success," which is exactly why it was so hard to find — nothing was actually complaining.

> **ELI5:** Imagine a curtain on a stage that has a hidden rule: "once someone yells 'close!' even
> a single time before the curtain has ever been opened, the stage crew permanently stops listening
> to the 'open the curtain fully' cue" — but they *do* still walk through the motions of "getting
> ready to open" every time. Actors keep walking on stage (the code "succeeds"), the crew keeps
> pretending to get ready, but the curtain itself never actually rises again, and nobody ever shouts
> an error, because as far as the crew are concerned they did their job correctly.

Fixed in our own code, not the library: `sheet-host.tsx` now tracks whether the sheet has ever
actually been presented (opened) at all, using a `hasPresented` ref (a "ref" in React is a small
mutable box that persists across renders without itself triggering a re-render), and only calls
`.dismiss()` after that's true — never on the initial `current == null` mount, closing off the
exact bad code path above.

Separately, while root-causing this, also found and defensively patched an unrelated, real,
currently-unmerged upstream bug (**Plain-English: "patch-package" and "upstream"** — `upstream`
means the original third-party library's own source repository, maintained by someone outside this
project; "unmerged" means a proposed fix for it exists as a submitted pull request but the library's
maintainers haven't yet accepted/shipped it. `patch-package` is a tool that lets this project apply
a small, saved, hand-written patch directly on top of a third-party library's code inside
`node_modules`, and have that patch automatically reapplied every time dependencies are reinstalled
— useful when you need to fix or work around a bug in someone else's code before they've officially
fixed it themselves). Saved as `patches/@gorhom+bottom-sheet+5.2.14.patch`: `@gorhom/bottom-sheet@5.2.14`
+ `react-native-reanimated@4.x` (the animation engine the sheet library builds on) has documented
cases (gorhom/react-native-bottom-sheet#2721, a bug report number on the library's own GitHub
issue tracker) where a sheet's mount-position `useAnimatedReaction` (a Reanimated hook that reacts
to animated values changing) can silently fail to register when the JS thread (the single thread
that runs your app's JavaScript logic) is busy at the moment the sheet mounts, leaving the sheet
parked off-screen with no error at all — exactly the class of risk `SPEC-implementation.md` §16.7
had already flagged as a theoretical, unverified concern. Applied the fix from the still-open
upstream PR #2720 (a JS-driven fallback that re-checks and corrects the mount position if the
animated reaction never fires) as "defense-in-depth" (a security/reliability principle: add a backup
safeguard even when you believe the primary cause is already fixed, in case there's more than one
way to trigger the same class of problem); it wasn't the cause of *this specific* bug, but is a
real gap in the current library/Reanimated-v4 combination worth keeping patched proactively.

Manual verification owed since F3/F4 (see their sections below) for "the sheet actually opens
on-device" is now **confirmed** — Add Transaction opens correctly on a physical device.

## Cross-cutting fix — a third-party app can silently swallow the SMS broadcast (§17.8/§17.9, CR-10/CR-11)

**Plain-English, before the story:** on Android, when a text message arrives, the operating system
doesn't hand it to just one app directly — it fires off a system-wide announcement called a
"broadcast," and any app that has registered a "broadcast receiver" (a small piece of code that
says "notify me when this kind of event happens") gets a chance to react to it. CoinFlow has its
own broadcast receiver, `SmsReceiver` (a small piece of native Kotlin code, part of the custom
`modules/coinflow-sms/` native module `CLAUDE.md` mentions), that listens for incoming SMS so it
can hand qualifying messages off to the JS-side detection pipeline. Multiple apps can register to
receive the same broadcast, and Android lets any one of them call `abortBroadcast()` — a method
that stops the announcement from reaching any other app further down the line, as if the message
had never been sent to them at all. This is normally meant for legitimate cases like a default SMS
app fully "claiming" a message, but it can also be triggered by an unrelated app for its own
reasons, with no signal to anyone else that it happened.

Not tied to a single feature: IMP-001's "a qualifying SMS creates exactly one pending Suggestion"
held on every test device, but a real-world report (a Moto Edge 60 Pro with Truecaller — a
caller-ID/spam-blocking app many people install — installed) showed transaction SMS going
undetected in the wild (i.e., on a real user's actual phone, not a test device). Root-caused on
that device via `dumpsys activity broadcasts history` (`dumpsys` is an Android system command,
run through `adb`, the Android Debug Bridge tool used to inspect/control a connected device, that
dumps internal OS state — here, a history of recent broadcasts and who handled them): Truecaller
(or any app holding the `RECEIVE_SMS` permission at the same top priority as the default SMS app)
can call `abortBroadcast()` on a recognized bank SMS before CoinFlow's `SmsReceiver` ever runs — no
crash, no log entry, nothing showing up anywhere in the §32 failure matrix (the spec's own table of
"here's what can go wrong and how we detect/handle it"), because nothing native or JS-side executes
at all — CoinFlow's code is never even given the chance to run. Invisible to every existing test
(the unit tests drive `smsIngestTask`, the JS-side processing pipeline, directly with a fake message
— they never go through the real Android broadcast-dispatch machinery an actual incoming text
travels through), so this was only findable on a real device running a real interfering app — the
same "surfaces only on-device" pattern as the two cross-cutting fixes above.

> **ELI5:** Picture a school office intercom. When an announcement is about to play, several
> staff members are all "listening in," but any one of them is allowed to hit a "stop, don't
> broadcast this to anyone else" button — and if they do, everyone further down the hallway just
> hears silence, with no indication anything was even said. Another app on the phone (Truecaller)
> was hitting that stop button on certain incoming texts before CoinFlow's own "listening" code
> ever got a turn.

Fixed with two changes, neither of which touches IMP-001's actual guarantee (both feed the exact
same, unmodified `smsIngestTask` pipeline — §17.3 steps 1–8 are unchanged):
1. `SmsReceiver`'s intent-filter priority (a setting that controls how early in line a broadcast
   receiver gets its turn) raised to `Integer.MAX_VALUE`, the highest possible value (partial
   mitigation only — Android doesn't actually define a guaranteed ordering between receivers that
   are tied at the same priority level, so this reduces but doesn't eliminate the risk).
2. A new reconciliation sweep (`reconcileMissedSms`, `src/services/tasks/sms-reconcile.ts`) — a
   "reconciliation sweep" here means a backup check that periodically re-reads Android's own
   shared SMS inbox storage directly (aborting the broadcast doesn't stop the message from
   physically landing in the phone's SMS store, it only stops the *announcement* about it from
   reaching other apps), so any message the real-time broadcast path missed still gets caught on a
   later pass. This sweep runs on app launch/foreground and on a new periodic `expo-background-task`
   (a scheduled job the OS runs occasionally even while the app itself isn't open — the standard
   Expo mechanism for background work), feeding any missed message through the exact same pipeline
   as a backstop, i.e. a safety net that catches whatever the primary mechanism let slip through.

Verified: unit-tested (`sms-reconcile.test.ts`, extended `sms-ingest.test.ts`); the fix itself was
confirmed against the originally-affected physical device (Truecaller present, previously-silent
SMS now produces a Suggestion + notification). No new `IMP-0xx`/`UI-0xx` — this hardens IMP-001's
existing delivery guarantee against third-party interference, it doesn't add a new one.

**Follow-up — a "Send diagnostics" export (§17.10/§32.1/§33.1, CR-12):** the gap CR-10 exposed
wasn't just this one bug, it was the process — the Truecaller fix was only root-caused because the
affected phone could be physically brought in for `adb dumpsys` inspection. CR-12 generalizes that
into a repeatable path for the *next* device-specific report, without needing physical access to
the device: two new `appSettings` signals record whether the real-time "headless task" (a
background piece of JS code that Android can run in response to an event like an incoming SMS, even
without the app's normal UI open — "headless" meaning it has no visible screen of its own) ever
actually ran, and what the reconciliation sweep last found (§17.10); `log.ts` gains a 50-entry
"ring buffer" (a fixed-size list that, once full, automatically drops its oldest entry to make room
for each new one — like a notepad with exactly 50 lines that you keep erasing the top line of to
write a new one at the bottom) of scrubbed (i.e., sensitive details removed — see the later Sentry
section for what "scrubbed" means in this codebase) `warn`/`error` log events. This buffer is kept
unconditionally, regardless of whether crash reporting is turned on (§32.1), since that's off by
default for everyone and this diagnostic history needs to exist even without it. A new **Send
diagnostics** row on Settings › Data (`data.tsx`) bundles all of it plus device info (a new
`expo-device` dependency, a library that reports things like device model/OS version) and live
permission state into a JSON file, handed off via the OS "share sheet" (Android's built-in "share
to..." menu — the same system dialog you see sharing a photo to another app) — same manual,
user-driven pattern as the existing data exports, so it needs no change to the no-network-by-default
guarantee (§33.2, meaning: CoinFlow never silently phones anything out over the internet by default;
this diagnostics file is something the user must explicitly choose to create and hand off themselves,
via whatever app they pick in the share sheet). Verified end-to-end on a physical Samsung device:
share sheet opens with the correct file, and the JSON content was confirmed accurate field-by-field,
including the pipeline-health timestamp firing for real from a live on-device reconciliation sweep.
No new `IMP-0xx`/`UI-0xx` — a diagnostic/support surface, not a product-facing acceptance criterion.

## F1 — Automatic transaction detection

This is the first feature table in the document, so a quick walkthrough of what each column means:
**IMP** is the requirement's ID (from `SPEC-implementation.md`). **Criterion** is the plain-English
rule being enforced. **UI-0xx** cross-references the matching design requirement in
`SPEC-UI-UX.md`, when one exists (a `—` means this particular requirement is purely technical, with
no direct UI counterpart to link). **Component/service** names the actual source file(s) that
implement it. **Test kind** says what category of automated check exists — here, `unit`.

**Plain-English: what a "unit test" is.** A unit test is a small, automated piece of code, written
by a developer, whose only job is to call one specific function or small piece of logic with a
known input and check that it produces the expected output — automatically, in milliseconds,
without a person clicking through the app by hand. `npm test` runs the whole collection of these.
They're the cheapest, fastest, most narrowly-scoped kind of automated test used in this project;
later sections introduce two broader kinds — RNTL component tests (F11) and Maestro end-to-end
flows (the Audit section) — which check successively more of the real app at once, at the cost of
being slower and more complex to write.

A "pending Suggestion" is CoinFlow's own domain term (defined in `SPEC/idea.md`/`SPEC-implementation.md`)
for a detected-but-not-yet-confirmed transaction — something the app *thinks* it saw in an SMS but
hasn't yet been added to the user's actual transaction history (the "ledger," i.e. the permanent
record of real, confirmed transactions) until the user taps to confirm it.

| IMP | Criterion | UI-0xx | Component/service | Test kind | Test id / file | Status |
|---|---|---|---|---|---|---|
| IMP-001 | A qualifying SMS creates exactly one pending Suggestion and writes nothing to the ledger. | — | `src/domain/parser/parse-sms.ts` · `src/services/tasks/sms-ingest.ts` | unit | `src/domain/parser/parse-sms.test.ts` (corpus, 47 cases) · `src/services/tasks/sms-ingest.test.ts` (IMP-001 block) | Pass |
| IMP-002 | A non-qualifying SMS (OTP, promo, balance-only, request-money, non-matching sender) creates no Suggestion. | — | `src/domain/parser/ignore-rules.ts` · `src/constants/sms-senders.ts` · `src/services/tasks/sms-ingest.ts` | unit | `src/domain/parser/parse-sms.test.ts` (ignore-gate fixtures) · `src/services/tasks/sms-ingest.test.ts` (IMP-002 block) | Pass |

(A test "corpus," as in "47 cases," just means a curated collection of realistic sample inputs —
here, 47 real-looking sample SMS messages — that the test runs the code against one by one, to
cover many real-world variations at once rather than just a single example.)

**F1 §17.3 steps 6–8 (account-rule lookup, notification post, self-heal) are now built as part of
F2** — see below. F1 itself (steps 1–5, "create the Suggestion") is otherwise complete.

## F2 — Transaction notification

The rows below use the same "Partial" status the intro's status contract defines — implemented in
part, with a clearly-named piece still missing and a clearly-named condition for when it'll get
finished (here, "needs F3's navigation tree," i.e. it's waiting on a not-yet-built later feature).

| IMP | Criterion | UI-0xx | Component/service | Test kind | Test id / file | Status |
|---|---|---|---|---|---|---|
| IMP-003 | A single-transaction notification shows amount + direction + account. Known account → Save/Add/Discard; new account → Add/Discard only. Body tap opens Confirmation. No confidence indicator. | — | `src/services/notifications/channel.ts` · `categories.ts` · `content.ts` · `post.ts` | unit | `src/services/notifications/content.test.ts` · `post.test.ts` | Partial — content/actions/posting done; **`Add`/body-tap → Confirmation sheet needs F3's navigation tree (§28), not built yet** |
| IMP-004 | With 2+ pending Suggestions, notifications are delivered as one group that opens the Review queue (no per-item Add/Discard on the group). | — | `src/services/notifications/post.ts` (`refreshGroupSummary`) | unit | `post.test.ts` | Partial — group-summary content/count logic done; **native OS-level stacking not available** (see note below); "opens the Review queue" needs F11, not built yet |
| IMP-005 | Adding a Suggestion (via Confirmation or the notification's `Save`) writes the transaction, removes it from the queue, and upserts its `AccountRule`. | — | `src/services/notifications/respond.ts` (`handleSave`) | unit | `respond.test.ts` | Pass for the notification-`Save` path; the Confirmation-sheet path is F3 |
| IMP-007 | Dismissing a Suggestion (queue or notification) removes it permanently and adds nothing. | — | `src/services/notifications/respond.ts` (`handleDiscard`) | unit | `respond.test.ts` | Pass for the notification-`Discard` path; the queue-swipe path is F11 |
| IMP-009 | Suggestions and their notifications survive an app kill / device reboot. | — | `src/services/notifications/reconcile.ts` | unit (gating only) | `sms-ingest.test.ts` (asserts `reconcileNotifications` is called) | Partial — logic built; **on-device kill/reboot verification not automated**, owed manually |

**Known platform/library gap (discovered during implementation, not a product decision):** the
installed `expo-notifications@57.0.16` has no `threadId`/group-key field on
`NotificationContentInput` (the data shape you hand this library to describe a notification), and
its Android builder never calls `Notification.Builder#setGroup()` — this is Android's own native
API call for marking several notifications as belonging together so the OS visually stacks them
under one collapsed summary, the way a phone groups multiple messages from the same chat app. Spec
§31.3/§31.4 assumed this real OS-level nesting under the group summary would just work; it isn't
available through `expo-notifications` as installed, without writing native code beyond the "SMS
bridge only" module surface D24 deliberately restricts this project to (i.e., a decision was made
early on to keep native/platform-specific code to the bare minimum needed for the SMS-reading
feature, and this notification-grouping gap is a side effect of that boundary). Individual and
summary notifications post correctly (right content, right count) but appear as separate entries,
not a collapsed stack. Documented in `src/services/notifications/post.ts`.

**Patched (2026-09-03/04), on-device stacking behavior not yet visually confirmed.** Rather than
leave this as a permanent library limitation, patched `expo-notifications`' Android source directly
(`ExpoNotificationBuilder.kt`'s `build()` function — a Kotlin file inside the library itself) to
call `setGroup()`/`setGroupSummary()` (the real native Android grouping API mentioned above) —
grouping is inferred entirely from data already flowing through the pipeline (`categoryId` of
`txnKnown`/`txnNew` for individual notifications, `data.kind === "group"` for the summary), no new
JS-side field needed. Saved via `patches/expo-notifications+57.0.16.patch` (`patch-package`, the
same "save a patch to a third-party library and auto-reapply it on every install" tool already
introduced above, wired into `postinstall` — an npm lifecycle script that automatically runs right
after every `npm install` — already), so it survives `npm install`; needs re-checking if
`expo-notifications` is ever upgraded to a newer version, since the patch is written against this
exact version's source code and a newer version's code might not match it anymore. Confirmed the
patched code actually compiles into the app: this native module ships as a **precompiled AAR from
a local Maven repo** by default (**Plain-English:** an "AAR" is Android's packaged-binary format
for a reusable library — like a `.zip` of already-compiled code rather than raw source; "Maven
repo" here just means a local folder acting as a library storage location. Shipping a
"precompiled AAR" means the Kotlin source is normally *not* recompiled at all — the app just uses
an already-built binary version of the library) per its own `expo-module.config.json` (a
config file the library ships that tells Expo's build tooling how to link it in), not "autolinked
from source" (autolinking is Expo's mechanism for automatically wiring a native module into the
Android build without manual configuration; "from source" would mean actually recompiling the
Kotlin files). This matters here because it means: editing the Kotlin file alone silently does
nothing to the real app, since the build was still using the old precompiled binary, not the
edited source — had to add `expo.autolinking.android.buildFromSource: ["expo-notifications"]` to
`package.json` to force a real source build (i.e., explicitly tell the build system "no, actually
recompile this one from the edited source code"), then verified the new `coinflow-txn-group` string
constant (a literal piece of text added as part of the patch, used here purely as a fingerprint)
landed in the built APK's "dex" (Android's own compiled-bytecode format that all app code — Kotlin,
Java, etc. — ultimately gets translated into; finding the new string there proves the edited source
really did get compiled in, not just sitting unused in a source file). What's **not yet done**:
actually triggering 2+ pending Suggestions on-device and visually confirming Android collapses them
under the summary — this session got the patch built and proven-compiled but got pulled into two
other on-device bugs before testing the visual result.

**Category identifiers changed from spec:** `txn-known`/`txn-new` → `txnKnown`/`txnNew` (no
hyphen). A notification "category" here is `expo-notifications`' own concept for a reusable bundle
of action buttons (e.g. Save/Add/Discard) registered once under an ID string and then referenced by
that ID whenever a matching notification is posted — `expo-notifications`' own
`setNotificationCategoryAsync` docs warn that `:`/`-` in a category id "might not work as expected".
Pure identifier-string change, no behavior difference. See `src/services/notifications/categories.ts`.

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
route ("pushed route" = a new screen navigated to and placed on top of the navigation stack, the
normal way moving from one screen to another works in this kind of app, as opposed to a "sheet"
popup or a tab switch). Both currently live flat under `src/app/` rather than the eventual
`(tabs)/` group (§28.1, the bottom-tab-bar section of the app) since the full tab shell isn't built
yet.

**Plain-English: what "RNTL" is, the second test kind in this document.** RNTL stands for
"React Native Testing Library." Where a plain unit test (introduced in F1, above) calls a single
function directly, an RNTL test renders an actual UI component in a simulated, in-memory version of
the screen (no real phone or emulator involved) and then interacts with it the way a user would —
"find the button labeled Save and tap it," "check that this text is now visible" — and asserts on
the result. It's slower and more involved than a unit test, but it catches bugs that only show up
once several pieces of UI are wired together, which a narrow unit test can't see.

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
`jest.config.js` (Jest's own configuration file) didn't transform `lucide-react-native`, the icon
library (**Plain-English: "ESM-only export"** — modern JavaScript packages can ship code in two
different formats, older CommonJS ("CJS") or newer "ECMAScript Modules" (ESM); Jest's default
setup only knows how to run CJS code out of the box without extra configuration, so an ESM-only
package needs to be explicitly told to be transformed/translated before Jest can run it). This also
required handling the package's `"react-native"` package.json "export condition" (a way a package
can declare "when you're bundling for React Native specifically, use *this* file instead of the
default") — both fixed by adding entries to `transformIgnorePatterns` (Jest's list of which
`node_modules` packages should still be transformed rather than skipped) and `moduleNameMapper`
(Jest's mechanism for redirecting an import to a different file than the one it would normally
resolve to). Also discovered `@testing-library/react-native@14`'s `render()` function (the RNTL
function that actually draws a component into the simulated screen for a test) is `async` — a real
API change from earlier versions of the library — meaning the test code must `await` its result
before checking anything, unlike older RNTL docs/examples which show it used without `await`.

**Manual verification still owed:** on-device, confirm Review Queue actually lists a real pending
suggestion, that inline Save/Dismiss work, and that the permission banner shows/hides correctly
against real OS permission state.

## F3 — Transaction Confirmation

First use of the sheet system: `SheetHost` (§28.2) is now mounted at the app root
(`GestureHandlerRootView` → `BottomSheetModalProvider` → `<SheetHost/>`, alongside the `<Stack/>` —
these first two are React "provider" components: wrapper components placed near the top of the
app that make some shared capability, here gesture-handling and bottom-sheet support, available to
every screen and sheet nested inside them, without each one having to set it up individually), and
Review Queue's card tap now actually opens it (`sheets.open('confirm', {suggestionId})`) —
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

(**Plain-English: "DB transaction" and "upsert."** A database "transaction" bundles several
separate write operations into one all-or-nothing unit — either every one of them succeeds, or, if
anything fails partway through, all of them are rolled back as if none had happened, so the
database is never left half-updated. "Upsert" is a common shorthand for "insert or update": create
a new row if none exists yet for this account, otherwise update the existing one — used throughout
this document for the `AccountRule` table, which remembers how past transactions on a given account
were categorized.)
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
- Payment method is a 5-option `SegmentedControl` row (a row of side-by-side toggle buttons where
  only one can be selected at a time, like a row of tabs — a common native-UI pattern), not its
  own picker sheet.
- The V-6 discard-guard ("discard-guard" = the safety check that stops you from accidentally losing
  an unsaved edit) is implemented by **disabling** swipe-down/scrim-tap-to-close while the draft is
  "dirty" (a "dirty" form/draft is one that has unsaved changes — the opposite of "clean," meaning
  it matches whatever was last saved; a "scrim" is the semi-transparent dark overlay behind a popup
  that dims the rest of the screen — "scrim-tap" means tapping that dimmed background area, which
  normally closes the popup) while the draft is dirty (forcing the explicit **Cancel** button,
  which does the real dirty-check + discard dialog) rather than intercepting the gesture and
  reopening — see the comment in
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

(**Plain-English:** "soft-delete/restore" means a deleted row isn't actually erased from the
database — it's just flagged as deleted so it stops showing up in normal lists, which is what makes
an "Undo" button possible afterward: restoring just clears that flag again. A "provenance line" is
a small line of text on a transaction's detail screen showing *where it came from* — e.g. detected
automatically from a bank SMS vs. typed in manually — "provenance" being a general word for
"origin/history of where something came from." An "Edit is a no-op" button is a real, tappable
button that's wired up in the UI but whose handler function currently does nothing when pressed —
a temporary placeholder, not a bug, until the real behavior (here, the Edit sheet) gets built.)

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
correct day grouping and subtotals, search narrows results, `FlashList` (a high-performance
scrolling-list component library, a drop-in replacement for React Native's built-in list that
handles very long lists — thousands of rows — much more smoothly) scrolls smoothly with a
non-trivial row count, and delete-then-undo genuinely restores the row.

## F6 — Categories

First P1 feature (`SPEC/PLAN.md`'s own priority tiers — P1 is the second-highest priority tier
after the P0 "must ship in V1" features already covered by F1–F5/F11; a "P2" priority, mentioned
elsewhere in this document, is lower still — a nice-to-have that can slip past V1 if needed). The
repository layer (`src/db/repositories/categories.ts` — `createCategory`,
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
`enableDynamicSizing: true` (**Plain-English:** "dynamic sizing" means the sheet grows to exactly
fit whatever content is inside it, rather than being pinned to a fixed height. "snap points" are the
fixed height(s) a sheet is allowed to rest at, e.g. "half the screen" or "full screen" — Confirm/Add
use fixed snap points; this Category sheet instead uses dynamic sizing, no fixed heights, unlike
Confirm/Add) — that mode requires the
content be wrapped in `@gorhom/bottom-sheet`'s own `<BottomSheetView>` (or `<BottomSheetScrollView>`,
already correctly used by `category-picker-sheet.tsx`), since only those components report their
measured height back into the library's layout state. A plain `<View>` (React Native's ordinary,
generic building-block component — the one everything else nests inside, with no special
sheet-awareness) never does, so
`contentHeight` stayed permanently unset, no snap points could ever be computed, and **+**/row-tap
silently did nothing — `.present()` succeeded, the sheet's content was correctly registered to
render, but it could never compute where on screen to actually put itself. Fixed by swapping the
root to `<BottomSheetView>`. Confirmed via targeted logging (`evaluatePosition` bailing forever on
`detents=undefined` while `contentHeight=-999`) before the fix, then a clean `adb`-driven repro
after it.

> **ELI5:** Think of the sheet library as a moving company that needs to know the size of a box
> before it can decide where to place it in the truck. `<BottomSheetView>` is a box with the
> dimensions printed on the outside, so the movers know exactly where it fits. A plain `<View>` is
> an unlabeled box — the movers can't measure it, so they never place it anywhere at all. Nothing
> crashes; the box (the sheet) just sits forever in limbo, unplaced.

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
close actually finishes. Fixed in `sheet-host.tsx` by serializing the two (**Plain-English:**
"serializing" here means forcing the two actions — closing the old sheet, opening the new one — to
happen strictly one after the other instead of letting them overlap unpredictably): a `dismissing`
ref makes
the effect defer `.present()` while a close is in flight, and the modal's own `onDismiss` callback
(previously just the registry's `close`) now re-checks `current` once the close genuinely
completes — presenting whatever was requested in the meantime, or finalizing the close if nothing
was. General fix, not category-specific: applies to rapid sheet-switching anywhere in the app
(Confirm ↔ Category picker ↔ Add, not just the Categories screen), since it's the shared-modal
timing itself that was racy, not any one sheet's content. (A "race condition," the general name
for this class of bug — two things happening at almost the same time, where the outcome depends on
which one "wins" the race and finishes first — is one of the hardest bug categories to reproduce on
purpose, since it depends on exact timing that varies run to run.)

> **ELI5:** Imagine one elevator (`BottomSheetModal`) shared by every floor's popup screens. You
> press the button to send it down (closing the current sheet) and, before it's finished moving,
> someone immediately calls it back up for a different floor (opening a new sheet). The elevator's
> control panel only checks "which floor am I being called to?" the instant it's fully stopped and
> the doors are opening — if the new call came in mid-ride, it was already forgotten about, and the
> elevator just sits there empty once it arrives, going nowhere further. The fix teaches the panel
> to remember "oh, someone else wants me too" and act on it once the current ride finishes.

**Third, smaller fix, same pass:** the chevron (`>`) on each Categories row was purely decorative
(had no `onPress` "touch handler" — the piece of code that runs when something is tapped; without
one, a tap on that element simply does nothing at all) — visually the most "tappable"-looking part
of the row, but tapping it did
nothing (confirmed via video: a tap ~60px off a delete button's trash icon landed on the chevron
instead and silently failed). Fixed by making the chevron open Edit too, same as the row itself, so
there's no "dead zone" (a part of the screen that looks interactive but doesn't respond to touch —
a common source of user confusion, since visually it invites a tap) at the row's right edge.

**Fourth bug, next video, general (not category-specific):** hardware/gesture **back** — the
physical or on-screen Android back button/gesture every Android phone has, independent of anything
inside the app itself — while any sheet was open did nothing to the sheet itself — confirmed via
video, several consecutive back
presses on an open Edit-category sheet with zero effect — and instead fell through to whatever's
behind it: the underlying route, or, with nothing left to pop (in navigation terms, "popping" means
removing the current screen and returning to the previous one on the stack; "nothing left to pop"
means the user was already on the first/root screen), straight out of the app entirely to
the phone's home screen (also caught on video, from within a Confirm/Add sheet). Root cause: none
of `@gorhom`'s sheet, `SheetHost`, or `expo-router` intercepted (caught and handled before anything
else could) the Android back button — the sheet
is an "overlay" (visually drawn on top of everything else, but not part of the underlying screen
navigation), not part of the route stack `expo-router`'s own back handling knows about, so an
unhandled press fell through to the native default (the phone's own built-in behavior, which
doesn't know or care that a sheet is open). Fixed in `sheet-host.tsx` with a
`BackHandler` listener (React Native's own API for reacting to the hardware back button) that
intercepts back presses while any sheet is open. Applies to every
sheet (`add`/`confirm`/`categoryPicker`/`createCategory`/`editCategory`), not just Categories.

> **ELI5:** It's like having a pop-up note taped over a door. Pressing the room's own "go back"
> button doesn't know the note is there at all — it just goes back through the door behind the
> note, leaving the note stuck in place (or, worse, walks you straight out of the building if
> there was nowhere else to go back to). The fix teaches the back button to notice the note first
> and deal with *that* before anything else.

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
`add-sheet-draft.ts` and `category-draft.ts` was a "one-way latch" — a switch that can be flipped
from off to on, but never automatically flips back off again, no matter what happens afterward
— any `patch()` call (a small, partial update to the draft, like changing one field) set it
`true` forever, so switching Income → Expense and back to Expense (a net no-op, i.e. the end
result is identical to never having touched it) was wrongly
flagged as an unsaved change, and back correctly followed V-6 but for the wrong reason (there
was nothing to discard). Fixed by snapshotting the seeded values as `_initial` on `open()`
(**Plain-English:** a "snapshot" here just means saving a copy of the starting values so they can
be compared against later) and
recomputing `dirty` as a real diff (comparison) against it on every `patch()` — a field patched
back to its original value now correctly clears `dirty` again, same as it never changed.

> **ELI5:** The old logic was like a smoke detector that, once it's ever beeped even briefly,
> stays beeping forever afterward even after the smoke completely clears — instead of one that
> checks "is there smoke right now?" every time. The fix makes it re-check the actual current
> state against the original, clean state, instead of just remembering "something changed at some
> point."

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
both "cold-start" (the app was completely closed, and tapping the notification is what launches it
fresh) and a "warm tap" (the app was already running in the background, and the notification tap
just brings it back to the front) in one reactive value (a value a React component can read that
automatically triggers a re-render whenever it changes, without the component having to manually
poll or subscribe) — rather than the spec's literal
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
`filter-params.ts` (pure route-param ↔ query serialization — "route params" are the small pieces of
data attached to a navigation URL/route, like `?category=food`; "serialization" here just means
converting the filter's in-memory shape into that flat URL-param text form and back again — unit
tested). Applied filter lives in
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

**Success toast (§30.6/§30.7).** A "toast" (sometimes called a "snackbar") is a small, temporary
message bar that pops up briefly — usually at the bottom of the screen — to confirm something just
happened (e.g. "Added ₹500"), then disappears on its own after a few seconds without the user
having to dismiss it. New `src/stores/toast.ts` (generalized version of `undo.ts`'s
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

**"Test-tier debt"** means: some piece of code was supposed to get a certain *level* ("tier") of
automated test coverage per the project's own rules, but doesn't have it yet — the same idea as
"technical debt" (a shortcut taken now that has to be paid back later), specifically about missing
tests.

**Closed same day (2026-09-03, second pass) — see section D below for how:** RNTL coverage for
`review-queue.tsx`, `transaction-sheet.tsx` (all three modes), `transactions.tsx`,
`transaction/[id].tsx`, `categories.tsx`, `category-editor-sheet.tsx`, `filter-sheet.tsx`; direct
unit tests for `categories.ts`, `account-rules.ts`, `transactions.ts`. The "Pass by construction —
no dedicated test" rows (IMP-006, IMP-008, IMP-010, IMP-017, IMP-019) are now asserted directly —
see each file's own test for which row it covers.

**Still open:** the J4 Maestro flow now exists (`e2e/j4-manual-add.yaml`) but is **unverified**.
**Plain-English: the third and broadest test kind, "Maestro" / "E2E" (end-to-end) flows.** Where a
unit test checks one function in isolation, and an RNTL test renders one component/screen in a
simulated environment, a Maestro flow is a YAML script (a plain, human-readable text file listing
steps) that drives the *entire real app*, running on a real device or emulator, exactly the way a
human tester would: tap this button, type this text, expect that screen to appear next, and so on.
It's the slowest and most realistic tier, and the one most able to catch problems that only exist
once the whole system — real navigation, real database, real native modules — is running together.
"J4" and "J2" are the IDs of specific user "journeys" (a named, multi-step real-world scenario a
user might carry out, e.g. "manually add a transaction from start to finish") defined elsewhere in
the project's plan, each mapped to one Maestro flow file. No device/emulator or Maestro CLI (the
command-line tool that actually runs a `.yaml` flow file) was available in this session to actually
run the J4 flow; treat it as a first draft, not a passing test — a script that's been written but
never actually executed even once, so it may still contain mistakes (like a wrong button label)
that only running it for real would reveal. J2's dependency chain (F1, F2, F11, F3, F8 — meaning: J2
as a user journey requires all of those features to exist first) still isn't fully closed (F8 not
built at the time of this audit), so its flow isn't overdue yet under §9.1 point 2.

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
- `@gorhom/bottom-sheet` "transitively requires" (meaning: not directly, but through one of its own
  dependencies) `react-native-worklets`' native loader — a piece of code that loads compiled native
  functionality — which crashes under Jest, since Jest runs in a plain Node.js environment with no
  real phone/native layer present at all. Fixed via `react-native-worklets/jest/resolver`
  (`jest.config.js`'s `resolver` setting, which controls how Jest looks up which actual file an
  import resolves to) — the package's own Jest-safe resolution helper, not something built here.
- `BottomSheetView`/`BottomSheetScrollView` need an actual mounted `BottomSheet` "context" (React
  Context is a mechanism for sharing a value down through a tree of components without passing it
  as a prop at every level — `useBottomSheetInternal` is a hook that reads from one such context,
  and it throws an error if that context was never set up) that a bare `render()` doesn't provide,
  and isn't what these tests verify anyway — sheet positioning/animation is Maestro's job, not
  RNTL's (the same "which tier" rule mentioned above). Fixed with a manual mock (a hand-written
  fake replacement Jest substitutes in place of the real module), `__mocks__/@gorhom/bottom-sheet.tsx`,
  swapping the layout-measuring wrappers for plain `View`/`ScrollView` — picked up automatically
  by Jest for every test file, no per-file wiring.
- `react-native`'s real `Modal` (which `ConfirmDialog` is built on) renders through an
  `AppContainer`/`RootTagContext` that only exists under a real, fully-booted app root, so its
  content silently
  never appeared in any RNTL query (a "query" in RNTL is a lookup like "find the element with this
  text/role" — used to check what's currently on screen) — Modal-gated content (every discard-confirm,
  delete-confirm) looked absent regardless of `visible`. Fixed with `__mocks__/rn-modal.tsx`, wired via
  `jest.config.js`'s `moduleNameMapper` (introduced above — redirects an import to a different file)
  onto `react-native/Libraries/Modal/Modal` (the exact file
  `react-native`'s own index re-exports it from) — keeps the one behavior that matters
  (gating on `visible`) without the app-root machinery.
- `@testing-library/react-native@14`'s `fireEvent.press`/`.changeText` (the RNTL functions that
  simulate a user tapping a button or typing into a text field) return `Promise<void>` (a
  "Promise" is JavaScript's mechanism for representing a value that isn't ready yet but will be —
  code that needs the result must `await` it) —
  they must be `await`ed or the state update they trigger hasn't "flushed" (fully applied and
  settled) before the next
  assertion runs. Silent failure mode here: the query afterward just sees stale (out-of-date) state,
  not an error message pointing at the real problem.
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
| `app/review-queue.test.tsx` | RNTL | loading/empty states (empty ≠ error), known/new row Save visibility, Dismiss all + confirm count, Save all (no default → picker, confirm count, save) |
| `app/default-category.test.tsx` | RNTL | None/selected states, choosing saves + goes back, None clears |
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

**Plain-English, first: "file-based routing."** `expo-router` (this app's navigation library)
decides which screens exist and what URL each one has by looking at the actual folder/file
structure under `src/app/` — a file at `src/app/categories.tsx` automatically becomes the
`/categories` screen, with no separate manual list of routes to maintain. The "route table" is the
internal list expo-router builds this way of every file it considers a real screen.

Not tied to a single feature, and not introduced by F6.5's own work: `expo export --platform
android` failed with `Unable to resolve module console from
@testing-library/react-native/dist/helpers/logger.js`, tracing back to `src/app/categories.test.tsx`
— a file untouched this session, so the bug predates F6.5. Root cause: every `*.test.tsx` file
co-located with its screen under `src/app/` (the project's existing convention, e.g.
`categories.test.tsx`, `review-queue.test.tsx`) is a valid route-file extension (i.e., expo-router's
rules for "which filenames count as a screen" didn't specifically exclude files ending in
`.test.tsx`), so expo-router's
file-based routing was sweeping them into the route table alongside the real screens, treating each
test file as if it were its own app screen. Metro then
tried to bundle each "as an app route" for every platform; `@testing-library/react-native` pulls in
Node's `console` module (Node.js — the JavaScript runtime web servers/tools run on, as opposed to
the mobile runtime an actual phone app runs in — has some built-in modules, like `console`, that
simply don't exist in that form on a phone), which native (non-web) bundling can't resolve — web
bundling didn't error
on the same import (browser output tolerates it, since a browser environment happens to have
enough of a `console` already) which is why this was invisible in the one export
check any earlier pass had run. Never caught before because no prior pass ran
`expo export --platform android` (or an equivalent native bundling check) after test files started
living under `src/app/`.

Fixed in `metro.config.js` (Metro's own configuration file), not in any test or route file: added
`/\.test\.[jt]sx?$/` (a regular expression — a compact pattern for matching text, here matching
any filename ending in `.test.ts`/`.test.tsx`/`.test.js`/`.test.jsx`) to
`config.resolver.blockList` — Metro's own configurable list of files it should refuse to ever look
at or bundle, no matter what imports/requests it (appended to Expo's own default block-list
entries, not replacing them). Metro now never resolves a `*.test.*` file into any bundle or the
route table, on any
platform. `jest.config.js` is a wholly separate config, read by `jest`/`jest-expo` directly —
Metro's `resolver.blockList` has no effect on it, so its own `testMatch`/`roots` settings (Jest's
own, completely independent way of deciding which files count as tests) still find and run
every test file exactly as before; `npm test` is unaffected (247/247 both before and after).
Verified with `expo export --platform android` (now produces a single 7.2MB `.hbc` bundle — `.hbc`
is the Hermes-engine bytecode format React Native ships as its compiled JS, no
error) and `--platform web` (still 13 static routes, the `*.test` entries that used to leak into
the sitemap are gone too — a side benefit, not the fix's goal).

## F6.5 — App shell & Home

**Status:** ✅ Done (2026-09-03). Step 2 (moving the existing screens into the shell) turned out to
be a byproduct of step 1 rather than its own pass; step 4 ("connect it all to live data") likewise
landed inside step 3 since Home couldn't be built without it. Step 5 ("test it") closed with
276/276 automated tests plus the user confirming the built app end-to-end on a physical device —
tab bar, Home's hero/tiles/action-strip/recent list, and the permission banner all verified
working. Added `SPEC-implementation.md` CR-4 (2026-09-03) to close
the screen-ownership gap this feature fills; see that CR for why it exists. (**Plain-English:**
"CR" stands for "Change Request" — a small, explicitly-numbered amendment to a spec document, made
after that document was already frozen, recording *why* something needed to change and what
changed. `SPEC-implementation.md` accumulates these as `CR-1`, `CR-2`, etc.; several are referenced
throughout this file.)

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

**Real bug found and fixed while building this:** the custom tab bar "floats"
(`position:'absolute'`, a CSS/style setting that takes an element out of the normal layout flow and
positions it independently on top of everything else) rather than "docking" (occupying its own
reserved strip of space that pushes other content up to make room for it), so — unlike the
library's default bar — it does
**not** automatically reserve its own space in each screen's layout; `@react-navigation/bottom-tabs`
only exposes its measured height via a context hook (`useBottomTabBarHeight` — a hook that reads
the tab bar's height from React Context, the same "shared value down the component tree" mechanism
introduced above), which a screen must call itself. Without this, the floating pill would sit on
top of Home's action-strip row and
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
  unit-tested directly; the hooks themselves are "aggregate SQL" (a database query that computes a
  single summary value across many rows, like a total or average, rather than returning the rows
  themselves) + `COALESCE` guards (`COALESCE` is a standard SQL function that returns the first
  non-null value from a list — commonly used to substitute a default, like `0`, when a query would
  otherwise return nothing/`null`), the same class
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
   (`react-hooks/purity`). **Plain-English:** `CLAUDE.md` mentions `experiments.reactCompiler` is
   turned on for this project — it's a build-time tool that automatically optimizes React
   components, but only if they're "pure" (a "pure" function/render always produces the same
   output for the same input, with no side effects or hidden dependence on things like the current
   time). Calling `Date.now()` directly inside a component's render logic breaks that assumption
   (the same render could produce a different result one millisecond later), so the linter (an
   automated code-style/correctness checker, run via `npx eslint` throughout this document) flags
   it as a rule violation, `react-hooks/purity`. Same class of issue as `formatWhen`'s existing
   `now = Date.now()` default parameter — moved the month-label formatting into a new
   `formatMonthLabel(ts = Date.now())` in
   `domain/format/when.ts` so the "impure" (time-dependent) default lives behind an imported
   function boundary instead of inline in the render body, same pattern already established,
   rather than suppressing the lint (i.e., rather than just telling the linter to ignore the
   warning, which would leave the underlying fragility in place).
4. `use-permission-status.ts`'s effect triggered `react-hooks/set-state-in-effect` — another
   linter rule, this one flagging a React effect that updates a component's state synchronously in
   a way that can cause extra unnecessary re-renders — for the same
   reason `review-queue.tsx`'s own (now-duplicated) inline permission check already does — an
   `eslint-disable-next-line` (a comment that tells the linter "skip checking just this one line,"
   used sparingly and always with a reason) with the same justification comment, matching that
   precedent exactly rather than inventing a new pattern.

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
"neutral, hairline, no tint"). ("V-11," like the "V-#" IDs elsewhere in this document, is one of
`SPEC-UI-UX.md`'s own visual-design rule IDs — the design spec's equivalent of an `IMP-0xx`/`UI-0xx`
requirement ID, just for a general visual-language rule rather than a specific screen's behavior.)
Flagged the conflict rather than applying it silently; built a
side-by-side comparison (grey / yellow / a greyscale-emphasis alternative) as a shareable visual
mockup (an "Artifact," in this project's tooling — a small, viewable page built specifically to let
a design choice be judged by eye) so the
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
  `/transactions?filter=uncategorized` — a **dead link** (a link that points somewhere, but the
  destination doesn't actually do anything useful with what was passed to it — the opposite of a
  "broken link," which points nowhere at all; here the screen loaded fine, it just silently ignored
  the part of the link that mattered). `transactions.tsx` never read a `filter`
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
  `categoryId IS NULL AND type='expense'`, "ORed" (combined with a logical OR — matches if *either*
  side of the condition is true) with any selected real `categoryIds` so
  "Food + Uncategorized" still reads as one combined filter.
- **Simplification (documented, not silent):** the Uncategorized chip renders as an ordinary
  toggle chip (filled/selected), not the dashed-outline variant §3.6's catalog describes for it —
  `Chip` doesn't have that variant yet and adding one wasn't required to make the feature work.
  Same category of deferral as the tap-not-swipe delete simplifications elsewhere in this file.

**Test-tier decision (§34.0):** the real branching logic here (the income-exclusion guard, the OR
with `categoryIds`) is SQL condition construction inside a `useLiveQuery`-based hook — the same
class of code this codebase has consistently *not* given a dedicated hook-level unit test anywhere
(`usePeriodSummary`/`useMoMDeltas` in F6.5 for the identical reason: no "in-memory SQLite harness"
— a real, working SQLite database that lives only in memory for the duration of a test, so a test
could run genuine SQL queries against genuine (if temporary) data instead of a hand-written fake —
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
  ("Affordance," used throughout this document, is a design/UX term for any visual cue that
  signals an element can be interacted with — e.g. a trash icon is the "delete affordance"; "no
  delete affordance" means there's nothing on screen inviting a delete action at all, on purpose.)
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
  there is no `IMP-065` row anywhere, and `git log -S "IMP-065"` (a `git` — the version-control tool
  that tracks every change ever made to this codebase — command that searches the entire commit
  history for the exact point where a given piece of text was added or removed, useful for tracing
  when and why something entered a file) shows it entered the doc on
  2026-09-01 (Phase 2/3 drafting), well before this session. Read as a typo for `UI-065`, which
  *does* exist in `SPEC-UI-UX.md` ("Clear all data requires a two-step confirm") and is exactly
  the requirement those two citations are describing. Treated `IMP-044` + `UI-065` together as
  full coverage; left the doc's own typo alone per user instruction (2026-09-03) rather than
  editing `SPEC-implementation.md`.
- **UPI has no assigned icon.** `SPEC-UI-UX.md` §3.4's payment-method icon list only maps
  Card/Cash/Bank transfer/Wallet to a "Lucide glyph" (`CLAUDE.md`'s memory notes mention Lucide as
  the icon set this design uses throughout — a "glyph" here just means one specific icon from that
  set); UPI is named but given none (the prototype's
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
- **`ConfirmDialog`'s `twoStep` prop** (UI-065) — a setting that "gates" the confirm button, i.e.
  keeps it disabled/inert behind an extra required step, matching UI-065's "two-step confirm"
  requirement (an extra deliberate action required before a destructive action like "Clear all
  data" actually happens, to guard against an accidental tap); resets on every closing path
  (confirm/Cancel/scrim/hardware-back — all the different ways this dialog can be dismissed), all
  of which
  already funnel through (are all routed through) two internal handler functions, rather than a
  `visible`-watching `useEffect` (which would need to call `setState` synchronously — immediately,
  in the same tick — from inside the effect body, a pattern this codebase's own lint rule forbids
  because it's a common source of extra, wasted re-renders). No dedicated test existed for
  `ConfirmDialog` itself before this pass; added one.
- **`src/features/settings/export.ts`** (§20.8, D17/IMP-043) — `exportJson()`/`exportCsv()`,
  didn't exist yet. Uses SDK 57's `File`/`Paths` API — the current-generation Expo API for reading
  and writing files on the device, superseding (not the legacy) the older
  `FileSystem.writeAsStringAsync` function, which `AGENTS.md`'s reminder to check current Expo
  docs before writing any code is specifically about avoiding stale-API mistakes like this. JSON =
  the exact §20.8 shape (live rows
  only). CSV (Comma-Separated Values — a plain-text spreadsheet format, one row per line, fields
  separated by commas) = header + one row per live transaction, signed rupees to "2dp" (2 decimal
  places, i.e. paise/cents precision, e.g. `1234.50`) — not the UI's
  Indian-grouped `formatMoney` (the on-screen ₹ format with thousands separators) — a different,
  plainer format §20.8 explicitly calls for),
  `occurredAt` as ISO-8601 local (`ISO-8601` is the standard, unambiguous international date/time
  text format, e.g. `2026-09-03T14:22:00`; "local" means in the phone's own timezone rather than
  UTC), RFC-4180-style quoting (RFC-4180 is the closest thing to an official standard for how CSV
  files should escape tricky characters — wrapping a field in quotes if it contains a comma, quote
  mark, or line break, exactly as done here) for fields containing a comma/quote/
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
`useAnalyticsPeriod`'s Zustand `create()` initializer. (**Plain-English:** Zustand is the small
state-management library this project uses for shared app state that lives outside any one
screen — a "store," created via its `create()` function, holds some value plus functions to update
it, and any component can read from it.) But that store is pulled in through the
`@/stores` "barrel" (a single index file that re-exports everything from a folder in one place, so
other files can import from one location instead of many individual files) `_layout.tsx` imports at
the very top of the app (via `SheetHost`), so its
initializer runs at "module-evaluation time" — the moment the file is first loaded and its
top-level code runs, which for a file imported at the app's root happens essentially immediately on
app start, **before** anything on screen has even rendered yet — **before** `<MigrationGate>` (the
component `CLAUDE.md` describes as blocking first paint until the database is migrated/seeded) has
migrated the DB. A
synchronous `db.select()` there would read an unmigrated (not-yet-set-up, potentially missing
tables/columns) table. Fixed by having the store always
start on the current month/week, and moving the persisted-mode read into the Analytics screen's
own mount `useEffect` instead — it only ever renders after the gate has passed.

**Ambiguities found and resolved, recorded rather than guessed past silently:**

- **§30.12's own navigation text is stale**, the same class of drift F7 already found and fixed
  once: it says category rows link to `/transactions?category=<id>&period=…` and "Fix N" to
  `?filter=uncategorized&period=…`, but the real params (built in F5/F7) are `categoryIds`
  (comma-joined), `uncategorized=1`, and `from`/`to` ("epoch-ms" — a timestamp counted in
  milliseconds since January 1, 1970, the standard reference point most software uses internally
  for representing a specific moment in time) — not those names. Wired to the
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
  `meanDailySpend`/`medianDailySpend`, `dailyChartYMax` ("p95-based outlier clamp" — the 95th
  percentile is the value below which 95% of a data set falls; using it to set the chart's maximum
  height means one single freak huge-spending day can't stretch the whole chart's scale and squash
  every normal day's bar down to nearly nothing — the chart's top is "clamped" to a sensible height
  based on typical days, §26.6),
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
  of `d3-shape`'s `arc()`. **Plain-English: SVG and the "d" string.** SVG (Scalable Vector
  Graphics) is a way of drawing shapes on screen using math/geometry instructions rather than a
  grid of pixels — it stays crisp at any size. An SVG `<path>` element's `d` attribute is a compact
  string of drawing commands ("move here, curve to there," etc.) that defines its exact shape;
  `d3-shape`'s `arc()` function computes that string for you, given the numbers describing an
  arc/donut slice, rather than needing you to work out the underlying trigonometry by hand — it
  returns that path string directly when given no rendering context, meaning it can be used as
  plain math without needing an actual `<canvas>`/browser drawing surface behind it),
  `MeanMedianTile`, `CategoryBreakdown` (donut via `pie()`+`arc()`, ranked list),
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
"mode-hydration" — a component reading back a previously-saved setting when it first mounts, so it
starts in the right state rather than always resetting to a default) with every child component
"stubbed" (temporarily replaced with a bare-bones fake version for the test, so the test isn't
also depending on that child's own internal correctness — each child already has its own separate,
thorough test covering that), since each already has its own thorough test.
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

**Resolved (2026-09-04) — empty-state layout, two stacked bugs, both real.**
User flagged on-device that the empty-period state ("Nothing recorded for September" +
**Add transaction**) rendered oddly — sitting right under the period control near the top, with a
large dead gap below. The 2026-09-03 pass's fix (grouping `PeriodControl` + `EmptyState` inside one
centered `flex:1` `emptyWrap`) never visibly changed anything on-device across many rebuilds, which
was wrongly diagnosed at the time as a Metro cache problem. It wasn't (or wasn't only that) —
two separate, genuine bugs were stacked on top of each other:

1. **The `ScrollView` itself had no `style` prop, only `contentContainerStyle`.**
   **Plain-English:** a `ScrollView` has two separate style slots that are easy to confuse: `style`
   describes the ScrollView's own box on screen (how tall/wide *it* is), while
   `contentContainerStyle` describes the box that holds everything scrolling *inside* it — which
   can be taller than the visible area, that's the whole point of scrolling.
   `contentContainerStyle`'s `flexGrow: 1` only stretches the inner content view to fill the
   ScrollView's *own* bounds — without `style={{flex: 1}}` on the ScrollView itself, it has no
   bounded height to grow into, so `emptyWrap`'s `flex: 1`/`justifyContent: 'center'` had nothing
   to center within. This alone made the whole grouping fix inert from the day it was written.
2. **`EmptyState`'s own root style is `flex: 1, justifyContent: 'center'`** — correct for its other
   three call sites (Home, Transactions, Review Queue), where it's the *sole* content filling an
   entire screen area. Nested as the second child of `emptyWrap` alongside `PeriodControl`, that
   internal `flex: 1` made `EmptyState` greedily claim all of `emptyWrap`'s remaining space for
   itself — `PeriodControl` stayed pinned at the top (its natural size), then `EmptyState` centered
   *its own* content within the large remaining area, independently. From the outside this looked
   identical to "centering isn't happening at all," which is what made bug 1 look like the whole
   story until bug 2 was found underneath it.

> **ELI5:** Think of it like trying to center a picture frame on a wall, inside a room with no
> defined size — you can say "center this on the wall" all you like, but if nobody has told the
> room how big it is, "center" is meaningless, so the frame just sits wherever it lands (bug 1).
> Then, once the room *does* have a size, imagine you also asked one specific piece of furniture
> in it to "take up all remaining floor space and center yourself within it" — forgetting that
> it's sharing the room with something else (the period control) that needs its own space at the
> top. That piece of furniture doesn't misbehave exactly — it does center itself, just within a
> boxed-off area that's bigger and lower than intended, which from across the room looks
> indistinguishable from "nothing is centered at all" (bug 2).

Fix: `ScrollView` in `analytics.tsx` now takes `style={styles.flex}` (`{flex: 1}`). `EmptyState`
(`src/ui/empty-state.tsx`) gained an optional `style?: StyleProp<ViewStyle>` prop, merged onto its
root (`[styles.wrap, style]`) — additive, its three other call sites are unaffected since they pass
nothing. `analytics.tsx` passes `style={styles.emptyState}` (`{flex: 0}`) to opt out of the
greedy-fill behavior only in this one nested usage.

**Why the original Metro-cache diagnosis was a red herring, for the record:** ("red herring" — a
clue or theory that looks promising but turns out to be a distraction from the real cause; common
storytelling/investigation vocabulary, fitting for this document's detective-story bug write-ups.)
Metro (the JavaScript bundler tool, introduced earlier in this document) can keep a background
build process running between rebuilds to make each subsequent rebuild faster, by caching (reusing)
previously-processed results instead of redoing them from scratch — a long-lived Metro
process (10.8GB "resident," meaning that much memory it was actively holding onto, alive since
early in the session across many rebuilds) turned out to be
part of the confusion — `expo run:android` was silently reattaching to it rather than starting
fresh, and even after killing it, wiping `%TEMP%\metro-cache`/`metro-file-map-expo-*` (deleting its
saved cache files by hand), and a full
app uninstall + clean reinstall, the layout still looked unchanged. That *was* real staleness
(stale = out-of-date, not reflecting the latest code), but
fixing it only got as far as proving edits reach the device (via a temporary literal string
swapped into the empty-state message and confirmed rendering — i.e., a deliberately obvious,
unmissable test change, like temporarily changing a message to "TESTING 12345," used specifically
to prove beyond doubt that a fresh build really is running on the device, before spending more time
debugging the actual layout) — the layout itself was still broken after
that, because the actual bug (above) hadn't been touched yet. Lesson for next time: when a visual
fix "doesn't take" across reboots/cache-clears, verify with an unmissable literal marker (not just
re-reading the diff) before spending more effort on the build pipeline than the code.

**Verified on-device (2026-09-04):** period control and empty message now render as one visually
grouped, vertically-centered cluster with even space above and below, confirmed via screenshot on
the physical test device. `npm run typecheck`, `npx eslint`, `npm test` (436/436) all clean.

## F12 — Onboarding & permissions

**The last feature in §9's priority list.** Mostly wiring together things that already existed —
`useOnboarding` (Phase 2, unused until now), `PermissionCard` (built for Settings in F8.5, this
is its second intended consumer), and `deleteCategory`/`reorderCategories` (F6) — rather than new
infrastructure, unlike F9.

**A real routing collision, not just stale spec text this time:** §28.1's own route tree names
step 3 `(onboarding)/categories.tsx` — but `src/app/categories.tsx` already exists (F6, Category
management, reached from Settings). A folder name wrapped in parentheses, like `(onboarding)` or
`(tabs)` (seen earlier in F6.5), is expo-router's own convention for a route *group* — a folder
used purely to organize files and share one layout among them, which adds **no** URL segment of its
own (i.e. a file at `(onboarding)/welcome.tsx` is reachable at `/welcome`, not
`/onboarding/welcome`). So
both files (`(onboarding)/categories.tsx` and the already-existing flat `categories.tsx`) would
resolve to the exact same `/categories` path — a genuine naming collision. Named it
`category-review.tsx` instead —
same screen the spec describes, no clash.

**A second real correctness hazard caught before it shipped — the same class as F9's
`analytics-period` store, but at the *app root* this time, so the "blast radius" (how much of the
app a bug would affect if it went wrong — a bigger blast radius means a worse, more widely-felt
failure) would have been
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

**Post-freeze fix (2026-09-04) — Continue silently never requested anything.** On-device testing
(finally possible once the flicker bug was fixed) surfaced a real behavioral bug, not just a
missing verification: `permissions.tsx`'s **Continue** button was wired to the exact same handler
as **"Skip for now"** — both just called `router.push('/category-review')`. §6.1's own text ("two
stacked permission cards ... **Continue** (always enabled)") reads that as intentional — permission
requests happen only via each card's own **Allow**/**Enable** button — but that's not how a user
actually uses this screen: someone who taps the big primary **Continue** button (the expected,
common path) sailed through onboarding with SMS access never actually granted, with no indication
anything was skipped. Fixed by splitting the two buttons: **Continue** now requests every
still-askable permission (`sms !== 'granted' && smsCanAskAgain`, same for notifications) via the
same `requestSmsPermissions()`/`Notifications.requestPermissionsAsync()` calls each card's own
button already used, `refresh()`es status, then navigates; **Skip for now** goes back to being a
plain `skip()` that only navigates. A permanently-denied permission is left alone by Continue —
it never opens system settings on its own, only the card's explicit action does that.

**Verified on-device (2026-09-04):** fresh install, tapped Continue on the permissions step —
both the real Android "Allow coinflow to send and view SMS messages?" and "send you notifications?"
dialogs fired in sequence, both grants took, onboarding completed normally with SMS access
actually active (no permission banner on Home afterward). `permissions.test.tsx` rewritten (9
tests, up from 6) to cover Continue requesting/skipping per permission state and Skip requesting
nothing. `npm test` 434 → 436 (combined with the migration-gate fix below), typecheck/lint clean.

---

**F1–F12 are now all built.** Every feature in `SPEC/PLAN.md` §9's priority list has a
`SPEC/traceability.md` entry. What's left before calling V1 done is the accumulated on-device
verification debt this file has been tracking pass over pass (F8.5, F9, and now F12 most
urgently — onboarding is the one every fresh install actually depends on), plus `SPEC/PLAN.md`
§11's final quality review pass across Product / UX / UI / Technical / Specification.

## Post-freeze fix — E7's "Try again" button was a no-op in production (2026-09-03)

Found during a post-completion codebase sweep, not a feature pass: `src/db/migration-gate.tsx`'s
`MigrationErrorScreen` (E7/E8, §32.2) wired its **Try again** button to `DevSettings.reload()` —
a React Native developer-tools function that tells the "dev Metro server" (the bundler running on
a developer's own computer, serving fresh JavaScript to the app live over the network while it's
being developed) to send a fresh copy of the app's code and restart it,
which only works while the JS bundle is served that way. In a real installed build
(the finished app a real user installs, with the JS bundle already baked in — no developer's
laptop involved at all)
there is no dev server, so for an actual user who ever hit this screen, the one recovery action
offered would have silently done nothing — worse than no button, since it looks actionable
(the affordance concept introduced earlier: it *looks* interactive, but doesn't actually do
anything, which is more confusing than a screen with no button at all).

**Fix isn't `expo-updates`' `reloadAsync()`** as the removed TODO comment (and §32.3's own prose)
assumed — checked the SDK 57 docs before touching this (per `AGENTS.md`), and `expo-updates`'
`reloadAsync()` actively rejects with an error code, `ERR_UPDATES_DISABLED`, unless a real "OTA
update channel/URL" is configured — "OTA," Over-The-Air, refers to a mechanism for pushing app
updates directly to installed copies of the app without going through an app store, which requires
its own separate setup this app deliberately doesn't have (§12 step 6 / D20: direct-install APK, no
Play Store, no auto-update channel). Installing `expo-updates` just to get a restart button would
also have meant a new native dependency and another `expo run:android` rebuild for something that
doesn't need one: `reloadAppAsync()` (from the base `expo` package, re-exported from
`expo-modules-core`, already installed, no new native code) does exactly this — "reloads the app
... using the same JavaScript bundle that is currently running," explicitly documented to work in
both release and debug builds, unlike `DevSettings.reload()`. Swapped it in; `§32.3`'s own prose
("`expo-updates` `reloadAsync` in release") is now stale against this and worth a pass if that
section is ever revisited, but not edited here since this fix only touched the one screen.

**Update (2026-09-04):** the Sentry TODO on this file is now resolved — see "Sentry crash
reporting wired up" below. The "Export a copy" TODO is still open, on purpose: it'd need a
raw-file export path distinct from `export.ts`'s live-rows JSON/CSV (§20.8) — a corrupt DB can't
be read through the normal repository layer at all.

**Test added** (no test existed for this file before): `src/db/migration-gate.test.tsx` (4 cases —
resolving/renders-children, error screen blocks children, and a named regression test for this
exact bug: Try again calls the production-safe reload, not a dev-only API). `npm test` 430 → 434,
typecheck and `expo lint` clean.

**Not yet verified on-device** — same standing gap as everything else in this list; this path only
triggers on a genuine migration/DB-open failure, which hasn't been reproduced on a real device in
this project.

## Sentry crash reporting wired up (D34, 2026-09-04)

**Plain-English, before this section: what "crash reporting" actually is.** When an app crashes
on a user's phone, the developer normally has no way of knowing it happened at all — the user
didn't file a ticket, there's no error log sitting on any server. "Crash reporting" tools exist to
close that gap: a small library sits inside the app and, when something goes badly wrong, packages
up details about the failure (what kind of error, roughly where in the code) and sends that report
over the internet to a monitoring service, so the developer finds out. Sentry is the specific
third-party crash-reporting service this app uses. Because this involves sending data off the
device, it's the one deliberate exception to CoinFlow's usual "no network access" design (§33.2
mentioned earlier) — which is exactly why it's off by default and gated behind an explicit opt-in
toggle, and why so much of this section is about scrubbing sensitive details out before anything is
ever sent. A "DSN" (Data Source Name) is Sentry's own term for the private URL/API-key combination
that tells the app which Sentry project to send reports to. A "breadcrumb" is Sentry's term for a
small log entry recorded along the way (e.g. "user tapped Save") that gets attached to a crash
report to help reconstruct what led up to it — like actual breadcrumbs marking a trail.

D34 (§33.4) specced crash reporting but it was never actually implemented — `app.json`'s plugin
config, DSN, and native Gradle (Android's own build-configuration system)/`sentry.properties`
scaffolding existed (from `expo prebuild`, the step that generates the native Android/iOS project
files), but
no code anywhere called `Sentry.init()` (the function that actually turns Sentry on and starts it
listening for crashes), so nothing could ever transmit regardless of the setting.
Built the missing pieces:

- **`src/lib/log.ts`** (new) — the `log.debug/info/warn/error` facade (a "facade" here means a
  simple, unified front-door function that internally decides what to actually do — the rest of
  the codebase just calls `log.warn(...)` without needing to know or care whether crash reporting
  is on) + `redactError()` /
  `scrubText()` from §32.1 (currency, "VPA" — Virtual Payment Address, the @-handle style ID used
  by UPI, India's bank-to-bank payment system, e.g. `name@bank` — and long-digit-run stripping, so
  things like account numbers don't leak into a report; >40-char literal collapse, meaning any
  single unbroken chunk of text longer than 40 characters gets shortened/redacted, on the theory
  that legitimate code identifiers are rarely that long but a leaked SMS body or account string
  might be).
  `warn`/`error` forward to a pluggable crash sink (the place that actually receives and forwards
  these log messages onward — "pluggable" meaning which sink is used can be swapped) only outside
  `__DEV__` (a global flag that's `true` during development and `false` in a real built app — so
  none of this fires while a developer is just working on the code locally) and only while
  "armed" (the project's own term, used throughout this section, for "crash reporting is currently
  turned on and actively initialized").
- **`src/services/crash/index.ts`** (new) — `armCrashReporting(enabled)`: calls `Sentry.init()`
  (DSN from `extra.sentryDsn`, `tracesSampleRate: 0` — turns off Sentry's separate performance-
  tracing feature entirely, sending zero performance data, only crash data,
  `enableAutoSessionTracking: false`, `sendDefaultPii: false` — "PII" is Personally Identifiable
  Information, e.g. name/email/device ID; turning this off tells Sentry's own SDK not to
  automatically attach any of that to a report) or `Sentry.close()` (shuts it back down); `beforeSend`/
  `beforeBreadcrumb` (hook functions Sentry calls right before actually sending a report or
  recording a breadcrumb, giving this app one last chance to inspect/modify/block it) implement
  the full
  §33.4 table, including the "fail-closed drop" — a safety principle meaning: if in doubt, refuse
  to send rather than risk sending something sensitive (the opposite of "fail-open," which would
  let something through by default) — an event whose `exception.value` (the crash's own error
  message text) still matches a
  currency/VPA/digit pattern after scrubbing is dropped entirely, not partially sent.
- **`src/db/migration-gate.tsx`** — reads `crashReportingEnabled` once at startup (§22.4) in the
  existing post-migration effect and arms/disarms accordingly; both TODO comments replaced with
  real `log.warn`/`log.error` calls.
- **`src/app/data.tsx`** (Settings › Data) — a "Crash reporting" toggle, the exact copy from
  §33.4 ("Send anonymous crash reports…"), calling `armCrashReporting()` immediately on flip.

**Deviation from D34's "no onboarding step" line, at the user's explicit request:** a third
`PermissionCard` (kind `'crash'`) was added to onboarding step 2
(`src/app/(onboarding)/permissions.tsx`) alongside SMS and Notifications, so crash reporting can
be turned on during onboarding, not only from Settings › Data later. D34's original reasoning for
skipping an onboarding step — "nothing transmits by default, so no disclosure is needed" — still
holds as a *default*; this doesn't weaken it, it just offers the opt-in earlier. The card has no
OS dialog, no denied/permanently-denied state (it's an app-level setting, not an OS permission):
`onRequest` just writes the setting and arms Sentry, labelled "Turn on" instead of "Allow"/"Enable"
to avoid implying an OS prompt and to avoid a duplicate-label collision with the SMS card's own
"Enable" state. "Continue" does **not** auto-enable it — that stays an explicit tap on its own
card, same as every other opt-in in this app.

**`@sentry/react-native` version left at `~7.11.0`, not bumped to D34's originally-pinned
`~8.24.0`** — CR-2 (above, §37 in `SPEC-implementation.md`) already corrected this at scaffolding
time; `7.11.0` is the SDK 57-compatible, Expo-vetted version. Re-verified via
`npx expo install @sentry/react-native`, which re-resolved the same `~7.11.0`.

**Explicitly not built in this pass:** the §32.3 error-boundary system (root `ErrorBoundary`,
per-screen `ScreenErrorBoundary`) doesn't exist anywhere in the codebase yet — out of scope here,
flagged for a future pass. The §33.2(b) no-network grep test (CI check that `fetch`/`XHR`/
`WebSocket` only appear inside `src/services/crash/`) was also left for later.

**Tests added:** `src/lib/log.test.ts`, `src/services/crash/index.test.ts` (scrub rules, the
fail-closed drop, breadcrumb filtering, arm/disarm "idempotency" — a property meaning "doing the
same thing multiple times in a row has the same effect as doing it once," e.g. arming crash
reporting twice in a row shouldn't double-initialize it or misbehave), plus new cases in
`data.test.tsx`, `permissions.test.tsx`, `migration-gate.test.tsx` for the toggle/card/startup
wiring. `npm test` 446 → 469, typecheck and `expo lint` clean.

**Not yet verified on-device** — USB was disconnected before this pass; the toggle, the
onboarding card, and an actual scrubbed event reaching Sentry all still need a real-device check
next session.

## Root error boundary built (§32.3 / E20, 2026-09-04)

Follow-up to the Sentry pass above, which flagged this as explicitly not built. Designed first —
three tonal/information-density options prototyped in
`design-prototype/01-midnight/recovery-screens.html` (Quiet / Reassurance + details / Illustrated,
none yet in `SPEC-UI-UX.md`), reviewed, and **Option B (reassurance + details) chosen**, with the
prototype's reassurance footer line ("Scrubbed before it's ever shown…") dropped per the user's
call — the disclosure box's own presence already implies that, the extra line was redundant.

- **`src/features/app-shell/root-error-boundary.tsx`** (new) — **Plain-English: what an "error
  boundary" is, and why it's a "class component."** Normally, if any piece of a React app throws
  an uncaught error while rendering, the *entire* app crashes to a blank white screen — one broken
  component takes everything down with it. An "error boundary" is a special component that wraps
  around a section of the app and can catch an error from anything inside it, showing a fallback
  recovery screen instead of a total crash — the same idea as a circuit breaker in a house's
  electrical panel, containing a fault instead of letting it take out the whole building. Modern
  React code is almost always written as "function components" (the `function MyComponent() {...}`
  style used everywhere else in this codebase) using hooks like `useEffect`/`useState`, but error
  boundaries are the one remaining exception: as of React 19 (this project's React version, per
  `CLAUDE.md`), there is still no hook-based way to catch a rendering error — it can only be done
  with the older "class component" style (`class MyComponent extends Component {...}`), specifically
  by implementing its two special lifecycle methods, `componentDidCatch`/`getDerivedStateFromError`
  (built-in methods React calls automatically when something below this component throws). Mounted
  in `_layout.tsx` just inside the providers, wrapping
  `MigrationGate` and everything below it, so it catches a crash from `MigrationGate` itself, the
  navigator, or any sheet. On catch, renders `RecoveryScreen` and calls `reloadAppAsync()` (from
  `expo`, not `expo-updates`) on "Reload app" — the same already-tested choice from
  `migration-gate.tsx`'s "Try again" fix (`expo-updates`' `reloadAsync()` rejects on this app,
  which has no OTA channel, D20). This also finally closes the stale prose §32.3 itself flagged
  ("`expo-updates` reloadAsync in release") back when that migration-screen fix was made.
- **`src/features/app-shell/recovery-screen.tsx`** (new) — the "presentational" Option B screen
  (a "presentational" component's whole job is just displaying UI from the data/props it's handed —
  no data-fetching or business logic of its own, that all lives in the error boundary component
  above it): shield icon, "Your data is safe.", a collapsed "Technical details" disclosure (exception name +
  op, `redactError`-scrubbed) that only ever shows a "Ref" line when there's a **real** Sentry
  event id to show — never a placeholder. Reporting off → no event was sent → no Ref, by
  construction, not by a UI toggle. "Copy details" (`expo-clipboard`, newly installed — needs a
  native rebuild before it works on-device, same as every native module added this session) puts
  the same scrubbed text on the clipboard for pasting into a note or cross-referencing the Sentry
  dashboard.
- **`src/services/crash/index.ts`** — added `captureBoundaryError(error)`, a dedicated path
  (not `log.error`) because the boundary needs the real Sentry event id back and must send the
  crash exactly once. Refactored the shared send logic into `sendToSentry()` so both this and the
  existing generic `capture()` (used by `log.ts`'s sink) go through the same scrub +
  `beforeSend`/`beforeBreadcrumb` pipeline. Returns `null` whenever reporting is off, by design.

**Tests added:** `root-error-boundary.test.tsx`, `recovery-screen.test.tsx`, plus new
`captureBoundaryError` cases in `crash/index.test.ts` (off → null + no Sentry call; armed → tagged
`op: boundary`, real event id returned; never double-reports). `npm test` 469 → 482, typecheck and
`expo lint` clean.

**Test-suite flakiness noticed while verifying, unrelated to this change:** a "flaky" test is one
that sometimes passes and sometimes fails with no code change in between — the opposite of a
reliable test, and a common annoyance in real projects since it erodes trust in "red = something's
actually wrong." a handful of RNTL
suites (`confirm-dialog.test.tsx` among them — untouched by this pass) intermittently time out on
their *first* test (`Exceeded timeout of 5000 ms`) when the full suite runs, with a different set
of files failing each run and passing individually every time. Reads as Jest "worker" (Jest runs
many test files in parallel using separate worker processes, to finish faster) cold-start
contention (multiple workers all starting up and competing for the machine's resources at once) on
this machine under the full 58-suite parallel run, not a real regression — worth a
look eventually (raising the default timeout, or `--maxWorkers`), not fixed here.

**Not yet verified on-device** — same standing gap as the rest of this session's Sentry work, plus
`expo-clipboard` specifically needs a native rebuild (`expo run:android`) before "Copy details"
does anything on a real device; it's a no-op today only because nothing has crashed yet.

## Closing the remaining §32/§33 deferrals (2026-09-04, third pass)

Closed the three items the two entries above explicitly deferred, minus the screen/sheet-level
error-boundary system (user said leave that one). No design step needed — none of the three touch
UI.

**1. "Export a copy" escape hatch (§32.3), the one `TODO` left in the codebase.** (An "escape
hatch," used here and in general software-design vocabulary, is a deliberate last-resort way out
of a broken normal path — like a literal emergency exit — for the rare case everything else fails.)
New
`exportRawDatabaseCopy()` in `src/features/settings/export.ts` — unlike `exportJson`/`exportCsv`,
which read rows through the Drizzle repository layer (impossible against a DB that won't even
open), this copies the raw `coinflow.db` file straight off the filesystem
(`expo-file-system`'s `File`/`Directory`, same current-SDK API `export.ts` already uses) to
`Paths.cache`, then hands it to the OS share sheet exactly like the other two. Wired into
`migration-gate.tsx`'s `MigrationErrorScreen` as a second, de-emphasized text action below "Try
again" — matching that screen's existing plain-text-link style rather than introducing a full
`Button`. Throws (caught, shown as an inline "Couldn't export a copy" line, logged via
`log.warn`) if there's no `coinflow.db` file to find. Does **not** bundle the `-wal`/`-shm`
sidecar files — a documented simplification; the main file is the one overwhelmingly likely to
hold the recoverable data, and zip-bundling three files for a rare escape hatch wasn't worth a
new dependency.

**2. The §33.2(b) no-network grep test.** A "grep test" (named after the classic Unix `grep`
text-search command) is an automated check that doesn't actually run any code — it just scans
source files as plain text, looking for a forbidden pattern, and fails the test if it finds one.
New `src/__tests__/no-network.test.ts` — walks (reads through, file by file)
`src/domain`, `src/db`, `src/features`, `src/services` (excluding `src/services/crash/`, since
that folder is the one deliberately-sanctioned exception that's allowed to make network calls, to
reach Sentry) and
fails on a real `fetch(`/`XMLHttpRequest`/`WebSocket`/`axios` call in any of them — these are all
different JavaScript ways of making a network request, and finding any of them outside `crash/`
would mean the no-network guarantee had been silently broken somewhere (a
`describe.each` — a Jest feature for generating one repeated test per item in a list — over every
file found — 74 files scanned tonight — so a future violation names
the exact file, not just "somewhere"). Patterns are "call-shaped" (`\bfetch\s*\(`, a regular
expression matching the word `fetch` only when immediately followed by an opening parenthesis, as
in an actual function call — not bare
`fetch`) specifically so the test doesn't "false-positive" (wrongly flag something that isn't
actually a problem) on `beforeBreadcrumb`'s own `'fetch'`
category-name string literal or comment prose like "re-fetch" — verified against the existing
codebase, which has zero hits outside `crash/`.

**Unplanned side effect: `@types/node` was missing from the project entirely.** The no-network
test's `fs`/`path` imports (Node.js's built-in file-system and path-handling modules — needed here
specifically to walk the source folders as plain files, distinct from anything the actual app ships
with) don't typecheck without it (`TS2591` is TypeScript's own numbered error code for this exact
situation — Node's "ambient module declarations" — type information describing what a module like
`fs` looks like, written as `declare module "fs"`, that TypeScript needs even though it never runs
that module's real code — only exist once the separate `@types/node` package is installed).
Added it as a "devDependency" (a package needed only for development/tooling — writing and
building the app — never bundled into the actual shipped app), and added an explicit
`"types": ["node", "jest"]` to `tsconfig.json`'s
`compilerOptions` — plain `npm install` alone didn't make `tsc` (the TypeScript compiler/typechecker)
pick it up (worth a look
eventually, not chased down further tonight since the explicit `types` field is itself a normal,
supported fix, not a workaround). Re-ran the **full** project typecheck after adding it — clean,
so nothing that depended on TypeScript's old implicit global-`@types` scan (JSX, `__DEV__`, etc.)
broke.

**3. Left alone, per explicit instruction:** the §32.3 screen- and sheet-level error boundaries
(`<ScreenErrorBoundary>`, the sheet-throw-closes-with-a-toast behavior) — only the root boundary
exists, from the previous entry.

**Tests added:** cases in `export.test.ts` (raw copy + share, throws cleanly with no file) and
`migration-gate.test.tsx` (button press → export call; failure → inline error, not a crash;
never touches seed/purge), plus `no-network.test.ts` itself. `npm test` 482 → 561 (482 + 74
no-network cases + 5 new), typecheck and `expo lint` clean.

**Test-suite flakiness, re-checked:** still present, and confirmed **not** caused by anything in
this pass — reproduced with `no-network.test.ts` explicitly excluded (6 unrelated files timed out
that run, none of them touched tonight). Machine-load flakiness, not a regression; same
conclusion as the entry above, now double-verified.

**Not yet verified on-device** — "Export a copy" specifically needs a real corrupt-or-unmigratable
database to trigger the screen at all, which is awkward to fake without device access; the no-network
test is a static check and has no on-device component.

---

## Post-F12 polish pass (2026-09-18) — CR-13 / UI-UX CR-2

On-device fixes: onboarding **Continue** now offers the crash-report opt-in via a "Send crash
reports?" dialog (default still OFF; see `SPEC-implementation.md` §37 CR-13 and `SPEC-UI-UX.md` §9
CR-2) — `permissions.tsx` + 4 new/updated tests in `permissions.test.tsx`; `DateTimePicker`
(`src/ui/date-time-picker.tsx`, own test) replaces typed date/time fields in the transaction sheet;
parser no longer keeps a trailing `;` in account names (corpus fixture `hard-semicolon-after-name`);
suggestion-card dismiss uses an `x` icon. Typecheck clean; affected suites (parser, date-time-picker,
onboarding permissions) pass. **Not yet re-verified on-device.**

### App icon & splash (2026-09-18) — CR-14 / UI-UX CR-3

Plain ₹ (Manrope Bold, off-white on `#0B0B0C`) replaces the template icon/splash; `app.json`
backgrounds updated; splash overlay now shows `splash-icon.png`. Typecheck clean. **Not yet seen
on-device** — needs `npx expo prebuild --clean` + `npm run android`.

**Sheet dismissal fixes (2026-09-18), verified on device:** swipe-down on a clean Add sheet used to close it and immediately re-open it (`onDismiss` re-presented while `current` was still set); a plain close also left the shared draft `active`, so the next Add could start from stale data; swiping the category picker dismissed only visually. A fourth, found by repeatedly opening Add: closing with **Cancel** re-presented the sheet with no content (or with the keypad pushed off-screen) — same root cause, a stale `current` in `handleDismiss`. All four fixed in `sheet-host.tsx`; 22 alternating swipe/Cancel open-close cycles (10 slow, 12 fast) all rendered correctly. Checked on a Samsung SM-S711B: clean swipe closes and stays closed, edited sheet blocks the swipe (amount kept, Discard dialog on Cancel), picker swipe returns to Add, reopened Add seeds a fresh draft. Confirm-from-notification not exercised on device (needs a real SMS).

### Missed-SMS backstop cadence (2026-09-19) — CR-15

Background reconcile: 24h default + hard-coded network requirement → **3h minimum, no network constraint** (`patches/expo-background-task+57.0.16.patch` + `minimumInterval` in `src/services/tasks/index.ts`). Static checks only so far; **not yet verified on-device** (needs `prebuild --clean` + a device to inspect the scheduled job / `smsLastReconcileSweepAt`).

### SMS-store watcher (2026-09-19) — CR-16

**Store watcher (CR-16):** new Kotlin `SmsStoreJobService` (JobScheduler content-trigger on `content://sms`) → headless `CoinflowSmsStoreChanged` → `reconcileMissedSms({ source:'storeTrigger', lookbackMs: 6h })`; re-armed on every JS start / app open / periodic task. Periodic background sweep interval **3h → 12h** (final number; the no-network patch from CR-15 stays). Per-path "first catch" counters + `smsLastStoreTriggerAt` added to Send Diagnostics. Tests: `catch-stats.test.ts` (new), extended `sms-ingest.test.ts`, `sms-reconcile.test.ts`, `diagnostics.test.ts`. **Not yet verified on-device** — needs `prebuild --clean` + rebuild; then `adb shell dumpsys jobscheduler` should list a pending job for `SmsStoreJobService`, and `smsLastStoreTriggerAt` should stamp after a real SMS.

---

## V2 — splits & widgets (planned 2026-09-19) — CR-17 / CR-18 / CR-19 / UI-UX CR-4 / CR-5

**Status: specified, nothing built.** Source plan: `SPEC/V2-PLAN.md`. Every row below starts as **Not started**; it flips to `Pass` only under the contract at the top of this file (implemented + the test tier it names, green), and `Partial` only with a named trigger. Auto split detection (F17) is **v2.1** and has no rows yet.

**Features:** F13 Split (manual, local) · F14 Settlements & merge · F15 Split-request messaging · F16 Widgets (design-gated by UI-099) · F17 Auto split detection (v2.1, deferred).

**Phase 0 items still open (recorded so they are not forgotten):** widget-approach spike (D42 addendum in §44.1) · SMS send/receive spike on the real phone · widget prototype approval (UI-099) · open defaults: default SIM (D41), hide-amounts default off (D44), Balance = Income − Spent (D43/UI CR-5).

### Behaviour rows (`IMP-0xx | criterion | UI-0xx | component/service | test kind | test id / file | status`)

| IMP | Criterion | UI | Component / service | Test kind | Test id / file | Status |
|---|---|---|---|---|---|---|
| IMP-070 | Split invariant: amount = your share + Σ shares; shares > 0 | UI-072 | src/domain/split.ts (`validateSplit`); `splits` repo | unit + repo | split.test.ts, splits.test.ts | Pass |
| IMP-071 | Equal split in whole paise; remainder to you | UI-072 | src/domain/split.ts (`equalShares`) | unit (property) | split.test.ts | Pass |
| IMP-072 | Percent → paise by largest remainder, sums exactly | UI-072 | src/domain/split.ts (`percentToMinor`) | unit (property) | split.test.ts | Pass |
| IMP-073 | Effective spending everywhere; identical to V1 with no splits | UI-075, UI-081 | analyticsRepo fragments (§41); Home/Analytics | unit + repo (V1 fixtures unchanged) | analytics.test.ts (V1-parity + split cases); domain analytics.test.ts unchanged | Pass |
| IMP-074 | Effective income nets settlements; debit settling a request ≠ spending change | UI-074 | analyticsRepo fragments; `settlements` repo | unit + repo | analytics.test.ts, settlements.test.ts | Pass |
| IMP-075 | Settlement capped by remaining + unallocated; no leftover flow | UI-077 | src/domain/settlement.ts (`allocate`) | unit | settlement.test.ts, settlements.test.ts | Pass |
| IMP-076 | Share/split status derived, never stored | UI-074 | src/domain/split.ts (`shareState`, `splitState`) | unit | split.test.ts, splits.test.ts | Pass |
| IMP-077 | Person identity by normalised number; contacts optional | UI-071 | src/domain/person.ts; `persons` repo; People picker | unit + RNTL | person.test.ts, persons.test.ts, split-sheet.test.tsx (contacts) | Pass (unit) — typed numbers, saved people and the contacts picker; on-device pending |
| IMP-078 | Request SMS: GSM-7, ≤160, token, readable without CoinFlow | UI-073 | src/domain/split-message.ts (`encodeRequest`) | unit (round-trip, fuzz) | split-message.test.ts; send-requests.test.ts (the real text) | Pass |
| IMP-079 | Strict decode, numeric sender only, never a bank suggestion, never the Sent box | UI-079 | split-message.ts (`decodeRequest`); `smsIngestTask` request branch | unit + integration | split-message.test.ts, person.test.ts, sms-ingest.test.ts, receive-request.test.ts | Pass (unit) — ingest branch + inbox-only rule; on-device **Pass** (2026-09-20, Samsung ↔ Motorola): a bank SMS became a suggestion, never a request; the Sent box was not re-ingested |
| IMP-080 | Idempotent receipt per (sender, ref); update / withdraw; rate limit | UI-079 | `split-requests` repo; receive-request.ts | repo + unit | split-requests.test.ts, receive-request.test.ts | Pass (unit) — repository rules + the ingest branch; on-device **Pass** (2026-09-20, Samsung ↔ Motorola): repeated sends of one ref left one row |
| IMP-081 | Per-recipient send results; SMS-app fallback; split never lost | UI-073 | src/services/splits/send-requests.ts; `SmsSender.kt` | unit (mocked native) + manual | send-requests.test.ts, split-sheet.test.tsx | Pass (unit) — on-device **Pass** (2026-09-20, Samsung ↔ Motorola): send, per-recipient result, SMS-app fallback (SEND_SMS denied + user-fixed) |
| IMP-082 | Received request stored Unattended; headless Accept/Reject; silent reject | UI-079 | notification category `split-request`; `NOTIFICATION_RESPONSE_TASK` | unit + manual | split-requests.test.ts, split-notifications.test.ts | Pass (unit) — Unattended storage + headless Accept / Reject; on-device **Pass** (2026-09-20, Samsung ↔ Motorola): received with the app closed, stored Unattended, Accept → You owe. Swipe-away and in-app Reject Pass; the notification's Accept/Reject buttons not verified (see the phase 5 table) |
| IMP-083 | Merge = one DB transaction; undoable | UI-077 | `settlements` repo (`settle`/`unsettle`); Merge sheet | repo + RNTL | settlements.test.ts; merge-sheet.test.tsx; settle-and-announce.test.ts | Pass — Merge sheet + Undo; on-device ✔ (2026-09-20) |
| IMP-084 | Soft-delete/Undo hides split & settlements; purge cascades | UI-074 | schema FKs; purge job (§20.6) | repo | splits.test.ts, settlements.test.ts, maintenance-v2.test.ts | Pass |
| IMP-085 | Suggested settlement is only a suggestion | UI-077, UI-078 | src/domain/suggest-settlement.ts | unit | suggest-settlement.test.ts | Pass |
| IMP-086 | Additive migration; V1 DB unchanged | — | migration `0002_v2_splits` | migration snapshot | migration-v2.test.ts | Pass |
| IMP-087 | Clear all data / Export include V2 tables | UI-065 | maintenanceRepo; export | repo | maintenance-v2.test.ts, export.test.ts | Pass |
| IMP-088 | Only ref/amount/note/sender stored; never the body | — | receive-request.ts | unit | split-requests.test.ts (no body column) | Pass |
| IMP-089 | Editing split amount recomputes your share; blocked if < 0 | UI-070 | src/domain/split.ts (`recomputeYourShare`); Edit sheet | unit + RNTL | split.test.ts, splits.test.ts, transaction-sheet.test.tsx | Pass |
| IMP-090 | Widget snapshot v1 published, debounced, on every change + sweeps | UI-091, UI-092 | src/services/widgets/publish.ts | unit + manual | publish.test.ts; on-device QA | Built (unit) — on-device pending the rebuild |
| IMP-091 | Widgets render from snapshot only | UI-090 | Kotlin providers | manual | on-device QA | Built — on-device pending the rebuild |
| IMP-092 | Widget taps → add / review[?open] / root links, cold start | UI-092, UI-093 | providers; `src/app/add.tsx`; deep-link handling | unit + manual | widget-links.test.tsx; on-device QA | Built (unit) — on-device pending the rebuild |
| IMP-093 | Hide amounts masks ₹ figures, never labels | UI-094, UI-095 | snapshot `hideAmounts`; providers | unit + manual | publish.test.ts; on-device QA | Built (unit) — on-device pending the rebuild |
| IMP-094 | Past-month snapshot renders — | UI-097 | providers (`periodEndMs`) | manual | on-device QA | Built — on-device pending the rebuild |
| IMP-095 | Three providers registered with previews | UI-090 | app.plugin.js; `res/xml/widget_*_info.xml` | manual | on-device QA | Built — manifest verified after prebuild; picker check pending on-device |
| IMP-096 | Widget Balance = Analytics month card | UI-091 | publish.ts via analyticsRepo | unit | analytics.test.ts; publish.test.ts (widget Balance = month Income − Spent) | Pass |
| IMP-097 | No permissions beyond IMP-098 | — | app.json / plugins | build check | manifest assertion | Not started |
| IMP-098 | SEND_SMS / READ_CONTACTS optional, just-in-time | UI-071, UI-080 | Split sheet; Settings › Splits & people | RNTL + manual | split-sheet.test.tsx, splits-people.test.tsx, send-requests.test.ts | Pass (unit) — on-device **Pass** (2026-09-20, Samsung ↔ Motorola): SEND_SMS is just-in-time; denied → SMS-app fallback |

**Phase 1 (data & domain) — built 2026-09-19:** migration `0002_v2_splits`, five tables, `src/domain/{split,settlement,person,split-message,suggest-settlement}.ts`, repositories `persons` / `splits` / `settlements` / `split-requests`, `maintenance.ts` + export extended. +234 tests (844 total, all green), typecheck and lint clean. Rows below are updated where phase 1 satisfies them; the rest close in the phase named.

**Phase 2 (effective-amount analytics) — built 2026-09-19:** `effectiveAmountSql` in `analytics.ts`; every total, the arc, the category breakdown, biggest expenses and the daily series use it; V1 results proven identical when nothing is split; credits can no longer be split (UI-UX CR-8 / impl. CR-21). +15 tests (859 total).

**Phase 3 (Split UI) — built 2026-09-19:** Split sheet (People → Amounts), Split row in Confirm / Edit with the IMP-089 amount rule, Details split card with waive / restore / edit / remove, list badges. +107 tests (966 total). Deviations recorded in UI-UX CR-9. **Driven on a real phone over adb; four defects found and fixed with regression tests (see impl. §45.8).**

**Phase 4 (Settlements & Splits page) — built 2026-09-20:** Merge sheet (from a payment / from an item), settle-with-Undo, Suggested-settlement banner (Details + Confirm), Details Settlements section, Splits page (Owed to you / You owe / Requests, Show settled, `?tab=`), Home "Owed to you" row, dev-only sample request. +62 tests (1,035 total). Deviations recorded in UI-UX CR-10 / impl. CR-22. **Driven on a real phone with Maestro (2026-09-20); one defect found and fixed (Undo window 3 s → 5 s).**

**Phase 5 (Messaging) — built 2026-09-20:** request branch in SMS ingest, `split-requests` channel + `splitRequest` category with headless Accept / Reject, stale-tap routing, `SmsSender.kt` + `SEND_SMS`, send orchestration with the SMS-app fallback, Split-sheet contacts section and result list, per-person resend on Details, Splits › Requests actions, Home "N split requests" row, Settings › Splits & people. +85 tests (1,120 total). Deviations in UI-UX CR-11 / impl. CR-23. **Needs the native rebuild, then a second phone for the round trip.**

### Visual rows (UI-UX §7)

| UI | Criterion | Verified by | Status |
|---|---|---|---|
| UI-070 | Split… in Confirm/Edit/Details; row shows "Split with N" | split-sheet / transaction-sheet / [id] RNTL | Partial — Split… + row done (debits only, CR-8/9); "Merge into a split…" closes with the Merge sheet (phase 4) |
| UI-071 | People stage: search, chips, saved, contacts row, add a number | split-sheet.test.tsx | Partial — search, chips, Saved people, Add a number done; Contacts row closes with contacts access (phase 5) |
| UI-072 | Amounts stage: You first, equal default, ₹|%, Remaining gating | split-sheet.test.tsx, split-draft.test.ts | **Pass** |
| UI-073 | Send result list; failure never discards the split | split-sheet.test.tsx | **Pass** (unit) — on-device Pass 2026-09-20 ("Sent"; fallback opens the SMS app) |
| UI-074 | Details: Split card + Settlements section | [id].test.tsx | **Pass** (unit) — Split card + Settlements section (`[id].test.tsx`) |
| UI-075 | List rows: split badge + "Your share" | transaction-card.test.tsx, split-badge.test.ts | **Pass** |
| UI-076 | Splits page: 3 segments, grouped, empty states, Show settled | src/app/splits/index.test.tsx | **Pass** (unit) — on-device ✔ (2026-09-20) |
| UI-077 | Merge sheet: open candidates, Suggested, caps, no leftover | merge-sheet.test.tsx | **Pass** (unit) — on-device ✔ (2026-09-20) |
| UI-078 | Suggested-settlement banner | [id].test.tsx, transaction-sheet.test.tsx | **Pass** (unit) — on-device ✔ (2026-09-20) |
| UI-079 | Request notification: Accept/Reject, channel, grouping, Unattended | split-notifications.test.ts, deep-link.test.ts, splits/index.test.tsx | **Pass** (unit) — on-device: request received, Unattended, Accept + settle, swipe-away, in-app Reject Pass 2026-09-20; notification action buttons no-op on the debug build — re-check on a release build |
| UI-080 | Settings › Splits & people | splits-people.test.tsx | **Pass** (unit) — row present on device; page contents not walked through |
| UI-081 | Home "Owed to you" row only when > 0 | (tabs)/index.test.tsx | **Pass** (unit) — on-device ✔ (2026-09-20) |
| UI-090 | Three widgets in the picker | design-prototype review (widgets) + on-device | Not started |
| UI-091 | Money summary content/sizes | design-prototype review (widgets) + on-device | Not started |
| UI-092 | Queued transactions content + taps | design-prototype review (widgets) + on-device | Not started |
| UI-093 | Quick add opens the Add sheet (cold start too) | design-prototype review (widgets) + on-device | Not started |
| UI-094 | Hide amounts masks ₹ figures | design-prototype review (widgets) + on-device | Not started |
| UI-095 | Labels never masked | design-prototype review (widgets) + on-device | Not started |
| UI-096 | Greyscale tokens only | design-prototype review (widgets) + on-device | Not started |
| UI-097 | Past-month widget shows — | design-prototype review (widgets) + on-device | Not started |
| UI-098 | Settings › Widgets page | design-prototype review (widgets) + on-device | Not started |
| UI-099 | Design gate: widget designs approved before implementation | design canvas review | **Pass** (approved 2026-09-19, CR-6) |

### Default category + Save all (2026-09-20) — CR-25 / UI-UX CR-12

| ID | Criterion | Component / service | Test | Status |
|---|---|---|---|---|
| IMP-100 | Settings › Default category stores `defaultCategoryId`; a deleted category counts as unset. | `app/default-category.tsx`, `resolveDefaultCategory` | `default-category.test.tsx`, `settings.test.tsx` | Pass |
| IMP-101 | Save all with no default opens the picker instead of saving. | `app/review-queue.tsx` | `review-queue.test.tsx` | Pass |
| IMP-102 | Save all confirms with the count, then saves every complete pending item in one DB transaction. | `respond.ts` `handleSaveAll` | `review-queue.test.tsx`, `respond.test.ts` | Pass |
| IMP-103 | Debits take the account's learned category else the default; credits stay Uncategorized (IMP-011); no account rule is written. | `respond.ts` `handleSaveAll` | `respond.test.ts` | Pass |
| IMP-104 | Incomplete suggestions stay pending and are reported as skipped. | `respond.ts` `handleSaveAll` | `respond.test.ts` | Pass |
| UI-100 | Save all button + confirm dialog in the Review Queue footer; Default category row in Settings. | `review-queue.tsx`, `settings.tsx` | on-device | **Pass** on-device 2026-09-20 (Samsung, real queue: 4 saved — debits Food, credits uncategorized) |

### On-device verification — phase 5 messaging & phase 6 widgets (2026-09-20)

Two phones: Samsung SM-S711B (Jio, +91 9390787053) and Motorola edge 60 pro (VIL, +91 9742590888), debug dev client, Metro running.

| Check | Result |
|---|---|
| Samsung → Motorola request, received on first app open (inbox sweep) | Pass — ₹400 Unattended, "not in your people" |
| Accept → *You owe* → pay (₹400 expense) → Merge → Settle | Pass — settlement card on the expense, "Paid … ₹400" |
| Motorola → Samsung: split ₹300, Send requests | Pass — "Sent"; arrived; recorded on the Samsung ~2 s later with the app closed (₹150, `unattended`) |
| Repeated sends of one ref | Pass — one `split_request_in` row for `qdkwa5` on the Samsung |
| SEND_SMS denied (+ `user-fixed`) → reminder | Pass — nothing sent (Sent box unchanged), "Open with" chooser → Messages, thread with the recipient, text pre-filled; not sent |
| Bank SMS never becomes a request | Pass (observed) — Canara Bank SMS are suggestions; only numeric senders produce requests |
| Save all with a default category (Samsung, real queue) | Pass — see UI-100 |
| Swipe-away of the request notification keeps it Unattended | Pass — notification gone from the shade, `split_request_in` row still `unattended` |
| Reject (in-app, Requests tab) | Pass — row → `rejected`, hidden from Requests, its notification dismissed, "Request rejected · Undo" |
| Notification **Accept / Reject buttons** (headless) | **Not verified — no effect on the debug dev client.** The tap reached the app (`actionIdentifier: ACCEPT`, correct `requestId`), `coinflow.NOTIFICATION_RESPONSE` started and finished ~3 ms later, no JS log, the row stayed `unattended` (`updatedAt` unchanged) and the notification stayed in the shade. Matches the phase-0 warning that the debug client does not reliably host headless JS. **Re-check on a release-style build**; if it still does nothing there, it is a bug (fix as a patch) |
| Widgets: three widgets present, visuals | Checked informally by the user on the Samsung; taps, live update, Hide amounts, cold start, month rollover **not yet verified** |

Notes: a plain `pm revoke` of SEND_SMS is not a valid denial test on the Motorola — the app re-requests and it is granted without a dialog; add `pm set-permission-flags --user 0 <pkg> android.permission.SEND_SMS user-fixed`. The Motorola's number is 9742590888; 9845897555 (the earlier assumption) was an old SIM.

