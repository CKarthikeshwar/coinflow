# CoinFlow — UI/UX Specification

> **Scope.** Screens and visual elements only — layout, visual states, shared visual language.
> Feature behavior, product rules, data, SMS parsing, categorization, and analytics computation
> live in `SPEC-implementation.md`; cross-references use its `F#` / `J#` ids. (**Plain-English:**
> "scope" means what this document does and does not cover. This document is the *look and feel*
> spec — what things are on screen, where they sit, what they look like, and what they do when you
> tap them. It does **not** cover how the app decides *what* a transaction is, how it reads SMS
> messages, or how numbers get calculated — that lives in the separate `SPEC-implementation.md`
> file. Where the two documents talk about the same feature, this doc points at it using a short
> code — an "id" — like `F3` or `J2`, which is just a label so both documents can refer to the
> exact same thing without repeating its whole description.)
>
> **Status: Frozen** (v1, finalized). **Plain-English:** "frozen" means this spec is finished and
> locked — it is not a draft, and nobody should casually change it while building the app. Any
> further change has to go through a formal, tracked "change request" (see §9), not just be edited
> in passing. "v1" means "version 1", i.e. the first shipped release of CoinFlow; anything not in
> v1 is explicitly pushed to a later release ("Future" or "deferred", both used in this document to
> mean "not in this release").
>
> The visual design is locked against the coded prototype at `design-prototype/01-midnight/` (dark,
> black-and-white). **Plain-English — what a "prototype" is:** before any of this got written down
> as a spec, the designer actually built a set of real, clickable HTML pages (`screens.html`,
> `p0-screens.html`, `p1-screens.html` inside that folder) that look and behave like the finished
> screens, but without any of the real app logic behind them — no real database, no real SMS
> reading. This is different from a "wireframe" (a rough box-and-line sketch of a layout, with no
> real visual styling) and different from the final app (which has the real underlying code). A
> coded prototype sits in between: it looks pixel-for-pixel like the finished product, so everyone
> — designer, developer, reviewer — can open it in a browser and see and click through exactly what
> is being asked for, before anyone writes the real application code. This document was then
> written by *describing in words* everything that prototype already shows, so the description can
> be checked, referenced by an id, and handed to whoever builds the real app.
>
> §3 "Design System" (see the plain-English explanation of that term at the top of §3 below) is
> *extracted from it* (`SPEC/PLAN.md` §4–§6) and every subsection is frozen: §3.1 colour, §3.2 type
> (Manrope + Geist — the two font families used everywhere, explained in §3.2), §3.3 spacing /
> elevation, §3.4 iconography (**Lucide**, an icon set — the small pictograms like a magnifying
> glass or a trash can), §3.5 motion (how things animate), §3.6 component catalog (the reusable
> building blocks like buttons and cards), §3.7 `theme.ts` reconciliation (lining this spec up with
> the actual code file that stores these values). Changes from here are change-requests, not open
> questions — i.e. once this document says something is decided, treat it as decided; if reality
> later demands a change, it goes through the formal §9 change-request process instead of being
> silently edited. Implementation follows `SPEC-implementation.md` (the next document in the chain,
> which turns this visual spec into buildable technical requirements). References live in
> `design-references/` (`screen1.png` / `screen2.png` — real photographs/screenshots of other apps
> collected as inspiration, separate from the coded prototype above).

> **V2 amendment (2026-09-19, CR-4 / CR-5 in §9).** V2 adds **split payments** (Track A) and **home-screen
> widgets** (Track B) — see `SPEC/V2-PLAN.md`. New screens are §6.17–§6.24, new acceptance criteria
> `UI-070`–`UI-099` in §7, and a short "**V2 (CR-4)**" pointer sits at the end of each V1 screen section a V2
> feature touches. Everything else in this document is unchanged. **The widget layouts in §6.22–§6.24 are
> PROVISIONAL until you approve the widget prototypes** (`UI-099`); no widget code is written before that.

---

## 1. Screen inventory & priority

**Plain-English — what this table is:** this is the master checklist of every screen (and
screen-like thing, like a notification) in the app, in one place, before any of them are described
in detail later. Think of it as a table of contents crossed with a priority list. "Screen
inventory" just means "the full list of screens"; "priority" is how important each one is to have
working for the very first release.

`P0` core loop · `P1` useful V1 · `P2` V1 if time allows.

**Plain-English — the P0/P1/P2 priority tiers:**
- **P0** ("priority zero") — the *core loop*: the small set of screens the app is completely
  useless without. "Core loop" means the repeating cycle of actions a user goes through every time
  they use the app (here: a transaction gets detected → the user reviews/confirms it → it shows up
  in their list). If any P0 screen is missing, the app doesn't work at all.
- **P1** — genuinely useful for the "V1" (version 1, the first real release), but the app would
  still function without it on day one.
- **P2** — a nice-to-have that ships in V1 *only if there's time left*; otherwise it slips to a
  later release without delaying V1.

**Plain-English — the "Type" column** (elaborated fully in §4 Navigation, but previewed here):
this describes *how the screen is presented* on-device — as a full tab you switch between, a page
you navigate "into" and can back out of, a panel that slides up from the bottom over the current
screen, etc. See §4 for the precise behavior of each type; the short version:
- **Tab page** — one of the permanent destinations reachable from the bottom navigation bar (Home,
  Transactions, Analytics, Settings) — switching tabs doesn't lose your place in the others.
- **Pushed page** — a screen you navigate *into*, stacking on top of where you were, with a back
  button/gesture to return — like clicking a link and then using "back".
- **Bottom sheet** — a panel that slides up from the bottom edge of the screen, covering part of
  it, while dimming the rest — used for quick, focused tasks (like adding one transaction) without
  fully leaving the screen you were on.
- **Full-screen step** — one step in a linear, full-screen sequence (used only for onboarding,
  the first-run walkthrough).
- **System surface** — not a screen inside the app at all, but something the phone's operating
  system displays on the app's behalf, such as a notification on the lock screen.

| Screen | Type | Pri | Purpose |
|---|---|---|---|
| Onboarding · Welcome | Full-screen step | P1 | Pitch + a way in. |
| Onboarding · Permissions | Full-screen step | P1 | Grant SMS + notification access. |
| Onboarding · Category review | Full-screen step | P1 | Trim the default category list. |
| Home | Tab page | P0 | Month status + what needs action + recent activity. |
| Review Queue | Pushed page | P0 | Triage detected, unconfirmed transactions. |
| Transaction Confirmation | Bottom sheet | P0 | Review a detected transaction and add it. |
| Add Transaction | Bottom sheet | P0 | Enter a transaction by hand. |
| Edit Transaction | Bottom sheet | P0 | Change an existing transaction. |
| Transactions | Tab page | P0 | The full ledger — scan, search, filter. |
| Transaction Details | Pushed page | P0 | Everything about one transaction. |
| Filter | Bottom sheet | P0 | Narrow the transaction list. |
| Analytics | Tab page | P1 | Where the money went this period, the trend, biggest expenses / accounts, plain-language notes. |
| Categories | Pushed page | P1 | Manage the category set. |
| Create / Edit Category | Bottom sheet | P1 | Define one category. |
| Settings | Tab page | P1 | Configuration hub. |
| Settings · Payment methods | Pushed page | P1 | Reference list of payment methods. |
| Settings · SMS & notifications | Pushed page | P1 | Permission status + enable. |
| Settings · Account rules | Pushed page | P2 | Inspect / edit / delete learned account rules — remembered note + category per account (impl. F8). |
| Settings · Data | Pushed page | P1 | Export, clear all data. |
| Settings · About | Pushed page | P1 | Version, privacy note, links. |
| Transaction notification | System surface | P0 | Route the user into confirmation. |
| Global components | — | P0 | Nav bar, snackbar, banner, empty state, skeleton, confirm dialog. |
| **V2** · Split (sheet, 2 stages: People → Amounts) | Bottom sheet | V2 | Share a transaction between people and (optionally) send them requests. |
| **V2** · Merge (sheet) | Bottom sheet | V2 | Say which split(s) a payment settled. |
| **V2** · Splits | Pushed page | V2 | Owed to you · You owe · Requests (incoming). |
| **V2** · Request notification | System surface | V2 | "X requested ₹N" with Accept / Reject. |
| **V2** · Settings · Splits & people | Pushed page | V2 | Contacts access, your name in requests, saved people. |
| **V2** · Settings · Widgets | Pushed page | V2 | Hide-amounts switch, how to add a widget. |
| **V2** · Widget · Money summary | Home-screen widget | V2 | Balance, income, spent for the month. |
| **V2** · Widget · Queued transactions | Home-screen widget | V2 | Detected transactions waiting for review. |
| **V2** · Widget · Quick add | Home-screen widget | V2 | One tap to the Add sheet. |

---

## 2. Visual direction

**Plain-English — "visual direction":** before getting into exact colours and pixel sizes (§3),
this section states the overall *feeling* the app should have and the handful of big, opinionated
design calls that everything else follows from. Think of it as the mission statement for how the
app should look and feel, which the detailed rules in §3 then implement.

**Light, fast, low-friction — not a "premium banking app".** Effortlessness is the point:
generous spacing (lots of empty breathing room between elements, rather than packing things
tightly), a small type scale (a limited, deliberate set of text sizes — see §3.2) doing the
**hierarchy** work, minimal **chrome**, no dense financial dashboards.

> **ELI5 — "visual hierarchy" and "chrome":** Visual hierarchy is the way a design tells your eye
> what to look at first, second, third — the biggest, boldest thing draws your attention before
> the small quiet stuff, the same way a newspaper headline is bigger than the byline which is
> bigger than the article text. Here, the designers chose to get that effect mostly from varying
> *text size and weight* rather than from boxes, borders, or colour blocks. "Chrome" is a general
> UI term for all the surrounding interface furniture that isn't the actual content — toolbars,
> borders, dividers, icons for navigation. "Minimal chrome" means keeping that framing as sparse as
> possible so the user's own data (their transactions, their balance) is what stands out.

The reference collection (`design-references/`) folds in here later (`SPEC/PLAN.md` §3); until
then the prototype (see the plain-English explanation of "coded prototype" at the top of this
document) proceeds from this written direction.

**No colour.** The interface is **black, white and grey only** — no accent colour (a single
bright, brand-y colour repeated across the app for buttons/links, as most apps have — CoinFlow
deliberately has none), no semantic hues (colours that are *assigned a meaning*, such as "red
always means delete/negative, green always means income/positive" — this app does not do that
anywhere). Direction, state, emphasis and hierarchy are carried by the always-present `+` / `−`
sign, by weight and size, by fill vs hairline (a "hairline" is the thinnest possible visible line —
a 1-pixel border — used for subtle dividers, as opposed to a solid filled block), and by position —
never by hue (hue = the actual colour itself, e.g. "red" vs "blue", as distinct from how light/dark
or saturated it is). See **V-11** (a numbered global rule defined in full in §5 — this document
uses `V-#` codes for its cross-cutting "always true" rules the same way it uses `UI-0xx` codes for
checkable acceptance criteria in §7). **Two sanctioned exceptions:** (1) the Analytics *"Where it
went"* category breakdown (§6.10) uses a fixed category-colour set on its dot / bar / donut (a
"donut" here is a donut/ring-shaped pie chart — see §6.10); (2) the app **ground** (the app's
background, i.e. the very bottom-most layer everything else sits on top of) carries a faint **cool
(blue-grey) ambient wash** — a soft glow behind the top of each screen, settling to near-black
below (§3.1). Both are decorative / ambient (meaning: for atmosphere/mood only) — never a semantic,
category, or state colour, and no foreground element (anything actually sitting on top of the
background — text, icons, cards, buttons) is tinted.

**V1 is dark only.** The approved prototype is `design-prototype/01-midnight/` (Midnight, dark).
A light rendition of the **greyscale ramp** is **deferred to Future** — not a V1 deliverable — so
the app ships one theme and the system does not switch on `prefers-color-scheme` (a setting phones
expose so an app can automatically match the phone's light/dark mode — CoinFlow ignores it for now
and is always dark).

> **Plain-English — "greyscale ramp":** a *ramp* (also called a scale) is an ordered set of shades
> from darkest to lightest — like the rungs of a ladder — used consistently for backgrounds, text,
> and borders instead of picking arbitrary greys ad hoc. §3.1 lists CoinFlow's exact ramp as a
> table of named tokens (see "design tokens" below). A "light rendition" would be the same ramp
> flipped so it goes from light at one end to dark at the other, for a light-mode version of the
> app — not being built for V1.

**Card layout** (`design-references/1.png`, `3.png`). Content sits on rounded surfaces (rounded
rectangle-shaped blocks, as opposed to content just sitting directly on the plain background) with
spacing between them: the balance hero, the Income / Spending tiles, the action strip, and — the
change in `3.png` — **each transaction is its own card**. Day headers on the Transactions list are
plain labels *between* card groups, not inside a card. Every transaction card carries a
**rounded-square icon tile** on the left holding the **category icon** (see §3); an income tile
inverts (light tile, dark glyph — i.e. the little icon square flips to a light-coloured background
with a dark icon on it, instead of the usual dark background with a light icon) to show direction
(money coming in vs. going out) without colour.

---

## 3. Design system

> **Plain-English — what a "design system" is:** a design system is the fixed rulebook of small,
> reusable building blocks a design is made from — exact colours, exact font sizes, exact spacing
> amounts, exact icon style, exact animation timings — plus the catalog of reusable components
> (buttons, cards, sheets) assembled from them. The point of writing it down once, precisely, is so
> every screen in the app reuses the *same* blue-grey, the *same* spacing, the *same* button shape,
> instead of every screen inventing its own slightly-different version. Each individual named
> value in that rulebook (e.g. "the colour used for card backgrounds") is called a **design
> token** — a token is just a named constant, like a variable in code, so instead of writing "the
> hex colour `#16171d`" everywhere, the rest of this document and the real app code refer to it by
> its name, `--surface`. If the exact colour value ever needs to change, it's changed in one place
> and every card that uses `--surface` updates automatically. Tokens appear throughout §3 as
> `--name` (colour/spacing tokens, matching the web-CSS convention the prototype was built with) or
> as named values in `theme.ts` (§3.7) once translated into the real app's code.

Extracted from the approved prototype `design-prototype/01-midnight/` (`app.css` +
`shared/frame.css` — the prototype's own stylesheet files, i.e. where its design tokens are
actually defined in code). **V1 ships one dark theme** (§2). All of §3 is frozen — colour, type,
spacing / elevation, iconography (**Lucide**), motion, the component catalog, and the `theme.ts`
reconciliation.

### 3.1 Colour

**The law.** Foreground is black, white and grey — no accent, no positive / negative / warning
hue, no colour-coded categories (V-11). Direction, state, emphasis and rank are carried by the
always-on `+` / `−` sign, by weight and size, by **fill vs hairline** (a solid filled shape versus
a shape that's just a thin outline), by position, and by greyscale value (how light or dark a grey
is — a lighter grey reads as more important/foreground, a darker grey as more background/quiet).
Depth is a **surface step plus a soft drop shadow + a hairline top edge** on card surfaces (§3.3);
controls stay flat.

> **ELI5 — "elevation" / "depth", "surface step", "drop shadow":** Real-world objects that sit
> physically closer to you (like a card resting on a table) catch more light on their top edge and
> cast a shadow onto whatever is behind them. Interfaces borrow this trick — called **elevation**
> — to make some things (like a card, or a sheet that has popped up) look like they're "floating"
> above the flat background, purely with shading, even though the screen is flat glass. A **drop
> shadow** is the soft dark smudge drawn just underneath/behind an element to sell that illusion. A
> **surface step** means using a slightly *lighter* grey for the "floating" element than the grey
> behind it — the eye reads "lighter = closer to me" — see the `--surface`, `--surface-2`,
> `--surface-3` tokens below, each one step lighter than the plain background. Exact shadow numbers
> are given in §3.3; here it's enough to know cards "lift" and plain controls (buttons, fields)
> deliberately don't — they "stay flat" so the app doesn't look like it's made of stacked plastic
> tiles.

**Ground — a cool ambient wash (V-11 exception #2).** The app background is **not** a flat fill
(one single solid colour with no variation): a radial glow (a soft, roughly circular patch of
brighter colour, fading outward — like a spotlight, using a graphic technique called a "radial
gradient") sits behind the top of each screen and settles to near-black lower down, and the whole
ground is shifted a hair **cool (blue-grey)** ("cool" vs "warm" is a basic colour-theory pairing:
cool colours lean blue/green/purple and feel calmer/more clinical, warm colours lean
red/orange/yellow and feel cosier/more energetic — CoinFlow leans just slightly cool). In code this
is: `radial-gradient(135% 54% at 50% -8%, var(--bg-top) 0%, #0e0f18 42%, #090a0d 100%)` — **Plain-
English:** that line just says "draw a soft circular glow, centred just above the top of the
screen, starting at the `--bg-top` colour and fading through two darker shades down to near-black
by the time it reaches 100% of the way down." This is ambient only — never on a foreground
element, never encoding meaning (it's mood lighting, not a signal that means anything). Surface
tokens are shifted the same faint cool so nothing reads warm against it (i.e. the card colours
below are also nudged very slightly blue-grey, so they match the background's temperature instead
of looking like a mismatched warm-grey pasted on top of a cool background).

The table below lists every colour **token** (named colour — see the design-tokens explanation
above §3.1) with its exact hex code (the six-digit code, like `#16171d`, that any design or code
tool uses to reproduce that exact colour) and what it's used for ("role"):

| Token | Hex | Role |
|---|---|---|
| `--bg` | `#0d0e14` | settled ground (behind the glow); the `scrim`, top-bar & day-header fades resolve over it |
| `--bg-top` | `#1b2238` | the glow hot-spot — cool blue-grey; also the top-bar fade start |
| `--surface` | `#16171d` | raised cards — hero, analytics cards, sheets, the nav pill |
| `--surface-2` | `#1c1e26` | inset fields, control tracks, the segmented-control base |
| `--surface-3` | `#262832` | pressed / selected fill, chip & badge fill, gauge track |
| `--hairline` | `#2b2d38` | every 1 px divider and border — the only "line" value |
| `--text` | `#f5f5f6` | primary text, active icons (kept neutral) |
| `--text-2` | `#9a9aa1` | secondary text, present-but-quiet labels |
| `--text-3` | `#85858c` | tertiary — captions, timestamps, placeholder, disabled, quiet icons |
| `--primary` / `--primary-ink` | `#ffffff` / `#0b0b0c` | the one filled emphasis: primary button, centre **Add**, active toggle, on-dark badge text |

(A quick decoder for the "Role" column jargon: a **scrim** is a translucent dark overlay laid over
the rest of the screen to dim it while a sheet or dialog is focused — see §3.6/§3.5. A **chip** is
a small pill-shaped label, often tappable, like a filter tag. A **badge** is a small marker, often
a number in a circle/pill, showing a count. A **gauge track** is the background groove that a
progress/gauge indicator fills in over — see the Analytics arc in §6.10.)

**Category palette (scoped, the one carve-out — V-11).** Nine desaturated hues (colours with the
intensity/saturation turned down so they look muted and grown-up rather than like bright crayons),
used **only** in the Analytics *"Where it went"* breakdown (ranked-row dot + bar, and the donut —
see §6.10 for what these look like). They read as data keys, not brand — **Plain-English:** the
colours here are functioning like a legend on a map (this colour = this category), not like a
brand's signature colour; they never touch a transaction card, chip, selector, or any other chart.
Uncategorized is a **hatched grey** (a grey filled with a diagonal-stripe crosshatch pattern
instead of a solid colour or fill — a common way to mark "no data / not applicable" on charts),
never a hue.

| Category | Token | Hex |
|---|---|---|
| Bills | `--cat-bills` | `#7fb2e8` |
| Food | `--cat-food` | `#efa98c` |
| Groceries | `--cat-groceries` | `#93ce85` |
| Transport | `--cat-transport` | `#b69be0` |
| Shopping | `--cat-shopping` | `#e6c36b` |
| Entertainment | `--cat-entertainment` | `#e79bc5` |
| Health | `--cat-health` | `#e58f8b` |
| Education | `--cat-education` | `#6fcec0` |
| Other | `--cat-other` | `#9aa0a6` |

### 3.2 Typography

> **Plain-English — what "typography" covers:** typography is everything about how text looks and
> is spaced: which typeface(s) ("family"), how heavy/bold each piece of text is ("weight"), how
> big it is ("size"/"scale"), and how tightly or loosely the individual letters are packed
> ("tracking"/letter-spacing). This section pins down exact values for all of that so every screen
> uses text consistently instead of each screen picking its own sizes.

**Family.** **Manrope** on headings and every figure (amounts, balance, counts, percentages, the
lock-screen clock); **Geist** on all other UI text (body, labels, buttons, metadata). "Family"
here means *typeface* — Manrope and Geist are the (free, open-source) names of the two specific
letterforms/fonts chosen for this app, the same way "Arial" or "Times New Roman" are typeface
names elsewhere; CoinFlow deliberately uses two different ones for two different jobs (big numbers
vs. everyday text) rather than one typeface for everything. Both ship as bundled web/app fonts
(the font files travel inside the app itself, so they always render identically on every device)
with the system stack (`system-ui`, `-apple-system`, …) as the fallback (the phone's own built-in
default font, used only if the bundled fonts somehow fail to load). `Fonts.mono` (a monospaced /
fixed-width font, where every character takes up the same width — handy for things like code or
aligned columns of digits) is reserved but currently unused in-product. `theme.ts` `Fonts.sans` →
Geist, `Fonts.display` → Manrope (see §3.7 for how this maps into the actual app code).

**Case.** Sentence case everywhere (capitalize only the first word/letter, like a normal sentence —
"Add transaction", not "Add Transaction" or "ADD TRANSACTION"). **No** tracked all-caps eyebrow
labels (an "eyebrow label" is a small label that sits just above a heading, like a category tag;
some apps render these in ALL CAPS with extra letter-spacing/"tracking" for a stylized look —
CoinFlow explicitly avoids that style everywhere).

**Weights — four, used deliberately** (never a uniform bold). **Plain-English — "font weight":**
weight is how thick/heavy the strokes of the letters are — a bigger number means bolder/heavier
text, a smaller number means thinner/lighter text. Standard weight numbers run from 100
(extremely thin) to 900 (extremely bold); "400" is what's normally called plain "regular" text and
"700" is a standard "bold". Using only four specific weights, and always for the same *kind* of
text, is part of how this design creates visual hierarchy (see §2) without needing colour.

| Weight | Used for |
|---|---|
| 700 | display figures (amounts, balance), primary-button labels |
| 600 | screen / section / sheet titles, transaction names, day headers, chips |
| 500 | form labels, captions, quiet metadata, secondary values |
| 400 | body copy |

*(300 is reserved for the lock-screen clock only.)*

**Scale** (px · weight · tracking). **Plain-English — how to read this table:** "Size" is the
text's height in **px** (pixels — the tiny individual dots that make up a screen image; a bigger
px number is physically bigger text). "Wt" is the font weight from the table just above. "Tracking"
is letter-spacing — how much extra gap is added between individual letters, measured in **em**
(a unit that scales with the text's own size, so the same tracking value looks proportionally the
same whether the text is small or huge); a *negative* tracking value (like `−0.02em`) pulls letters
very slightly *closer together* than their normal spacing, which is a common trick on large,
bold numerals to keep them looking tight and confident rather than loose:

| Role | Size | Wt | Tracking |
|---|---|---|---|
| Single-transaction amount (V-10) | 44–52 | 700 | −0.02em |
| Balance hero | 46 | 700 | −0.022em |
| Analytics "This month" net | 27 | 700 | −0.015em |
| Title (top bar, section, sheet) | 17–20 | 600 | −0.01em |
| Body | 15 | 400 | 0 |
| Label / secondary | 13 | 500 | 0 |
| Caption (meta rows, timestamps) | 12.5 | 500 | 0 |
| Micro (chips, badges, prev-month) | 11.5 | 600 | 0 |

Negative tracking appears **only** on display figures ≥ 27 px ("display figures" = the large
showcase numbers like the balance or a transaction amount, as opposed to ordinary body text);
body and labels sit at 0 (i.e. normal, unmodified letter-spacing).

**Tabular numerals** (`font-variant-numeric: tabular-nums`, class `.num`) on every amount, count,
percentage and date figure. **Plain-English:** in most fonts, digits have slightly different
widths (a "1" is narrower than a "8"), which is fine for normal reading but makes columns of
numbers look wobbly and misaligned when stacked — e.g. in a list of amounts. "Tabular numerals" is
a font feature that forces every digit, 0 through 9, to take up exactly the same width, so stacked
numbers line up into neat, ruler-straight columns, the same way numbers align in a spreadsheet or
accounting ledger. `.num` is simply the name of the reusable style/class that turns this feature on
wherever it's applied.

### 3.3 Spacing · radius · elevation · layout

**Spacing** — the named scale (`Spacing`, `theme.ts`): `half 2 · one 4 · two 8 · three 16 ·
four 24 · five 32 · six 64`. **Plain-English:** these are pixel amounts (all in px, the same unit
as §3.2's font sizes) for gaps and padding, each given a short name instead of a raw number — so
instead of a developer writing "put 16 pixels of space here" in one place and "put 15 pixels" by
mistake somewhere else, everyone writes `Spacing.three` and gets the exact same 16px every time.
This is the same "design token" idea as the colour tokens in §3.1, just applied to distances
instead of colours. Screen gutter (the empty margin running down the left/right edges of every
screen, keeping content from touching the edge of the phone) = 20 (`--pad`); gap between hero /
strip / cards = 12; card interior (the padding inside a card, between its edge and its content) =
18–22. Prefer the scale to raw numbers (i.e. when building the real app, use the named
`Spacing.*` values above rather than typing arbitrary pixel numbers).

**Radius** — short for "border-radius": how rounded a shape's corners are; 0 is a sharp square
corner, and a bigger number rounds the corner into more of a curve. `pill 999` (nav, chips,
badges, CTAs, toggles) — a radius as large as 999 on a short, narrow shape rounds it all the way
into a full stadium/capsule shape with semicircular ends, which is what "pill-shaped" means (CTA
= "call to action", the standard term for a prominent button meant to be tapped, like "Add
transaction"). `card 24` (hero, analytics cards; sheet top corners 28) — a moderate, soft rounding
used for card-shaped blocks. `control 14` (fields, buttons, filter blocks) · `18` transaction card
· `13 / 11` icon tiles — all smaller, subtler roundings for smaller elements.

**Elevation** — see the "surface step / drop shadow" explanation earlier in §3.1 for what
elevation means conceptually; this is where the exact shadow recipe is pinned down. Card surfaces
(hero, action strip, transaction card, stat tile, analytics card) lift on `card` =
`0 8px 24px rgba(0,0,0,.5), 0 1px 4px rgba(0,0,0,.4)` **plus a hairline top edge**
`1px solid rgba(255,255,255,.05)`. **Plain-English on the shadow codes:** `rgba(0,0,0,.5)` means
"black at 50% opacity" (opacity/alpha = how see-through a colour is; 0 = fully invisible, 1 = fully
solid) — so these are two soft, layered, semi-transparent black shadows stacked to fake a soft,
realistic drop shadow (a tight, dark one close to the card and a bigger, softer, more spread-out
one further out), while the "hairline top edge" adds a barely-visible near-white 1-pixel line
along the top of the card to catch a hint of "light" the way a real raised object would. `pop` =
`0 12px 34px rgba(0,0,0,.6), 0 3px 10px rgba(0,0,0,.45)` for the floating nav and popovers (a
popover is a small floating panel that appears anchored to a control, like a tooltip or a small
menu) — a stronger, more pronounced version of the same shadow trick, making these elements look
like they're floating *higher above* the screen than an ordinary card. Controls (segmented toggle,
chips, fields) stay flat — a 1px inner shadow at most. Nothing else casts a shadow.

**Layout** — max content width 800 (`MaxContentWidth` — on a wide screen, such as the web build or
a tablet, content stops growing past 800px wide and simply centers, rather than stretching
edge-to-edge and looking absurdly spread out); bottom-nav footprint 76 above the home indicator
(the "home indicator" is the thin horizontal bar at the very bottom of an iPhone-style screen used
for the swipe-up gesture; "76" is how much vertical space, in px, the floating bottom navigation
bar reserves above it so it never overlaps that gesture zone); every screen respects top and
bottom **safe-area insets** (the safe area is the part of the screen guaranteed not to be covered
by the phone's own hardware/software intrusions — the notch/status bar at the top, the home
indicator or gesture bar at the bottom; an "inset" is the padding needed to stay clear of them, so
content never gets hidden behind the notch or clipped by the home-gesture bar).

### 3.4 Iconography

**Plain-English — "iconography":** this is just the design term for "the app's system of small
pictogram icons" — the little symbols standing in for words, like a house shape for "Home" or a
magnifying glass for "search". This section pins down which specific icon set is used and how
thick/heavy the icons' lines are drawn.

**Library: [Lucide](https://lucide.dev)** (`lucide-react-native`, ISC-licensed — ISC is a
permissive open-source license, meaning it's free to use with very few restrictions). Lucide is
the specific, pre-made collection ("library") of icons this app draws every glyph from, rather
than commissioning custom-drawn icons. It is the one **line family** (an icon style built entirely
from outlined strokes — hollow line-art shapes — rather than solid filled-in silhouettes) the
prototype's placeholder sprite (a temporary stand-in graphic used while prototyping, before the
real icon package was wired in) was already tracing: ~1.5–2 **stroke** (the thickness of the line
each icon is drawn with, akin to a pen-nib width) on a 24 px **grid** (every icon is designed to
fit inside an invisible 24×24 pixel square, so they all feel like the same "size family" even
though the actual shapes differ), `currentColor` (a technical flag meaning "this icon just inherits
whatever text colour is already active nearby" rather than being hard-coded to one fixed colour —
this is how the icons stay black/white/grey per §3.1 without needing special-casing), `fill: none`
(the icon shapes are hollow outlines, not solid-filled), rounded caps / joins (the ends and corners
of each stroke are rounded off rather than sharp/squared, giving the whole icon set a slightly
softer, friendlier feel) — and it covers everything the app needs (categories, payment methods,
chrome) without a commission (i.e. without needing to pay a designer to custom-draw any icons; the
free library already has everything required). Set `strokeWidth` to **1.6** app-wide (matching
`.app .ic` in `app.css`) so it reads calm at the 42 px transaction tile (i.e. not too thick/heavy
when the icon is blown up large inside a transaction row's icon tile) and stays legible (still
clearly readable, not turning into a blurry smudge) at 18 px inline (i.e. also not too thin when
shrunk down small next to a line of text).

- Category identity (no colour) rests on the icon, so each of the 9 defaults + **Uncategorized**
  (`help-circle`) + **income** (`arrow-down-to-line` / `banknote`) maps to a fixed Lucide glyph;
  the map lives with the category model (`SPEC-implementation.md`). Custom categories pick from the
  same fixed grid (§6.12).
- Payment methods: UPI / Card (`credit-card`) / Cash (`banknote`) / Bank transfer (`landmark`) /
  Wallet (`wallet`).
- Chrome: `home`, `history`, `bar-chart-3`, `sliders-horizontal`, `plus`, `chevron-right`,
  `arrow-left`, `x`, `more-vertical`, `search`, `filter`, `check`, `delete` (backspace),
  `triangle-alert`, `calendar`, `tag`, `bell`, `shield-check`, `trash-2`, `download`.
- The web prototype keeps its inline `<symbol>` sprite (hand-traced Lucide-style — a "sprite" here
  is a single file bundling many small hand-drawn placeholder icon shapes together, used as a
  stand-in in the HTML prototype); the RN build (the real React Native app, "RN" for short) swaps
  in the real package (the actual `lucide-react-native` icon library). Swapping is 1:1 — no
  layout change (each placeholder icon is replaced with its real Lucide equivalent at the exact
  same size/position, so nothing about the screen layout shifts when this happens).

### 3.5 Motion

**Plain-English — what "motion" design means:** this section is about animation — anything that
moves, slides, fades, or bounces on screen (a sheet sliding up, a button dipping slightly when
pressed, a list row sliding away when deleted). Good UI motion isn't decoration for its own sake;
it's a way of giving the user feedback ("yes, that tap registered") or context ("this new screen
came from that direction, and going back will return it the same way").

**Principle.** Motion confirms an action or shows where something came from — never decoration.
Short, **eased**, **interruptible**. **Plain-English:** "eased" means the motion doesn't move at a
constant robotic speed from start to end — it speeds up and/or slows down smoothly, the way real
physical objects do, per an "easing curve" (explained just below). "Interruptible" means an
in-progress animation can be immediately cancelled or redirected by a new user action, rather than
forcing the user to wait for it to finish — the UI should never feel like it's ignoring you while
it finishes a flourish. No **spring overshoot** on functional UI (the splash mark is the one
exception) — a "spring" animation is one that mimics a bouncy physical spring and can briefly
overshoot past its final resting position before settling back, like a rubber band; CoinFlow
avoids that bouncy effect everywhere except its one decorative splash-screen logo animation, to
keep ordinary interactions feeling crisp and businesslike rather than playful. Everything honours
the OS **Reduce Motion** setting: slides and scale become an opacity cross-fade or an instant cut,
and the sheet appears without the slide.

> **ELI5 — "Reduce Motion":** phones let a user turn on an accessibility setting called "Reduce
> Motion" (in the OS settings, not this app) for people who find sliding/zooming animations
> uncomfortable, distracting, or even nauseating (this is a real, common accessibility need, not a
> preference quirk). When that OS setting is on, this app promises to tone its animations down: a
> "slide" (something moving from one position to another) or "scale" (something growing/shrinking)
> becomes either a plain **cross-fade** (the old thing simply fades out while the new thing fades
> in, with no movement) or an **instant cut** (it just appears/disappears immediately, like a
> jump-cut in film editing) — and a bottom sheet still opens, just without its usual slide-up
> flourish.

**Timing.** Each named token below is a fixed duration, in **ms** (milliseconds — thousandths of a
second; for reference, a single eye-blink is roughly 100–150ms), so every animation of the same
"kind" across the whole app takes exactly the same amount of time instead of each screen picking
its own slightly-different speed:

| Token | ms | Used for |
|---|---|---|
| `fast` | 120 | press feedback, segment / toggle thumb, keypad key flash |
| `base` | 200 | dialog & snackbar in / out, tab cross-fade, list row insert / remove, keypad ↔ keyboard swap |
| `slow` | 320 | bottom-sheet slide-up / dismiss, stack push / pop |

**Easing.** An **easing curve** is the exact mathematical "speed profile" of an animation between
its start and end — whether it starts fast and slows down, starts slow and speeds up, or some mix
— expressed here as a `cubic-bezier(...)` value, which is a standard, portable way (used in both
CSS and native app code) of specifying that exact curve shape with four numbers, the same curve
value producing the identical motion feel everywhere it's used. `standard` `cubic-bezier(.2,0,0,1)`
(most moves — a balanced, general-purpose speed profile) · `decelerate` `cubic-bezier(0,0,0,1)`
(entering from an edge — starts fast and glides to a gentle stop, like something sliding in and
settling) · `accelerate` `cubic-bezier(.3,0,1,1)` (leaving — starts slow and speeds up as it exits,
like something being pulled away).

**Transitions.**

- **Bottom sheet** (Add / Filter / Confirmation / Edit / Category picker / Create-Edit Category) —
  slides up from the bottom over `slow` `decelerate`; **scrim** (the dimming overlay laid over the
  rest of the screen behind the sheet — see the "Role" decoder under §3.1's colour table) fades
  0→1 (from fully transparent to fully visible) over `base`. Dismiss reverses with `accelerate`.
  Swipe-down tracks the finger 1:1 (as the user drags a finger down, the sheet moves down by
  exactly the same distance in real time, rather than the animation playing on its own schedule);
  release past ~30% height or with downward velocity completes (letting go once dragged more than
  ~30% of the way down, or letting go with a fast enough flicking motion, finishes closing the
  sheet the rest of the way on its own), else it springs back over `base` (letting go before that
  point instead animates the sheet back up to fully open). A dirty sheet (one where the user has
  typed/changed something and not yet saved it — "dirty" is a common UI term meaning
  "has unsaved changes") routes the dismiss through the discard confirm (V-6 — a confirmation
  dialog asking "discard your changes?" defined as a standing rule in §5).
- **Keypad ↔ OS keyboard** — focusing a text field slides the in-app keypad down/out over `base`
  `accelerate` as the OS keyboard rises, and the amount collapses to its summary bar on the same
  curve; returning to the amount reverses it (§6.4).
- **Stack push / pop** (Details, Review Queue, Settings + subpages, Categories) — "push" is
  navigating forward into a new pushed page (per the §1 glossary above), stacking it on top of
  where you were; "pop" is navigating back off that stack, per §4's "Pushed page" behavior. This
  uses the platform-native transition — i.e. not a custom CoinFlow animation, but whatever
  transition each phone operating system normally uses for this kind of navigation (iOS
  slide-from-right — the new page visibly slides in from the right edge; Android shared-axis X —
  Android's standard Material-Design pattern where the outgoing and incoming pages both shift
  slightly along the same horizontal axis while cross-fading) at `slow`.
- **Tab switch** — no slide; outgoing content cross-fades to incoming over `base`; scroll position
  and state are preserved (§4) — meaning if you'd scrolled halfway down the Transactions tab, then
  switched to Analytics and back, Transactions is still scrolled to that same halfway point rather
  than resetting to the top.
- **List row insert / remove** — a saved / undone transaction row animates height + opacity over
  `base` and neighbours settle with a `base` **layout animation** (when one row's size changes —
  e.g. shrinking to zero as it's deleted — the other rows around it don't just snap into their new
  positions instantly; they smoothly slide to fill the gap, which is what "layout animation" means
  here); a deleted row collapses first, then the Undo snackbar rises (a "snackbar" is the small
  temporary message bar described next).
- **Undo snackbar / toast** — a **snackbar** (also sometimes called a "toast") is the small,
  temporary message bar that briefly appears near the bottom of the screen to confirm something
  happened (e.g. "Transaction deleted") and optionally offer one quick action like "Undo" — it
  rises from behind the nav over `base` `decelerate`, holds ~5 s (stays visible for about five
  seconds), leaves downward over `base` `accelerate`; **Undo** re-inserts the row with the insert
  animation.
- **Confirm dialog** — a small centred pop-up card asking the user to confirm a risky/important
  action (see §5 V-7, §3.6) — scrim fades over `base`; the card **scales** .96→1 (grows from 96% of
  its final size up to 100% — a very subtle "pop in" grow effect) + fades over `base` `standard`;
  leaves by fade only over `fast`.
- **Segmented control / toggle** — a segmented control is the pill-shaped multi-option switch
  described in §3.6 (like an Expense/Income switch); the selected pill (the highlighted background
  shape marking which option is currently chosen) slides between options over `fast` `standard`
  rather than just jumping instantly.
- **Press feedback** — cards and buttons drop to ~.97 opacity (nearly fully solid, but with a
  faint, brief dimming — a subtle visual acknowledgment that a tap registered) (or a 1–2 px inset,
  i.e. nudging very slightly inward) on press-in over `fast`, no bounce on release.
- **Splash** — the very first screen shown while the app is launching, before anything else has
  loaded (commonly called a "splash screen"). This one is already coded
  (`AnimatedSplashOverlay`, using the animation library's `Keyframe` feature — a way of describing
  an animation as a sequence of named steps/poses): the mark (the CoinFlow logo) settles with one
  gentle spring, then the overlay wipes (slides/fades away to reveal the real app underneath).
  Animation unchanged; the mark itself is now the plain ₹ defined in §9 CR-3.

**Implementation.** (This paragraph is a note to the developers building the real app, translating
the above into specific code libraries — safe to skim if you're only here for the design intent.)
`react-native-reanimated` v4 (the animation library the app's real code uses) — `entering` /
`exiting` / `layout` props (its built-in hooks for "how should this element animate in", "...animate
out", and "...animate when its layout changes") with `Keyframe`s for the bespoke moves (sheet,
snackbar, list rows), the navigator's built-in transitions for stack / tab (i.e. don't reinvent
push/pop or tab-switch animations — just use what the navigation library already provides). The
three timing tokens and three easing curves live alongside `theme.ts` (i.e. defined as constants
next to the other design tokens in the app's real code, not hand-typed in each place they're used).
The prototype does not animate (the HTML prototype described near the top of this document is a
static, non-animated mock of the layouts only); a JS preview of the key transitions with these
exact tokens lives at `design-prototype/01-midnight/motion.html` — the values there are the target,
verified and tuned on-device during the build.

### 3.6 Component catalog

> **Plain-English — what a "component catalog" is:** a component is a reusable, self-contained
> chunk of UI with a fixed look and behavior — like a specific button style, or the specific card
> shape used for every transaction — that gets reused across many different screens instead of
> being redesigned from scratch each time. A "catalog" is just the full list of these reusable
> pieces, described once here so every screen spec later in this document (§6) can simply say
> "uses a transaction card" and mean this exact, already-defined thing.

**Built** in the prototype (`screens.html`, `p0-screens.html` — i.e. these components already
exist as real, working HTML/CSS in the coded prototype, not just as a description):

- **Top bar** — the strip fixed along the very top of a screen, holding the title/branding and
  navigation controls. "Sticky" means it stays pinned in place at the top even as the content below
  it scrolls. "Gradient-masked" means its background isn't a flat colour but fades smoothly
  (a "gradient") into the screen behind it, and/or fades out its own edges, rather than having a
  hard visible boundary line. Depending on the screen it shows: brand + month, or title (+ count),
  or back / close + **overflow** (an "overflow" control, usually three dots ⋮, is a button that
  opens a menu of secondary actions that didn't fit as their own visible buttons).
- **Bottom nav** — the floating blurred pill, 4 tabs + raised centre **Add** described in §4;
  "blurred" means the app content scrolling underneath it is visible but softly blurred through it
  (a common effect called a "frosted glass" or "backdrop blur"), rather than the bar being a
  totally opaque solid block; active tab `--text` (the currently-selected tab uses the brightest
  text-colour token), rest `--text-3` (unselected tabs use the dimmest, quietest text-colour
  token — see the token table in §3.1).
- **Permission banner** (V-9) — neutral inset (a plain recessed-looking bar with no colour tint),
  alert glyph (a small icon signalling "notice me", e.g. a warning triangle) + message + **Enable**
  + dismiss (a way to close/hide the banner without acting on it).
- **Badge** — the small pill-shaped count marker described in §3.1's token-table decoder: pill
  shape, `--surface-3` / `--text-2` colours, tabular count (using the tabular-numerals digit style
  from §3.2 so the number doesn't wobble as it changes).
- **Balance hero card** — the large, prominent card at the top of Home showing the user's overall
  balance; "hero" is a common design term for the single largest, most attention-grabbing element
  on a screen. "Total balance" label + large running-balance figure (de-emphasised `₹` mark — the
  rupee currency symbol is drawn smaller/quieter than the number next to it, so the number itself
  is what dominates).
- **Stat tile** — small card: label + figure + a quiet delta line with a trend glyph.
  **Plain-English:** a "delta" is the mathematical/finance term for "the amount of change" between
  two values (e.g. this month vs last month); a "delta line" is a small line of text reporting that
  change (typically as a percentage), and a "trend glyph" is a tiny arrow icon (↗ or ↘) reinforcing
  whether that change is up or down. Used for Home Income / Spending (MoM % — "month-over-month
  percentage", i.e. this month's number compared to last month's, expressed as a percent change)
  and Analytics Mean / Median (last-month value). Display only (tapping it does nothing — it's
  read-only, not a button/link).
- **Action strip** — grouped rows (to-review, uncategorized); fill-dot vs ring marker (two visually
  distinct small round markers — one a solid filled dot, one just a hollow ring outline — used to
  tell two different row types apart without using colour); count badge; chevron (a small `>`-
  shaped arrow icon hinting "tap to go further/see more").
- **Transaction card** — icon tile (inverts for income — see §2's explanation of the inverted icon
  tile) + label (note → account → "No note" — meaning: show the note if there is one, otherwise
  fall back to showing the account name, otherwise fall back to the literal placeholder text
  "No note") + category-only meta (a small secondary line showing just the category, nothing else)
  + signed amount (always carrying its `+`/`−` sign per V-1 in §5).
- **Day group header** — plain label (date + optional subtotal) between card groups (i.e. this
  header is not itself inside a card — it's a plain heading sitting in the gap between one day's
  group of cards and the next).
- **Analytics cards** — "This month" continuous **arc gauge** (a gauge shaped like a curved,
  part-of-a-circle bar — e.g. a half-moon shape — that fills up like a progress bar to represent a
  proportion; see §6.10 for exactly what it shows) + Income / Spent split; **Mean / Median** stat
  tiles (each with last month's value — "mean" is the everyday average, add-everything-up-and-
  divide; "median" is the middle value if every day's spend were lined up in order, which resists
  being skewed by one unusually large day, e.g. a big rent payment); "Where it went" ranked
  coloured rows + **donut** (a ring-shaped pie chart — like a pie chart with the center cut out —
  where each category gets a coloured wedge of the ring proportional to its share); "Day by day"
  greyscale area / line + dashed mean line; "Biggest expenses" ranked rows.
- **Bottom sheet** — **grabber** (the small pill/bar-shaped handle drawn at the very top-center of
  a bottom sheet, purely as a visual cue that "this can be dragged" — it isn't itself functional,
  just a hint), dimmed scrim, swipe / scrim-tap dismiss (closing the sheet either by swiping it
  down or by tapping the dimmed area behind it), discard-confirm when dirty (V-6, "dirty" meaning
  "has unsaved changes", per the §3.5 explanation above).
- **Keypad sheet** (`sheet--kp`) — scrolling body; the in-app numeric keypad is **amount-only**
  (used only for typing the money amount, not for any other field) and docks at the bottom with
  the primary action button pinned **below** it. The amount holds full height at rest and only
  collapses to a slim sticky summary bar (`sheet--kp--typing`, ~22 px figure, "Amount ₹1,200") once
  the body is scrolled to the text fields — see §6.4/§6.5 for the full walkthrough of this
  behavior.
- **Amount input** (V-10) — large centred figure + **caret** (the blinking text-entry cursor, the
  same concept as in any text box, just very large here) (52 px in the keypad sheet, in a
  generously padded block — it is the hero of the sheet, i.e. the single most visually prominent
  element on that screen, same "hero" sense as the Home balance card); `₹` prefix in `--text-3`
  (the rupee symbol is drawn in the dimmest/quietest text colour so the number, not the currency
  symbol, is what draws the eye); helper line (a small line of guidance/error text shown below a
  field) for 0 / over-max (shown if the amount is zero, or above the app's allowed maximum).
- **Custom numeric keypad** — a purpose-built on-screen number pad (distinct from the phone's own
  system keyboard) arranged 3×4 (3 columns × 4 rows: 0–9, ".", backspace); 62 px keys (each key is
  a 62-pixel-square tap target); full-bleed hairline grid (thin dividing lines running the entire
  width/height between keys, edge-to-edge — "full-bleed" means a graphic element runs all the way
  to the edge of its container with no border/margin); tabular (digits use the tabular-numerals
  style from §3.2). Amount entry only.
- **System keyboard** — "system keyboard" = the phone operating system's own built-in keyboard
  (the one used in every app, for typing regular text), as opposed to CoinFlow's custom numeric
  keypad above. Account / Note / Description raise the OS keyboard, not the in-app keypad; it
  replaces the keypad and the primary button rides just above it (iOS input-accessory style — on
  iPhone, apps can pin a small toolbar/button directly above the system keyboard, which stays
  attached to the top of the keyboard as it slides up; CoinFlow's primary button — e.g. "Add" —
  does the same here). Prototype draws a representational `.syskb` (a simplified mock drawing of
  what a system keyboard looks like, since the actual OS keyboard can't be reproduced inside a
  browser-based prototype).
- **Segmented control** — 2–3 options (e.g. Expense vs Income, described further in §6.4); selected
  = `--surface-3` lift (the currently-chosen option's background gets the third, most-raised
  surface-colour step from §3.1's token table, visually distinguishing it from the unselected
  options).
- **Selector row** — icon + label + value + chevron → opens a picker (a "picker" is a
  secondary screen/sheet for choosing one value from a list, e.g. tapping a payment-method row
  opens a picker to choose UPI/Card/Cash/etc).
- **Text field** — an ordinary labelled text-input box. Inset `--surface-2` (drawn on the second
  surface-colour step, giving it a slightly recessed look compared to its surrounding card);
  `--filled` (hairline border — shown once the field has content) / `--empty` (muted — a quieter
  style shown while the field is blank) / `--focus` (`--primary` border — shown while the user is
  actively typing in it, per keyboard focus) states; textarea variant (a taller, multi-line version
  for longer text, e.g. the description field).
- **Account autocomplete** — bordered list under the account field; each row = matched account +
  its remembered note / category ("categorises as Food") or "new" (a label shown when what was
  typed doesn't match any previously-seen account, offering to save it as a brand-new one).
  "Autocomplete" is the general term for a dropdown of matching suggestions that appears as you
  type, letting you pick instead of typing the whole thing.
- **Category picker sheet** — full sheet (occupies the whole bottom-sheet panel, rather than being
  a small popover); icon-tile rows for Uncategorized + the 9 categories; current = check (a
  checkmark ✓ marks whichever category is currently selected); "Manage categories →" foot (a link
  at the bottom of the sheet, jumping to the full Categories management screen, §6.11).
- **Filter blocks** — titled groups of toggle chips (category, type segment, payment method, date
  range); **Reset** + "Show N results" (the count of matching transactions updates live as filters
  are toggled, shown right on the Apply button).
- **Buttons** — primary (filled `--primary` / `--primary-ink` — the app's one bold, solid-filled
  button style, used for the single most important action on a screen), **ghost** (`--surface-2` —
  a "ghost button" is a lower-emphasis button style with a subtle/no fill, used for secondary,
  less-important actions), disabled (`--surface-2` / `--text-3` — greyed out and unclickable, shown
  when the action isn't currently valid, e.g. Add before any amount is typed); pill radius; 700
  label (bold text, per the weight table in §3.2).
- **Chips** — small pill-shaped tags, per the "chip" decoder in §3.1: category chip (`--surface-3`
  fill), Uncategorized chip (dashed `--text-3` outline — a broken/dashed border rather than solid,
  visually flagging "this one's incomplete/unset"), removable filter chip (label + ✕ — an active
  filter shown as a chip with a small × to remove just that one filter).
- **Provenance line** — "provenance" means "where something came from / its origin" — this is the
  small line of text on a Details screen (only for auto-detected transactions, never for manually
  entered ones) disclosing that the entry was found automatically rather than typed by the user:
  auto glyph + "Detected automatically · &lt;bank&gt; · &lt;date&gt;". No SMS body (critically, the
  actual text of the SMS message is never shown here or anywhere — see impl. P-9 elsewhere in this
  doc).
- **Detail field row** — key (`--text-3`) over value (a small dim label like "Account" stacked
  directly above the actual value like "HDFC •1234", the standard "key/value" layout used
  throughout the Details screen, §6.8); the note is the heading line (the transaction's note text
  is given the most prominent, large heading-style treatment on that screen, rather than being just
  another key/value row).
- **Review-queue card** — one lifted card (raised with the same elevation/shadow treatment as an
  ordinary transaction card, per §3.3) per pending row: payment-method icon tile + signed amount +
  neutral descriptor ("UPI payment") + relative time (e.g. "2h ago" — see V-2 in §5) + overflow; a
  known-account row also carries an inline one-tap **`Save`** (explained fully in §6.3/§6.15).
- **Transaction notification** (§6.15) — lock-screen card: `₹450 debited` / `Swiggy · UPI`.
  Known account → **`Save`** · **`Add`** · **`Discard`**; new account → **`Add`** ·
  **`Discard`**. Body tap → Confirmation. (Monochrome mock; a real build uses the OS channel
  style.)
- **Empty state** — the standard "nothing here yet" screen/section shown when a list has no
  content (e.g. a brand-new user with zero transactions). This is one of the three "baseline
  states" every screen must handle — see **V-3** in §5 for the full explanation of loading/empty/
  error states. Here: centred glyph + line + primary action.
- **Loading skeleton** — while real data hasn't arrived yet, instead of a blank screen or a
  spinner, the app shows a **skeleton**: a set of plain grey placeholder blocks (`--surface-3`)
  shaped and positioned exactly like where the real content (cards, text lines) will appear once
  it loads, which is a common technique for making a wait feel faster/less jarring than a blank
  page. No spinner (V-3 — see §5). Prototyped in `p1-screens.html`.
- **Error state** — shown when something fails to load; centred alert glyph + a short line + a
  hairline **Try again** pill (a low-emphasis retry button, per V-3 in §5).
- **Confirm dialog** — the small pop-up asking "are you sure?" before a risky action — centred card
  (`--surface`, 24 r — using the `card` corner radius of 24 from §3.3) on a heavy scrim; a quiet
  glyph in a `--surface-3` circle, title, a short body (≤ 30 ch — the explanatory text is capped at
  roughly 30 characters, i.e. kept to one short sentence, not a paragraph). Actions are **stacked
  full-width** (the two buttons — confirm and cancel — are stacked one above the other, each
  spanning the full width of the dialog, rather than sitting side-by-side): the filled + bold
  confirm on top, a **plain-text Cancel** below — no second filled button competing (i.e. only one
  of the two buttons is visually "loud"; Cancel is deliberately quiet so it doesn't compete for
  attention). No red; the glyph, wording and the filled weight carry the warning (V-7 in §5 — see
  there for how CoinFlow signals "this is dangerous" without using a warning colour). A two-step
  variant adds a centred "type `CONFIRM`" field above the actions (Settings › Data) — for the most
  destructive action in the app (erasing all data), the user must additionally type the literal
  word "CONFIRM" into a text box before the button will work, as extra friction against an
  accidental tap.
- **Undo snackbar** — translucent bar (`rgba(36,38,47,.6)` + blur — a semi-see-through dark bar
  with a background blur effect, per the snackbar concept explained in §3.5) above the nav,
  message + single "Undo"; auto-dismiss ~5 s.
- **Onboarding step frame** — the shared layout template every onboarding step (§6.1) is built
  from: 3-dot progress (three small dots at the top showing which of the 3 onboarding steps you're
  on — a common "step indicator" pattern, like page dots on a slideshow), optional abstract B&W
  line art (a simple non-representational black-and-white graphic, not a literal illustration —
  see §2's "no commissioned illustration" note), large heading, one bottom primary button, Back
  after step 1 (a Back button appears on every step except the very first one).
- **Permission card** — the UI block used to ask for one specific OS permission (like reading SMS)
  — icon tile + title + one-line why (a single short sentence explaining *why* the app wants this
  permission) + trailing **Allow** button / status pill (granted / denied — the button becomes a
  status label once answered). Reused in onboarding step 2 and Settings › SMS & notifications
  (i.e. this exact same component appears in two different places in the app, rather than being
  redesigned twice).
- **Settings grouped list** — inset `--surface-2` groups (rows are visually clustered into
  card-like grouped blocks, rather than being one flat undivided list) under quiet `setlabel`
  headings (small, quiet section-title labels, named `setlabel` in the code); `selectrow` rows
  (the reusable tappable-row style used throughout Settings) gain a `sub` line (a secondary line of
  text under the row's main label, e.g. "Off") and a `--danger` bold label variant (a bold-text
  styling reserved for destructive rows — again, note: *bold*, not *red*, per this app's no-colour
  rule).
- **Account-rule row** — lifted card: account · remembered note · category chip · usage count (see
  §6.14's "Account rules" subpage for what this row means and where it's used).
- **Icon picker** — fixed 6-wide grid (a fixed grid of icon choices, 6 icons per row); selected
  cell inverts (the chosen icon's background/foreground flips, the same inversion trick used for
  income tiles in §2, so the selection is visible without needing a colour highlight) (carries
  category identity, no colour).

All of the above are drawn in the prototype (`screens.html` / `p0-screens.html` / `p1-screens.html`).

### 3.7 Reconciliation with `src/constants/theme.ts`

> **Plain-English — what "reconciliation" means here:** `src/constants/theme.ts` is the actual
> code file, already present in the app's codebase today, where design tokens (colours, fonts,
> spacing — see the design-token explanation at the top of §3) are defined as real values the app
> reads at runtime. It currently holds older, out-of-date placeholder values from before this
> visual spec was written. "Reconciliation" means squaring the two up — this subsection is the
> to-do list of exactly what has to change in that code file so it matches everything decided in
> §3.1–§3.6. This is a note primarily for whoever implements the app; a non-technical reader can
> treat it as "confirmation that the rest of §3 is the final, authoritative answer, and the old
> code hasn't caught up yet."

This section is the source of truth (i.e. wherever this spec's values disagree with what's
currently in the code, this spec wins) and supersedes the current values:

- `Colors.dark` → the §3.1 ramp. Today it is `#000` / `#212225` / `#2E3135` / `#B0B4BA` (the old,
  soon-to-be-replaced placeholder colours); update to `--bg #0d0e14`, `--bg-top #1b2238`,
  `--surface #16171d`, `--surface-2 #1c1e26`, `--surface-3 #262832`, `--hairline #2b2d38`,
  `--text #f5f5f6`, `--text-2 #9a9aa1`, `--text-3 #85858c`, plus `--primary` / `--primary-ink`. The
  app background is the §3.1 radial (using `--bg-top` → `--bg`), not a flat fill. `ThemeColor`
  (the code's internal list of valid colour-token names) grows from 5 keys to this set.
- `Colors.light` is unused in V1 (dark only, per §2) — mirror `dark` (make it an identical copy of
  the dark values, as a harmless placeholder) or drop it (remove it outright) — either is fine
  since nothing in V1 ever reads it.
- `Fonts` → bundle **Manrope** and **Geist**; `Fonts.sans` = Geist, add `Fonts.display` = Manrope,
  each with the system stack as fallback. `Spacing` already aligns (the existing spacing values in
  code already match §3.3, so nothing needs to change there).
- Icons → add `lucide-react-native` (§3.4); one wrapper component (a single small piece of code
  that every icon in the app passes through) sets `strokeWidth={1.6}` and `color` from the theme,
  replacing the prototype's inline `<symbol>` sprite 1:1 (a direct, no-layout-change swap, as
  already noted in §3.4).
- `ThemedText` / `ThemedView` (the app's own base text/surface components, mentioned in this
  project's CLAUDE.md as the primitives every screen should be built from) gain the §3.2 type
  roles and the §3.1 surface tokens.

---

## 4. Navigation

> **Plain-English — "navigation" and "information architecture":** this section is about how the
> app's screens connect to each other — which ones are always-available top-level destinations,
> which ones you step "into" and back "out of", and which just pop up temporarily. The broader
> design term for "how a product's screens/sections are organized and connected" is **information
> architecture** (often abbreviated "IA") — this §4, together with the §1 screen inventory, is
> effectively CoinFlow's information architecture.

**Bottom bar:** `[ Home ]  [ Transactions ]  ( + )  [ Analytics ]  [ Settings ]`. The center
**Add** is raised / filled and is **not** a destination (unlike the other four icons, tapping it
does not switch you to a new tab/screen of its own — there is no "Add tab" to be "on") — it opens
the Add sheet (§6.5) over the current tab, which stays selected (whichever of Home/Transactions/
Analytics/Settings you were already on remains the active tab underneath). Tab pages preserve
scroll + state (as explained under the §3.5 "Tab switch" transition — switching away and back
doesn't reset your scroll position or any in-progress state on that tab). Onboarding renders
full-screen, outside the tab shell (the "tab shell" is the persistent wrapper containing the
bottom bar; onboarding — being first-run-only, per §6.1 — takes over the entire screen and the
bottom bar isn't present at all during it). The **Transactions** tab uses a clock / history icon
(not a receipt).

The table below spells out, for each of the four navigation-surface **types** first introduced in
§1's screen inventory, exactly how it behaves and which screens use it:

| Surface type | Behavior | Screens |
|---|---|---|
| Tab page | Bottom-bar destination, state preserved | Home, Transactions, Analytics, Settings |
| Pushed page | Own back stack, back button | Onboarding steps, Review Queue, Transaction Details, all Settings subpages |
| Bottom sheet | Grabber, dimmed scrim, swipe-down / scrim-tap dismiss | Confirmation, Add, Edit, Create/Edit Category, Filter |
| System surface | OS notification | Transaction notification |

(**Plain-English on "own back stack":** a "stack" here is like a stack of physical papers — each
pushed page gets placed on top of the previous one, and the back button/gesture removes just the
top page, revealing whatever was underneath, one layer at a time — this is the standard way
mobile/web navigation works when you go "into" something and then back "out".)

Flow: Onboarding (Welcome → Permissions → Category review) runs on first launch only, then Home.
Review Queue and the notification both open the Confirmation sheet. Analytics category / expense
rows **drill into** Transactions pre-filtered (**Plain-English:** "drill into" means tapping a
summary item takes you to a more detailed view scoped to just that item — e.g. tapping the "Food"
row in the Analytics breakdown takes you to the Transactions list already filtered down to only
Food transactions for that period, rather than the full unfiltered list). Settings rows push their
subpages (tapping a Settings row navigates into — "pushes" — that subpage, per the Pushed-page row
in the table above).

---

## 5. Global visual rules

> **Plain-English — what a "V-#" rule is:** each `V-#` below is a standing rule that applies
> everywhere across the whole app, rather than being tied to one specific screen — think of them
> as the app's constitution, referenced by number from anywhere else in this document (and from
> `SPEC-implementation.md`) instead of being re-explained every time. This is the same numbering
> convention used for the `UI-0xx` checkable criteria in §7, just for standing rules instead of
> checklist items.

- **V-1 Money.** `₹` prefix (the rupee currency symbol always appears with an amount), Indian
  digit grouping (`₹1,23,456` — India's convention for placing the commas in a large number, which
  differs from the "1,234,567"-style grouping used in the US/UK: after the first three digits from
  the right, commas are placed every *two* digits instead of every three, e.g. `1,23,456` rather
  than `123,456`). Whole rupees by default; two decimals only when paise are non-zero (paise are
  the sub-unit of the rupee, like cents to a dollar — 100 paise = ₹1; the app hides the decimal
  point entirely unless there's an actual paise amount to show, to avoid visual clutter like
  "₹500.00" everywhere). Spend has a leading `−`, income a leading `+` — the **sign is always
  present**, with **a thin space between the sign and the `₹`** (`+ ₹1,15,000` / `− ₹842`).
  Direction is the sign (and, where useful, weight or a direction glyph), **never colour** — the
  UI has no positive / negative hue (V-11, below).
- **V-2 Dates & time.** Relative for the last ~7 days ("2h ago", "Yesterday" — phrased relative to
  right now, which reads faster for very recent events); absolute date beyond that (an actual
  calendar date, e.g. "12 Aug", once something is old enough that "3 weeks ago" stops being a
  useful mental unit). Lists group by local calendar day under a section header (date, optional
  day subtotal).
- **V-3 Three baseline states, always rendered.** This is the rule behind the "V-3 baseline" phrase
  used throughout the rest of this document, including in every individual screen spec in §6.
  **Plain-English — why every screen needs three states:** a screen's content can't always be
  shown instantly and perfectly — sometimes data is still being fetched, sometimes there's
  genuinely nothing to show yet, and sometimes something goes wrong. Every screen in this app is
  required to have a deliberately designed look for all three of those situations, not just for
  the "happy path" where everything loads fine:
  - **Loading** — data is being fetched right now. Shown as a **skeleton** (see the plain-English
    explanation of "loading skeleton" in §3.6) that matches the final layout — never a blank
    region or a lone full-screen spinner (a "spinner" is the classic rotating-circle loading icon;
    this app avoids relying on a bare spinner as the *only* loading feedback, preferring the more
    informative skeleton approach).
  - **Empty** — the fetch succeeded, but there's genuinely nothing to show (e.g. a brand-new user
    with zero transactions). Shown as: short line (a sentence explaining there's nothing here yet)
    + the primary action (a button offering the obvious next step, e.g. "Add transaction").
  - **Error** — the fetch failed. Shown as: short message + a retry affordance (an "affordance" is
    a general UX term for any element whose appearance invites a specific action — here, a visible
    retry button that invites tapping it to try again).

  Screen specs below (§6) note only where a state differs from this baseline — i.e. if a §6
  screen's spec doesn't explicitly describe its own loading/empty/error look, assume it's exactly
  this generic baseline.
- **V-4 Uncategorized styling.** Scannable in any list (quickly recognizable at a glance while
  skimming, without having to read closely): the transaction card shows the **"?" icon tile** and
  the word "Uncategorized" with a dashed underline (no chip). On Details a prominent
  **Set category** control replaces it.
- **V-5 Accessibility baseline.** **Plain-English — "accessibility":** accessibility means making
  sure the app is usable by people with a range of abilities — e.g. low vision, or motor
  difficulty tapping small targets — and this rule is the minimum bar every screen must clear.
  Support system font scaling with no clipping (the phone OS lets a user set all text bigger, for
  readability; the app must handle that without any text getting cut off or overlapping —
  V1 is a single dark theme, see §2, so there's no separate accessibility bar for light mode).
  Minimum touch target 44 **dp** ("dp" = density-independent pixel, a sizing unit that stays the
  same *physical* size across different screens regardless of their pixel density, so a "44dp"
  button is roughly the same real-world size — about a fingertip — on every device; this is the
  standard minimum recommended tappable size so buttons aren't too small to hit reliably). Body-
  text contrast ≥ 4.5:1, large text ≥ 3:1 (**contrast ratio** measures how much a piece of text's
  colour stands out against its background — a higher ratio means easier reading, especially for
  users with low vision; 4.5:1 and 3:1 are the standard, widely-used minimum thresholds — from the
  WCAG accessibility guidelines — for normal-sized text and larger text respectively). Every
  icon-only control has a visible or **assistive label** (even a button that's *drawn* as just an
  icon, with no visible text, must still have a label attached behind the scenes that a screen
  reader — assistive technology used by blind/low-vision users — can announce out loud, so the
  control isn't a mystery to someone who can't see the icon). No information conveyed by colour
  alone (this restates V-11's no-colour-coding rule specifically as an accessibility requirement:
  someone who is colour-blind must never be the only person who can't tell two things apart).
- **V-6 Sheets.** Grabber at top; background dims; swipe-down and scrim-tap dismiss. A sheet with
  unsaved input shows a discard confirm on dismiss (see the "dirty sheet" note under §3.5's Bottom
  Sheet transition).
- **V-7 Destructive actions** (actions that permanently remove or lose something, like deleting a
  transaction or clearing all data) are visually weighted (bold label, filled confirm button) and
  always route through a confirm dialog; transaction delete also shows an Undo snackbar (a
  temporary safety net — see §3.6 — letting the user reverse the delete for a few seconds after
  the fact). No red — the confirm dialog and the weight (bold text) carry the warning instead of a
  colour, consistent with V-11.
- **V-8 No currency selector** anywhere — single-currency app (the app supports only Indian
  Rupees; there is no setting/screen anywhere to pick a different currency, because CoinFlow isn't
  built to support one).
- **V-9 Permission banner.** When SMS or notifications are off, a slim, dismissible banner sits
  directly under the top bar on **Home** and **Review Queue**: short message + **Enable**. It is a
  neutral inset (surface fill + hairline border), **not** tinted — an alert glyph and its position
  do the signalling (i.e. instead of colouring the banner an alarming yellow/orange the way many
  apps would, CoinFlow keeps it visually neutral and lets the icon and its placement communicate
  "this needs your attention," staying consistent with V-11's no-colour rule).
- **V-10 Amount emphasis.** On any screen showing a single transaction (Confirmation, Add, Edit,
  Details) the amount is the largest element on screen (this is the standing rule behind the
  "V-10" cross-references scattered through §3.2 and §3.6 above).
- **V-11 Palette.** ("Palette" = the overall set of colours used.) Foreground is black, white and
  grey — no accent, no semantic colour, no colour-coded categories in lists. Category identity is
  name + icon, never a colour swatch (a "swatch" is a small solid block of colour used as a visual
  label — e.g. many apps give each spending category its own coloured dot or tag; CoinFlow
  deliberately never does this outside the one exception below). Direction / status / rank are
  carried by the `+`/`−` sign, weight, size, fill vs hairline, iconography, or greyscale value.
  **Two exceptions, both non-semantic** (meaning: decorative/functional, but never used to encode
  "good/bad" or "this specific meaning" the way a red/green traffic-light colour would):
  1. the Analytics *"Where it went"* category breakdown (§6.10) colours its dot, bar and donut
     from the fixed category palette (§3.1), because a greyscale split of 8+ categories cannot be
     read (with only shades of grey to distinguish 8-plus categories at a glance, they'd be far too
     hard to tell apart, so this one screen is allowed real colour purely for legibility) — those
     colours do **not** leak elsewhere (not onto cards, chips, the category selector, or the
     "Day by day" chart);
  2. the app **ground** carries a faint **cool blue-grey ambient wash** (a soft glow behind the
     top of each screen; §3.1) — background only, no foreground element is tinted, and it never
     encodes meaning.

---

## 6. Screen specifications

> **Plain-English — how to read every entry below:** each numbered subsection (§6.1, §6.2, …) is
> one screen (or one small group of closely related screens). Each follows the same pattern —
> purpose (what the screen is for, in one sentence, and how the user gets to it — "Entry:");
> layout top → bottom (a walkthrough of everything on the screen, in the actual order it's
> arranged from the top of the screen down to the bottom — reading it is meant to let you *picture*
> the screen without needing a picture); and state / edge-case deltas from the V-3 baseline (a
> "delta" is a difference/change, per the §3.6 stat-tile explanation — this note only calls out how
> a screen's loading/empty/error behavior *differs* from the generic V-3 baseline described in §5;
> if nothing is called out for a given state, assume it's the plain baseline). "Edge case" is a
> standard software/design term for an unusual-but-real situation worth explicitly deciding how to
> handle up front — e.g. "what if the user has 2,000+ transactions" or "what if an amount is
> exactly ₹0" — rather than leaving it to guesswork during implementation.

### 6.1 Onboarding · P1

**Plain-English:** "onboarding" is the standard product term for the very first walkthrough a new
user sees, the first time they ever open the app — a short guided sequence introducing what it
does and getting the essential setup (here: permissions, categories) out of the way before landing
on Home for the first time. This whole screen uses the "Onboarding step frame" component defined
in §3.6: full-screen, 3-dot step progress, large heading, generous spacing, one bottom-anchored
primary button (a single primary action button, pinned to the bottom of the screen), **Back**
allowed after step 1. Each step carries an **abstract black-and-white graphic composition**
(simple geometric shapes / line work) — no commissioned illustration (i.e. no custom-drawn/
paid-for artwork, per §2's illustration policy).

- **Welcome** — app mark (the CoinFlow logo); one-line **value proposition** (a short, punchy
  sentence stating what the app does for the user and why it's worth using — a standard marketing/
  product term, e.g. something like "Track your spending without lifting a finger"); one
  supporting line (a second, smaller line adding a bit more detail under the value proposition);
  **Get started**. Static (nothing on this step animates or changes; it's just the entry point).
- **Permissions** — heading "A few quick things" *(CR-2; was "Two quick permissions")*; three stacked **permission
  cards** (icon, title, one-sentence "why", trailing status pill or **Allow** button — this is the
  "Permission card" component from §3.6); **Continue**; "Skip for now" link. The three are **not
  equal**: **Read transaction SMS** is what makes auto-detection work at all; **Notifications** and
  **Crash reports** are marked **"Optional"** — without notifications, detected items still land in
  the Review Queue, they just don't post to the lock screen (the one-tap Save / Add flow, §6.15);
  crash reports (anonymous stack traces only, off by default) is an app setting, not an OS
  permission. **Continue** is always enabled and requests every still-askable permission (SMS,
  notifications) via the OS dialogs; then, **only if crash reporting is still off**, it shows a
  confirm dialog — "Send crash reports?" with **Enable crash reports** / **Not now** — before
  advancing. **Not now** (or dismissing) advances without enabling anything; **Skip for now** never
  shows the dialog. Card states: *not asked* (Allow button), *granted* (check-mark pill), *denied*
  (muted "Enable later in Settings" — the OS permission was refused, so the card falls back to a
  quiet note pointing the user to Settings instead).
- **Category review** — heading "Pick your categories"; scrollable list of the 9 default
  categories as rows (icon, name, trailing checkbox — all checked); optional drag handle (a small
  handle icon letting the user drag-and-reorder the list, if this ships); **Done**.

### 6.2 Home · P0

Month status at a glance, fast routes to what needs action, recent activity. Entry: post-onboarding
launch; Home tab.

- Layout: **top bar** ("CoinFlow" **wordmark** — a wordmark is a logo that's just the brand name
  drawn in a distinctive typeface, rather than a separate icon/symbol — + current month label — the
  month **scopes** the two tiles below, i.e. it defines *which time period* the Income/Spending
  numbers below cover, **not** the balance, which is always all-time) · **permission banner**
  (V-9) · **balance hero card** — label **"Total balance"** (no month); the large figure is the
  **running balance** = all recorded income − all recorded expenses (a computed **net** — "net"
  meaning the final result after subtracting one thing from another, as opposed to a "gross"
  total before subtraction — may be negative; **never** an "Avl Bal" read from SMS — impl. D2:
  meaning this number is always calculated by the app itself from every transaction it has on
  record, never copied from an "Available Balance" figure some bank SMS messages include, because
  that bank-reported figure could reflect money/accounts CoinFlow doesn't know about). The `₹`
  mark is de-emphasised (small, muted — ref `1.png`). · **two stat tiles** directly beneath the
  hero, side by side (ref `1.png`), **display only — not links** (tapping them does nothing —
  they're read-only summaries, not buttons): **Income** and **Spending**, each showing **this
  month's** total (`+₹…` / `−₹…`) and, on a quiet line, the **percent change vs last month** with a
  small trend glyph (e.g. "↗ 12% vs last month"). · **action strip** (up to two rows, each shown
  only when its count > 0: `● N transactions to review` → Review Queue, `● N uncategorized` →
  Transactions pre-filtered; each carries a count badge; the two rows are told apart by a filled vs
  a ring marker, not colour — per the §3.6 Action Strip component) · **Recent** (header + up to 8
  **transaction cards**: a **category icon tile** (inverted for income), a label, a meta line of
  **category name · relative time**, the signed amount; trailing **See all** → Transactions).
- Card label = the **note**; when empty, it falls back to the **account** (muted), then to an
  italic muted **"No note"**. Payment method is **not** on the card — it lives on Details and in
  the Filter.
- States: *empty (new user)* — hero shows **Total balance `₹0`**; both tiles show `₹0` with "no
  prior month" in place of a percentage; no action strip; recent section replaced by an empty
  state ("No transactions yet — they'll appear here as you pay." + **Add transaction**). *Error* —
  hero area shows "Couldn't load your data" + **Retry**.
- Edge: a **lakh-scale** balance (in the Indian numbering system, one *lakh* = 100,000 — so a
  "lakh-scale balance" is any balance in the hundred-thousands-and-up range, which produces a long
  string of digits like `₹12,34,567`) must not wrap (break across two lines awkwardly) or shrink
  illegibly (the text auto-shrinking so much to fit that it becomes hard to read); a **negative
  balance** shows a leading `−`; a tile with no previous-month figure shows "—" (a plain dash placeholder), not a percentage; counts show
  `99+` past 99; long notes truncate with ellipsis (get cut off with a trailing "…" once they run
  out of room, rather than wrapping or overflowing); an all-income month (Spending `₹0`) is valid
  (i.e. this isn't treated as an error or an unusual/broken state — the screen just displays it
  plainly).

- **V2 (CR-4):** when any split has money outstanding, a compact **"Owed to you ₹N"** row sits under the
  month card (tap → **Splits**, §6.19). Hidden when nothing is outstanding. Amounts follow the *effective*
  rules of §6.17 (Spent already excludes the part other people owe).

### 6.3 Review Queue · P0

**Plain-English:** this is the screen that lists SMS-detected transactions the app isn't fully
confident enough about to just silently record — instead they wait here for the user to look at
and act on. "**Triage**" is the term for quickly sorting a batch of pending items (borrowed from
medical/emergency use, where it means quickly deciding what needs attention first — here, just
"go through and decide save/dismiss for each one"). Entry: Home action row; Home-tab badge (a
small numbered marker shown on the Review-Queue-related row/tab, per §3.6's "Badge" component);
grouped notification (per §6.15, when 2+ items are pending, the phone notification collapses them
into one summary that opens this screen).

- Layout: top bar "To review" + count · permission banner (conditional) · **suggestion cards**
  (one lifted card per row, same elevation as a transaction card — a **payment-method icon tile**
  — UPI / Card / Bank — amount, a neutral descriptor "UPI payment" / "Card payment" / "Bank
  credit" since detected items have no note yet, relative time, overflow → **Dismiss**; a card
  whose account is **known** also shows an inline one-tap **`Save`**) · **Dismiss all**
  pinned at the bottom when the list is long. No **confidence markers** (many auto-detection
  products show a "we're 80% sure this is right" style indicator; CoinFlow deliberately shows
  none of that — every field is presented plainly, per V-# rules elsewhere, rather than hedged
  with a certainty score).
- Controls: card body → Confirmation sheet; inline **`Save`** on a known-account card →
  writes it straight from the rule (records the transaction immediately using the remembered
  account rule from §6.14/impl. F8, with no extra screen); row swipe → **Dismiss**; **Dismiss
  all**.
- States: *empty* is the normal resting state (i.e. having nothing here is the *good*, everyday
  outcome, not a rare edge case) — "You're all caught up. New transactions show up here." — styled
  calm, not as an error.
- Edge: 50+ rows scroll with Dismiss all reachable; a suggestion older than ~7 days shows an
  absolute date; identical amount + method twice both render (two separate transactions that
  happen to have the exact same amount and payment method both still show up as two distinct
  cards, rather than being merged/deduplicated).

### 6.4 Transaction Confirmation (sheet) · P0

Review a detected transaction and add it, fast. Entry: notification body tap; Review Queue row.

- Layout: grabber · title "Review transaction" (+ **Cancel**) · **amount** — large, editable
  (V-10), active on open (the amount field already has keyboard/keypad focus the instant the sheet
  opens, so the user can start correcting it immediately with no extra tap needed) · **direction**
  segmented (Expense / Income) · **category** selector row (chosen chip, or an Uncategorized chip
  → opens the category picker sheet) · **payment method** selector row · **date & time** row ·
  **account** field (pre-filled from the SMS when parsed; a past-account autocomplete) · **note**
  field (the card label — encouraged, not required) · **description** field (optional; longer
  detail) · a **custom in-app numeric keypad** docked at the bottom (0–9, `.`, backspace) while
  the amount is active (tapping a text field dismisses it for the OS keyboard, with **Add** riding
  just above that keyboard, i.e. the Add button stays pinned directly above the system keyboard as
  it takes over, per §3.6's "System keyboard" component) · the primary **Add** button pinned
  **below the keypad**, at the very bottom of the sheet.
- The **amount keeps full height at rest**; it only collapses to a slim sticky summary bar
  ("Amount ₹1,200", ~22 px) once the body is scrolled down to the fields — it does not shrink
  just because the keypad is up.
- **The raw SMS is not shown or stored.** The parser (the piece of app logic that reads an
  incoming SMS and extracts the amount/account/etc from its text — detailed in
  `SPEC-implementation.md`) reads the message in memory to pre-fill the fields, then discards the
  text (impl. P-9); the pre-filled fields themselves are the **review surface** (i.e. the already-
  filled-in form fields *are* what the user reviews — there's no separate raw-message view to check
  against). No "view original SMS" affordance.
- If the account matches a saved rule, the **note, category and payment method are pre-filled**
  from it (all still editable).
- **No confidence markers.** Every field is shown plainly and is editable; fields the parser
  couldn't fill are simply blank. **Amount** and **direction** are always visible.
- States: *submitting* — **Add** shows a spinner, sheet locked and not dismissible. *Save error* —
  inline message directly above **Add**.
- Edge: amount `₹0` or `> ₹10,00,000` (10 lakh — see the "lakh" explanation in §6.2) → helper text
  under the amount (bold, not coloured); **Income** selected → category row hidden.

- **V2 (CR-4):** a quiet **Split…** text-button row sits below the Description field (Confirmation and Edit
  sheets only — a transaction must exist to be split). It opens the Split sheet (§6.17) on top of this one;
  closing/cancelling Split returns here with no change. A transaction that already has a split shows
  **"Split with N · ₹X yours"** in that row instead (tap → Split sheet in edit mode). For a *credit* whose
  amount matches an open share the sheet shows the **Suggested settlement** banner (§6.20).

### 6.5 Add Transaction (sheet) · P0

**Plain-English:** this is the sheet for typing in a transaction by hand — as opposed to §6.4,
which is for *reviewing* one the app already auto-detected from an SMS. Manual entry. Entry:
center **Add** button; empty-state CTAs on Home / Transactions / Analytics (the "Add transaction"
buttons shown as the primary action inside those screens' empty states, per V-3 in §5 — "CTA" =
call-to-action, a prominent actionable button, per the §3.6 decoder).

- Layout: grabber · title "Add transaction" · **amount** — large, focused on open, numeric ·
  **direction** segmented (Expense default) · **payment method** row (default UPI) · **category**
  row (default Uncategorized; hidden when direction = Income) · **date & time** row (default: now)
  · **account** field with a **past-account autocomplete** — each suggestion shows the account's
  remembered category; picking one **pre-fills that category** · **note** field (the card label —
  a short "what was this for?"; encouraged, not required) · **description** field (optional; a
  multi-line "more detail — who, why, split") · the same **custom numeric keypad** as §6.4 —
  amount-only, with the same collapse-on-scroll amount and OS-keyboard swap for the text fields ·
  primary **Add** (visually disabled until amount > 0) pinned **below the keypad** · **Cancel** in
  the header.
- States: *invalid* (amount empty / 0 → inline error, Add disabled) · *submitting* · *save error*
  (inline).
- Edge: paise shown when typed (`₹12.50`); a future date shows a subtle "scheduled?" helper; a
  long description scrolls inside its field; saved with no note → the card falls back to the
  account, else "No note".

### 6.6 Edit Transaction (sheet) · P0

Identical to Add (§6.5), pre-populated; title "Edit transaction"; primary **Save** pinned below the
keypad. **Cancel** shows a discard confirm if anything was changed. States: *default* · *invalid*
(a cleared required field disables **Save**) · *submitting* · *save error*.

- **V2 (CR-4):** same **Split…** row as §6.4 (Edit sheet). Editing the **amount** of a split transaction keeps
  every other person's share fixed and recomputes *your* share (= amount − the others); if that would go
  below ₹0, Save is disabled with the inline error "Others' shares are more than the amount — edit the split."

### 6.7 Transactions (list) · P0

**Plain-English:** a "ledger" is the traditional bookkeeping term for the complete, ongoing record
of every transaction — this screen is CoinFlow's full history, every transaction ever recorded, in
one browsable/searchable/filterable list (as opposed to Home's "Recent" list, which only shows the
latest handful). The full ledger — scan, search, filter, open. Entry: Transactions tab; Home
"uncategorized" row and "See all"; Analytics category drill-down (opens with filter chips
pre-set — arriving here already filtered to the category/period that was tapped on Analytics, per
§4's "drill into" explanation).

- Layout: top bar with a **search field** (note + description + account) and a **Filter** button
  showing an active-filter count · a row of **removable filter chips** when filters are set · the
  list as **one transaction card per row** (icon tile · label · **category name only** · signed
  amount — **no time of day** on this screen; the day header carries the date), grouped by day —
  the **day header (date + subtotal) is a plain label between card groups**, not inside a card ·
  footer spinner while loading more.
- Controls: search; Filter button → Filter sheet; filter chips (tap to remove); a card → Details;
  card swipe → **Delete** (confirm dialog + Undo snackbar).
- States: *empty (no data)* — empty state + **Add transaction**. *Empty (no matches)* — "No
  transactions match" + **Clear filters**, visually distinct from the no-data state. *Loading
  more* — footer spinner.
- Edge: 2,000+ rows scroll smoothly (**virtualized** — a performance technique where the app only
  actually builds/renders the handful of rows currently visible on screen, quietly recycling them
  as the user scrolls, instead of trying to build all 2,000+ rows in memory at once, which is what
  keeps a very long list scrolling smoothly instead of stuttering); amounts of very different
  magnitudes align on the decimal (e.g. `₹50` and `₹12,340` still line their digits up neatly using
  the tabular-numerals treatment from §3.2, rather than the shorter number drifting out of column
  alignment); deleting the last row of a day removes its header (if a day group shrinks down to
  zero transactions, its date header disappears too, rather than being left behind empty); a day
  with only income (is a perfectly valid, plainly-rendered case, not a special/error state).

- **V2 (CR-4):** a transaction that carries a split shows a small **users** icon + `Split · 2 of 3 paid`
  under its note, and (in the amount column) a second muted line **"Your share ₹30"**. The headline amount is
  still the real amount paid. A credit that settled a split shows `Settled Rahul's share` in the same place.
  Filter sheet (§6.9) gains a single **Splits** chip: *Has split · Settled a split*.

### 6.8 Transaction Details · P0

See everything about one transaction and act on it. Entry: any transaction row; post-add toast
"View" (the small confirmation snackbar shown right after saving a new transaction offers a "View"
shortcut straight to its Details); a **stale notification tap** (tapping on an old phone
notification some time after the transaction inside it has already been reviewed/saved elsewhere —
"stale" meaning "no longer fresh/current" — still correctly opens this Details screen for it).

- Layout: top bar with back + overflow (**Delete**) · **amount** large with its sign (V-10) · a
  **meta row** (a row of small secondary facts about the transaction, shown together: direction,
  category chip, payment method) · **note** (the heading line) · **account** (if present) ·
  **date & time** · **description** (if present) · for a detected transaction, a quiet **"Detected
  automatically"** provenance line (source + date; **no SMS text** — the message body is never
  stored, impl. P-9) · bottom-anchored **Edit** primary button.
- States: *manual* (no provenance line — a transaction the user typed in by hand simply has no
  "Detected automatically" line at all, since it wasn't detected) · *deleting* · *deleted* (screen
  **pops** — per §4's back-stack explanation, "pop" means this screen is removed from the
  navigation stack, returning the user to whatever screen was underneath it — with an Undo
  snackbar on the previous screen) · *edited* marker (P2 — a lower-priority, nice-to-have visual
  flag noting the transaction has been edited since it was first created; see the P0/P1/P2
  priority explanation in §1).
- Edge: missing note → "Add a note" inline control in place of the heading; Uncategorized → a
  prominent **Set category** control in the meta row; a future date is shown plainly (i.e. treated
  as a perfectly normal, valid value with no warning/error styling).

- **V2 (CR-4):** two new sections in Details, below the existing fields and above the provenance line:
  - **Split** (when the transaction has one): a card titled **Split** — first row **You · ₹30 · your share**,
    then one row per person: name · amount · a status chip (**Pending**, **Partly paid ₹100 of ₹300**,
    **Settled**, **Waived**) · a request line (`Requested by SMS · 14 Sep`, `Not sent`, `Sending failed`).
    Tapping a row opens a small actions menu: *Mark as paid…* (→ Merge sheet), *Resend request*, *Waive*,
    *Edit split*. Card footer: **Edit split**. Overflow gains **Remove split** (confirm dialog; deletes the
    shares and any settlements recorded against them — the settling transactions themselves stay).
  - **Settlements** (when a credit settled shares, or a debit settled requests): lines like
    `₹450 of this settled Rahul's share of "Momos"` / `₹200 of this paid Priya's request "Cab"`; each line
    links to the other transaction / request. A credit shows `Effective income ₹50` under the amount when part
    of it was used up.
  - Overflow gains **Split…** for any transaction without one (a debit, or a credit — credits can be split
    too, e.g. a shared refund) and **Merge into a split…** (§6.20).

### 6.9 Filter (sheet) · P0

Narrow the transaction list. Entry: Filter button on Transactions.

- Layout: grabber · title "Filter" · **Category** (multi-select chips — tappable chips where more
  than one can be turned on at once, e.g. filtering to both "Food" and "Groceries" simultaneously)
  · **Type** (segmented: All / Expense / Income) · **Payment method** (multi-select chips) ·
  **Date range** (preset chips: This month / Last 30 days / Last 3 months / Custom → reveals start
  + end date fields) · footer **Reset** (ghost — see the "ghost button" explanation in §3.6) +
  **Apply** (primary).
- States: *no filters* (Reset disabled) · *filters active*.
- Edge: custom range with start > end → inline error on **Apply**; a combination with no results
  is allowed (the list shows its no-match state).

### 6.10 Analytics · P1

Where the money went this period and how the days compare. Entry: Analytics tab. Reference:
`design-references/analytics.png` (structure). Card names are deliberately calm — no "Financial
Health", no "Spending Distribution".

- Layout (top → bottom):
  1. **Period control** — segmented **Month / Week** (a segmented switch, per §3.6, choosing
     whether the whole screen below is scoped to a calendar month or a calendar week) + a
     `‹ period label ›` **stepper** (a stepper is a pair of `‹`/`›` arrow buttons that step one
     unit backward/forward — here, one month or one week at a time — with the current one shown as
     text in the middle, e.g. "‹ August 2026 ›"); next is disabled on the current period (you can
     step back through history, but you can't step forward past "now").
  2. **"This month"** card — a greyscale **continuous circular arc** (see the "arc gauge"
     explanation in §3.6: a curved, half-ring-shaped progress bar) (a half-ring; fill = **share of
     income remaining** = Balance ÷ Income, i.e. how much of the ring is "filled in" represents
     what fraction of this period's income is still unspent) with the **Balance (Income − Spent)**
     and an **"N% of income left"** caption in its **hollow** (the empty circular gap in the
     middle of the ring/donut shape, where summary text can sit); below, **Income** `+₹…` and
     **Spent** `−₹…`. No **period-over-period** sentence on this card (i.e. this particular card
     does *not* include a "vs. last month" style comparison sentence — that comparison lives
     specifically on the Mean/Median tiles in item 3 below, not here).
  3. **"Mean" / "Median"** — two small tiles: mean daily spend (the everyday average — add up
     every day's spend and divide by the number of days) and **median** daily spend (the *middle*
     value if every day's spend were sorted from smallest to largest; the median resists a
     rent-day distortion — meaning one single unusually huge day, like a monthly rent payment,
     can drag the *mean* average way up, but barely moves the *median* at all, since the median
     only cares about which value sits in the middle of the sorted list, not how extreme the
     largest value is). **Each tile also shows the previous period's value** — this is where the
     period comparison now lives. The label tracks the period control: in **Month** mode it reads
     "Last month ₹1,410" (compared to the previous calendar month); in **Week** mode it reads
     "Last week ₹1,410" (compared to the previous **ISO week** — ISO week is the internationally
     standardized definition of "which 7-day span counts as one week", always running Monday
     through Sunday, used so "last week" has one unambiguous meaning rather than depending on
     which day the user happens to consider the start of their week). *(CR-1, resolving impl. D14
     — see change log, §9.)*
  4. **"Where it went"** — the category breakdown, **the one place colour appears** (V-11 / §3
     carve-out — the one deliberate exception to the whole app's no-colour rule, explained in §2,
     §3.1 and §5): a ranked list (colour dot · category name · % of spend · ₹ · a thin colour bar),
     then a **colour donut** (the ring-shaped pie chart described in §3.6). **Uncategorized** is
     its own row — hatched, not coloured (drawn with the diagonal-stripe pattern from §3.1's
     category-palette note, rather than being given an actual colour) — with a **"Fix N"**
     affordance (a small button/link reading e.g. "Fix 4", meaning "4 uncategorized transactions
     — tap to go categorize them").
  5. **"Day by day"** — a greyscale line/area chart (a chart drawn as a line connecting each day's
     value, optionally with the area underneath the line shaded in — a standard way to visualize a
     value changing over time) of daily spend across the period, with a Month / Week toggle and a
     **dashed mean line** across it (labelled "avg ₹…" — a single flat dashed horizontal line drawn
     across the whole chart at the height of the average value, so it's easy to see at a glance
     which days were above or below average). A one-off **outlier** (e.g. rent — a data point far
     outside the normal range of the rest of the data, a standard statistics term) peaks off the
     everyday scale and is labelled inline rather than compressing the rest of the curve (i.e.
     instead of stretching the whole chart's vertical scale to fit one huge rent-day spike — which
     would squash every ordinary day's variation down to nearly a flat line — that one spike is
     capped/labelled specially so the everyday days stay readably-scaled).
  6. **"Biggest expenses"** — top ~5 individual transactions (label · category · date · amount)
     → Details.
- Controls: period control + stepper; category rows → Transactions filtered to that category +
  period; biggest-expense rows → Details.
- States: *empty (no data in period)* — "Nothing recorded for August" + **Add transaction** / step
  to a period with data. *Insufficient data (no prior period)* — meaning there isn't an earlier
  month/week to compare against yet (e.g. a user's very first month using the app) — the "Last
  month …" / "Last week …" comparison values on the daily tiles are hidden. *Loading* — skeleton
  cards + chart / bar placeholders.
- Edge: one category ≈ 90% of spend (donut + bars still legible; the list is not truncated);
  income but zero spend (spend sections show their empty state; the "This month" card still shows
  Balance = Income); a **negative Balance** shows a leading `−` and the arc fills full; a current
  incomplete month bases the averages on days elapsed (e.g. on the 10th of the month, "mean daily
  spend" is calculated over 10 days, not treated as if the whole month had already passed).
- **Deferred to a later release:** a "Top accounts" section, a **run-rate projection** (a forecast
  of where a number is likely to land by the end of the period, extrapolated from the pace so far
  — e.g. "at this rate you'll spend ₹40,000 by month's end"), and the "Worth noting"
  **auto-insight cards** (small cards where the app would automatically call out a
  noteworthy pattern in the data, written in plain language, without the user asking for it). Not
  in this V1 screen — all three ideas are explicitly pushed to a future release, not part of what's
  being built now.

### 6.11 Categories · P1

Manage the category set. Entry: Settings › Categories; "Manage categories" from any category
selector.

- Layout: top bar "Categories" + **＋ Add** · **Default** section (the 9 default rows: icon, name,
  usage count [P2]) · **Custom** section (user rows, or its empty state "No custom categories
  yet"). No lock icons or badges anywhere — every category is editable.
- Controls: **Add** → Create sheet; any row → Edit sheet; row swipe → **Delete**. **Other** and
  system **Uncategorized** can be renamed / re-iconed (given a different icon) but not deleted (no
  swipe action) — this is silent, not marked with a lock (i.e. there's no lock badge or explanation
  telling the user these two are special; the delete option is simply absent for them, discovered
  naturally rather than called out).
- Edge: a long category name truncates in the row; deleting a heavily-used category → the confirm
  dialog states "N transactions become Uncategorized".

### 6.12 Create / Edit Category (sheet) · P1

Define one category. Entry: **Add** or a row on Categories.

- Layout: grabber · title "New category" / "Edit category" · **name** field (≤ 24 chars) ·
  **icon** picker (fixed set grid — carries category identity now that there is no colour) ·
  **Save** (disabled until the name is non-empty and unique) · on edit — **Delete** (ghost;
  custom categories only).
- States: *valid* · *invalid* (empty or duplicate name → inline error).
- Edge: an emoji in the name counts toward the 24-char limit; icon reuse across categories is
  allowed.

### 6.13 Settings · P1

A grouped list — **Categories** · **Payment methods** · **SMS & notifications** (subtitle "On" /
"Off"; warning icon when off) · **Account rules** · **Data** · **About**. Each row pushes its
page; app version in the footer. Static.

### 6.14 Settings subpages

- **Payment methods (P1):** a read-only list of the five payment methods with icons; footer note
  "Custom accounts are coming later."
- **SMS & notifications (P1):** two status blocks (SMS read; Notifications), each with a state
  pill and an **Enable** / **Open system settings** button; a short "Which messages CoinFlow
  reads" explainer.
- **Account rules (P2):** a list of learned account rows (account · remembered **note** ·
  **category** chip · usage count); row → edit the note / category; row swipe → delete; empty
  state until the first rule is learned. Drives F8 (`SPEC-implementation.md`) — the memory behind
  the notification's one-tap **Save**. The screen is designed (see `p1-screens.html`); whether it
  ships in V1 or the learning stays silent is a product call tracked in
  `SPEC-implementation.md` §15 — it does not affect this spec.
- **Data (P1):** an **Export** row (opens the OS share sheet — the phone operating system's own
  built-in "share to..." menu, the same one used to share a photo to another app, letting the
  exported file be sent to email/drive/etc rather than CoinFlow building its own custom sharing
  UI); a **Clear all data** row (bold, destructive weight — no colour) → a two-step confirm
  (second step requires typing `CONFIRM`, per the two-step confirm dialog described in §3.6).
- **About (P1):** version; the line "All your data stays on this device."; a licenses link;
  source / help links.

- **V2 (CR-4):** two new rows, **Splits & people** and **Widgets** (both specified in §6.24). The
  Settings hub gains no other change.

### 6.15 Transaction notification (system surface) · P0

**This is the core loop** — a bank SMS lands, CoinFlow reads it, and the user acts from the lock
screen: one tap for a known account, or **Add** to review a new one — without opening the app.

- **Single suggestion:** app row (CoinFlow · relative time); **title** = `₹450 debited` (or
  `credited`) — the amount + direction; **body** = the **account** (`Swiggy`, or the raw payee /
  **VPA** — "Virtual Payment Address", the `name@bank` -style identifier UPI, India's real-time
  payments system, uses to identify who money is being sent to/from, e.g. `swiggy@icici`) +
  payment method (`Swiggy · UPI`); "Unknown account" when it did not parse (the SMS parser
  couldn't extract a recognizable account/payee name at all). The **buttons depend on whether the
  account is already known** (a saved `AccountRule` — a remembered pairing of one account with the
  note/category/payment-method the user has used for it before, so future transactions from that
  same account can be auto-filled or even one-tap-saved; impl. F8):
  - **Known account — three buttons:** **`Save`** (writes the transaction straight from
    the rule — note + category + method — plus the parsed amount / date; app never opens),
    **`Add`** (opens the **Confirmation sheet** pre-filled from the rule), **`Discard`**. When the
    rule has a category but no stored note the button is just **`Save`**.
  - **New account — two buttons:** **`Add`**, **`Discard`**. No one-tap save until the account has
    a note.
  - **Body tap** (not the buttons) → the **Confirmation sheet** for a full review.
- **Group (2+ pending):** summary `3 transactions to review`; tap → Review Queue. (No per-item
  buttons on the group.)
- Rendered in the **OS notification channel style** (Android in V1 — Android groups notifications
  into "channels" per app/purpose, each with its own default visual style the OS controls; this
  notification simply uses that standard system-provided look rather than a fully custom design);
  no custom large imagery. In the black-and-white prototype it is shown **monochrome** (rendered in
  shades of a single colour/greyscale, to match the prototype's black-and-white presentation); the
  real build inherits the system theme (on an actual phone, it will pick up whatever colours the
  user's real Android notification theme uses, since notifications are drawn by the OS, not fully
  controlled by CoinFlow).

- **V2 (CR-4):** a second notification kind — the **split request** (§6.21) — with its own channel
  ("Split requests"). It follows the same rules as this section (OS-drawn, monochrome in the prototype).

### 6.16 Global components

- **Bottom navigation bar** — four icon tabs (Transactions = clock / history) + a raised, filled
  circular **Add** in the center; the active tab is full-contrast white, inactive tabs are muted
  grey; **Add** never takes a selected state.
- **Toast / snackbar** — bottom, above the nav bar; auto-dismiss ~5 s; optional single action
  ("Undo", "View").
- **Permission banner** — slim, neutral (surface fill + hairline, no tint); alert glyph + message
  + **Enable** + dismiss ✕ (V-9).
- **Empty state** — centered small icon / illustration, one line of text, one primary button.
- **Loading skeleton** — neutral blocks matching the target layout; no spinners on full screens.
- **Confirm dialog** — quiet glyph, title, short body; **stacked** actions — the confirm on top
  (filled + bold when destructive, no colour), a plain-text **Cancel** below.

### 6.17 Split (sheet) · V2

**Entry:** the **Split…** row in the Confirmation / Edit sheets (§6.4, §6.6), the Details overflow / card
(§6.8). Same sheet chrome as §6.4 (grabber, swipe-down and Cancel close it; §3.6 sheet rules). Two
**stages** inside one sheet, with a slim two-dot step indicator: **1 · People**, **2 · Amounts**.

**Terms (used everywhere in V2 UI copy):** the **split** is the transaction being shared; a **share** is one
person's portion; a **request** is the SMS asking them to pay it. Copy says "share" and "request", never
"debt".

**Stage 1 — People**
- Header: **Split ₹90** · a one-line echo of the note (`Momos`). Search field (filters all lists below).
- Selected people appear as removable chips in a row above the list.
- Sections, in order: **Saved people** (people already used in CoinFlow, most recent first) · **Contacts**
  (device contacts; **only shown once contacts access is granted**) · an **Add a number** row (opens a small
  inline form: optional name + 10-digit mobile → adds a chip). Multi-select via a trailing check.
- **Contacts access is optional and asked just-in-time:** if not granted, the Contacts section is replaced by
  one row **"Choose from contacts"** with a one-line reason ("Only used to pick who to ask — nothing is
  uploaded"). Denied/permanently denied → the row stays, its action opens system settings (same behaviour as
  IMP-042). Everything except that row works without contacts.
- Primary **Continue** (disabled until ≥ 1 person). No hairline/tint tricks: same button as §3.6.

**Stage 2 — Amounts**
- A **₹ | %** segmented control (default ₹). Rows: **You** first (fixed, shown but not removable), then one
  row per person. Each row: avatar initial · name · an amount (or percent) field.
- **Default = equal split.** Any edit makes that row "custom"; the rest re-share the remainder equally; an
  **Equal** text-button resets. Rounding: leftover paise go to **You** (IMP-071).
- Live footer: **Remaining ₹0** (muted) or **Remaining ₹12** / **Over by ₹12** (bold, no colour — §3.1 has
  no error colour outside destructive). Primary is disabled unless remaining is exactly 0.
- Primary **Send requests** (label becomes **Save split** when SMS sending is unavailable or the user turned
  it off for this split with the small **Don't send now** text-button). Secondary text-button **Back**.
- **Send flow:** on tap, if SEND_SMS is not granted the OS prompt is shown with a one-line rationale; if it
  is denied, each recipient's message is opened in the user's SMS app pre-filled, one at a time (decided —
  V2-PLAN §5.5). A **result list** replaces the stage: per person `Sent`, `Sending failed · Retry`, or
  `Opened in Messages`; **Done** closes the sheet. A failure never loses the split — it is saved first, the
  request just stays `Not sent` and can be resent from Details.
- (CR-7: the footnote "don't appear in Messages" was removed — on tested hardware the sent text *is* stored in the
  Sent box, so the claim is not reliable.)
- **Edit mode** (opened on an existing split): same two stages, pre-filled. Changing an amount that was
  already requested shows `Changed since requested` on that person and offers **Resend** on Done. Removing a
  person who has settlements is blocked (their row is disabled with the reason).
- States: empty search · no contacts · permission denied · sending · partial failure · offline-irrelevant
  (SMS needs no data connection). Edge: a person's number equals your own → inline "That's this phone";
  a duplicate number merges into one chip.

### 6.18 People & the "You" row — copy and edge rules · V2

- A person is shown by **name**, falling back to the number (`98•••• 4521` masked to the last 4 in lists,
  full number only on the person's own action menu). Initials avatar on the neutral surface — no photos, no
  colour (§2 illustration policy).
- Two people may share a name; the number is the identity. Renaming updates everywhere.
- **You** is always row 1 of any split and can be ₹0 (someone else paid entirely for you, or you're just
  collecting). It cannot be negative.

### 6.19 Splits (pushed page) · V2

**Entry:** the Home "Owed to you" row (§6.2), Settings › Splits & people, and the request notification (body
tap). Top bar: back · title **Splits**. A three-segment control (same component as Month / Week, §3.6):
**Owed to you · You owe · Requests**.

- **Owed to you** — grouped **by person** (largest outstanding first). Group header: name · **₹450 owed**.
  Rows under it: the split's note · that share's amount · status chip · date. Tap a row → that transaction's
  Details (Split card). Group action menu: *Mark all paid…*, *Send reminder* (resends the request SMS text).
- **You owe** — accepted incoming requests (§6.21) grouped by requester, same row shape, with a **Merge…**
  button per row (→ §6.20). Header total: **₹N you owe**.
- **Requests** — two sub-groups: **Unattended** (received, not yet accepted or rejected — includes ones the
  user swiped off the notification) and **Accepted**. An unattended row shows **Accept** and **Reject**
  buttons inline; Reject is one tap with an Undo snackbar (the request is discarded silently — the sender is
  **not** told). A badge with the Unattended count shows on the segment.
- States: empty per segment ("Nobody owes you anything." / "You don't owe anyone." / "No requests."),
  loading skeleton, settled items hidden behind a **Show settled** row at the bottom of each segment.

### 6.20 Merge (sheet) · V2

Answers "which split did this payment settle?". **Entries:** Details › **Merge into a split…** / the person
action *Mark as paid…* / the **Suggested settlement** banner / the **Merge…** button in Splits › You owe.

- Header: **Merge ₹450** and the transaction's note/account.
- Body — a checklist of **candidates** (open items only):
  - a **credit** merges into **shares people owe you** (Owed to you), grouped by person; a **debit** merges
    into **requests you owe** (You owe).
  - The best match, if any (§6.20 "match"), sits on top under a **Suggested** label with its box pre-ticked.
- Each ticked row shows an amount field defaulting to the item's remaining amount, capped by what's left of
  the transaction. Footer: **₹450 of ₹450 used** (muted). **No leftover handling (decided):** if the payment
  is larger than what is ticked, the rest simply stays an ordinary transaction — nothing to choose, nothing
  to discard.
- Primary **Settle** (disabled until ≥ 1 ticked with amount > 0). Result: the sheet closes and a snackbar says
  `Settled Rahul's share — ₹450` with **Undo**.
- **Match rule (display side):** the top suggestion is an open item whose remaining amount equals this
  transaction's amount exactly, and (if the transaction has an account/name) whose person's name matches it;
  otherwise the list is ordered by |remaining − amount|. It is only ever a suggestion (impl. §40.4).
- The **Suggested settlement** banner (Confirmation sheet and Details, credits only): a quiet card,
  `Looks like Rahul paying ₹450` · **Settle** · **Not this** (dismiss = hide for this transaction).

### 6.21 Split request notification (system surface) · V2

- **Received request:** title `Rahul requested ₹450`; body `for Momos · CoinFlow split`. Two actions:
  **Accept** (adds it to *You owe*, no app open) and **Reject** (discards silently, no app open). **Body tap**
  → Splits › Requests (Unattended). Number not among saved people → the body adds `· not in your people`.
- **Grouped (2+):** `3 split requests` → Splits › Requests.
- **Swiping the notification away never loses it:** the request is stored as *Unattended* at the moment it
  arrives, whatever the user does with the notification.
- Own channel **Split requests** (importance default — quieter than the transaction channel, no heads-up).
- **Withdrawn request** (the sender cancelled): the notification is removed and, if it was Accepted, the row
  moves to *Settled*-hidden with `Withdrawn by sender`.
- **Never auto-acted:** nothing in this flow pays, accepts or replies without a tap.

### 6.22 Widget · Money summary · V2 (PROVISIONAL)

- Header line: **September** (the calendar month — same period as the Analytics "This month" card).
- **Balance** large (`₹12,480`, negative with leading `−`) — defined as **Income − Spent** for the month,
  identical to the Analytics card (§6.10, UI-051), i.e. it uses *effective* amounts (§6.17). Under it two
  columns: **Income** and **Spent**, each `₹` amount in the secondary text size.
- **Sizes:** 4×2 (default; all three numbers) and 2×2 (Balance + Spent only). Resizable between the two.
- **Look:** near-black `#0B0B0C` tile, `#F5F5F2` text, hairline border, 24 dp radius (`§3.3` card radius),
  Manrope Bold for the balance, Geist for labels. No colour, no chart, no category palette (`UI-054`).
- **Tap** anywhere → Home. **Hide amounts** on → every ₹ figure shows `••••`.
- **States:** *empty month* (`₹0` figures — not an error); *stale month* (the phone rolled into a new month
  and CoinFlow hasn't refreshed the data yet) → figures show `—` and the header shows the new month until the
  app next runs (impl. §44.5); *never opened* → the tile shows **"Open CoinFlow to set up"**.

### 6.23 Widget · Queued transactions · V2 (PROVISIONAL)

- Header: **To review** with a count pill (`3`). Body: up to **3** rows — account/label · `₹450` · debit/credit
  arrow glyph — newest first; a footer line `+2 more` when there are more.
- **Sizes:** 4×2 (count + 2 rows; the default) and 4×3 (count + 3 rows). **No 2×2 variant** (dropped by the user, 2026-09-19).
- **Tap:** a row → that suggestion's Confirmation sheet (`coinflow://review?open=<id>`, the existing §28.3
  link); anywhere else → Review Queue.
- **States:** *empty* → checkmark glyph + **"All caught up"**; *hide amounts* → `••••` in place of amounts,
  labels stay visible (UI-095).
- Same look tokens as §6.22.

### 6.24 Widget · Quick add · V2 (PROVISIONAL) — and Settings pages

- **Widget:** a single tile with a **+** glyph (1×1); at 2×1 it adds the label **Add transaction**. Same
  tokens as §6.22 (the tile is `#F5F5F2` with a `#0B0B0C` glyph — the same inversion as the tab-bar Add FAB,
  §6.16). **Tap** → opens the Add sheet directly (`coinflow://add`); if the app was closed it cold-starts
  straight to Home with the sheet already presented. No data is shown, so **Hide amounts** has no effect.
- **Settings › Widgets** (pushed page): a **Hide amounts on widgets** switch (default **off**, decided as
  the default — V2-PLAN §5 open item; flip the default here if you prefer) with one line "Amounts show as
  •••• on the home screen. Labels stay visible."; a short **How to add a widget** card (long-press the home
  screen → Widgets → CoinFlow) — there is no in-app "pin widget" prompt in V2.
- **Settings › Splits & people** (pushed page): **Contacts access** row (Not asked / Granted / Denied with
  Enable, same visual states as `UI-063`); **Your name in requests** text field (optional, ≤ 20 chars; empty ⇒
  requests carry no name); **Requests are sent from** — read-only row "Default SIM" (decided; V2-PLAN §5
  open item); **Saved people** list (name, masked number, a delete swipe — disabled with a reason while the
  person has an open share or request); **Unattended requests** row → Splits › Requests.

### V2 design gate

The widget tiles (§6.22–§6.24) are built as a coded prototype first — `design-prototype/01-midnight/widgets.html`,
one frame per widget per size, per state, on a mock launcher — and shown to the user. **No widget Kotlin or
layout XML is written until the user approves the prototype** (`UI-099`); changes they ask for are folded back
into this spec through a follow-up CR before implementation.

---

## 7. Visual acceptance criteria

> **Plain-English — what "acceptance criteria" are:** an acceptance criterion is a specific,
> checkable statement of "this is done correctly when ___ is true" — the kind of thing someone
> (a developer, a reviewer, an automated test) can look at the finished, running app and answer
> either "yes, this holds" or "no, it doesn't" with no ambiguity. Instead of vaguely saying "the
> Home screen should look nice," this section spells out concrete, testable statements like
> "the hero shows a 'Total balance' label and the running balance as its large figure" — something
> that's either visibly true or visibly false once the app is built. Each one gets a short id,
> `UI-0xx` (numbered starting from 001, grouped by the screen/area it applies to), purely so other
> documents — and later, actual automated or manual tests — can refer to that exact requirement by
> name instead of re-describing it. This is the same "give it a stable id so other documents can
> point at it precisely" idea used for the `V-#` rules in §5.

Presentational checks only (these criteria are strictly about *what things look like and how they
visually behave* — not about whether the underlying data/logic is correct, which is a separate
concern) — the list is frozen; each criterion is **unverified** until the build checks it against
the running app (meaning: as of this document being written, these are simply the target — nobody
has yet gone through the finished, running app row by row confirming each one holds true; that
confirmation is a separate, later step in the project). Behavioral acceptance (equivalent
checkable criteria, but for how the app *behaves* / what data it produces, rather than how it
*looks*) lives in `SPEC-implementation.md` as `IMP-0xx` (traceability — the practice of being able
to follow a single requirement all the way from its origin to its proof of completion:
`UI-0xx → IMP-0xx → component → test`, i.e. each visual requirement here is expected to be
traceable forward to a corresponding technical requirement in the implementation spec, then to the
actual code component that implements it, then to an actual automated test that checks it).

**Global** — `UI-001` money uses `₹` + Indian grouping and always shows a `+` / `−` sign; **no
foreground element uses colour** (black / white / grey), so nothing — direction, status, category,
chart series — is distinguished by hue. The only colour anywhere is the two sanctioned exceptions
(V-11): the Analytics "Where it went" breakdown, and the cool ambient wash on the app ground ·
`UI-002` no full screen renders a blank region while
loading (skeleton matches the target layout) · `UI-003` every list / summary empty state contains
exactly one primary action · `UI-004` every error state = short message + retry, no raw codes (never showing a technical error
code or stack trace to the user — only a plain human sentence) ·
`UI-005` Uncategorized renders distinctly in every list — the "?" icon tile + the word
"Uncategorized" dashed-underlined (no chip) · `UI-006` app renders
correctly in dark mode and at the largest font scale — no clipping, contrast holds · `UI-007`
bottom bar = Home / Transactions / Analytics / Settings plus a distinct Add that never selects;
Transactions uses a clock icon · `UI-008` sheets show a grabber, dim the background, and prompt to
discard unsaved input on dismiss · `UI-009` destructive actions use a filled, bold confirm button
(no colour) and route through a confirm dialog.

**Home** — `UI-010` the hero shows a **"Total balance"** label (no month) and the running balance
as its large figure; **Income** and **Spending** sit below as two non-interactive tiles, each with
this month's total and a percent-change-vs-last-month line · `UI-011` "review" and
"uncategorized" rows show only when count > 0, each with the count ·
`UI-012` recent list shows ≤ 8 rows plus a "See all" · `UI-013` new-user Home shows the **zero-
state** (another name for the "empty" state from V-3, §5, specifically for a brand-new user who
has ₹0 and no transactions yet) with an Add CTA · `UI-014` when SMS or notifications are off, Home shows the permission banner with
an Enable action.

**Detection surfaces** — `UI-020` Confirmation sheet always shows amount + direction, plus
category, payment method, date/time, account, note, and description; it never shows or stores the
raw SMS text ·
`UI-021` no field carries a confidence / "check this" marker — every field is shown plainly and
is editable · `UI-022` selecting Income (Confirmation or Add) hides the category row · `UI-023`
Review Queue empty state reads "caught up", styled calm not as an error · `UI-024` a
single-suggestion notification shows amount + direction + account; for a **known account** it
offers **`Save`**, **`Add`** and **`Discard`**, for a **new account** just **`Add`**
and **`Discard`**; a body tap opens the Confirmation sheet; 2+ pending collapse into a group
notification (→ Review Queue, no per-item actions).

**Add / Edit** — `UI-030` Add opens with the amount field focused; Add is visually disabled until
amount > 0 · `UI-031` Edit is identical to Add, pre-populated, with a Save button · `UI-032` on
any single-transaction screen the amount is the largest element on screen.

**Transactions / Details** — `UI-040` each transaction is its own card; day headers (date +
subtotal) are plain labels between card groups; every card has a category icon tile (inverted for
income) · `UI-041` active filters appear as removable chips, and the filter button shows a count ·
`UI-042` the no-match and no-data empty states are visually distinct · `UI-043` swipe-delete
surfaces a confirm dialog and, after deletion, an Undo snackbar · `UI-044` Details shows amount, a
meta row (direction / category / payment method), the note as a heading, the account (when
present), date/time, and description (when present) · `UI-045` in the Add / Confirmation / Edit
sheets the in-app numeric keypad is **amount-only** and docked at the bottom with the primary
action button pinned **below** it; Account / Note / Description raise the OS keyboard instead
(primary button above it), and the amount only collapses to a slim summary bar once the body is
scrolled to the fields; a detected transaction's Details shows a text-free "Detected
automatically" provenance line (manual transactions show none) · `UI-046` an Uncategorized transaction's Details shows a
prominent "Set category" control.

**Analytics** — `UI-050` Analytics shows a Month / Week control and a period stepper · `UI-051`
the "This month" card shows the Balance (Income − Spent) and a "N% of income left" caption inside
a greyscale **continuous circular arc** (fill = share of income **remaining** = Balance ÷ Income),
plus the Income / Spent components; no period-over-period sentence on this card · `UI-052` the
"Where it went" card
shows a ranked list + a donut, **both coloured from the category palette** (the only coloured
element in the app), with Uncategorized as its own hatched row + a "Fix" control · `UI-053` an
empty period shows an explanatory empty state, not a zeroed chart · `UI-054` no colour from the
category palette appears outside the "Where it went" card — the arc gauge and the "Day by day"
chart are greyscale ·
`UI-055` the "Mean" and "Median" daily-spend tiles each show the current value and the previous
period's value (labelled "Last month" in Month mode, "Last week" in Week mode — CR-1); the "Day by
day" chart carries a dashed mean line · `UI-056` "Biggest expenses"
lists ~5 ranked rows linking to Details.

**Categories / Settings / Onboarding** — `UI-060` the Categories screen lists the nine defaults
plus any custom rows, all visually identical and editable — no lock icon or badge; Other and
Uncategorized simply have no swipe-delete · `UI-061` Create / Edit Category
disables Save until the name is non-empty and unique · `UI-062` first launch shows the three-step
onboarding; later launches go straight to Home · `UI-063` each permission card shows a not-asked /
granted / denied visual state, and the Notifications card is marked **Optional** · `UI-064` the
Settings "SMS & notifications" row shows an On / Off subtitle and a warning icon when off ·
`UI-065` Settings › Data › Clear all data requires a
two-step confirm.

**Splits (V2, CR-4)** — `UI-070` the Confirmation and Edit sheets and Transaction Details each offer **Split…**
(and **Merge into a split…** in Details) and a transaction with a split shows **Split with N · ₹X yours** in
that row · `UI-071` the Split sheet's People stage has search, chips for the selection, **Saved people**,
**Contacts** (only once access is granted, otherwise a single "Choose from contacts" row) and **Add a number**,
and **Continue** is disabled with nobody selected · `UI-072` the Amounts stage lists **You** first, defaults to
an equal split, has a ₹ | % toggle, shows **Remaining / Over by**, and enables **Send requests** only when
remaining is exactly ₹0 · `UI-073` after sending, the result list shows a per-person `Sent` / `Sending failed ·
Retry` / `Opened in Messages` state and a failed send never discards the split · `UI-074` Details shows a
**Split** card (You + each person with a Pending / Partly paid / Settled / Waived chip and a request line) and
a **Settlements** section · `UI-075` list rows show the split badge and a muted **Your share ₹N** line while
the headline amount stays the real amount · `UI-076` the **Splits** page has Owed to you / You owe / Requests
segments, grouped by person, with the per-segment empty states and a **Show settled** row · `UI-077` the
**Merge** sheet lists only open candidates, pre-ticks a single best **Suggested** match, caps each amount by
what remains, and shows **₹X of ₹Y used** with no leftover step · `UI-078` a credit that matches an open share
shows the **Suggested settlement** banner with **Settle** / **Not this** · `UI-079` a received request
posts a notification with **Accept** and **Reject**, on its own channel, grouped when 2+; swiping it away
leaves the request under Splits › Requests › Unattended · `UI-080` Settings › **Splits & people** shows
Contacts access (with visual states), Your name, the read-only SIM row, and Saved people · `UI-081` Home shows
an **Owed to you ₹N** row only when N > 0.

**Widgets (V2, CR-5)** — `UI-090` **Money summary**, **Queued transactions** and **Quick add** all appear in
the launcher's widget picker with a preview and a one-line description · `UI-091` Money summary shows the
month's Balance (Income − Spent, effective) with Income and Spent, in 4×2 and 2×2 · `UI-092` Queued
transactions shows a count and up to three rows, `+N more`, and an "All caught up" empty state; a row tap opens
that suggestion's Confirmation sheet and any other tap opens the Review Queue · `UI-093` Quick add opens the
Add sheet directly, including from a cold start · `UI-094` with **Hide amounts on widgets** on, every ₹ figure
on the two data widgets reads `••••` · `UI-095` labels (account names, month) are never masked by that switch ·
`UI-096` widgets use only the greyscale tokens — no category-palette colour (extends `UI-054`) · `UI-097` a
widget whose data belongs to a past month shows `—`, never last month's numbers under this month's name ·
`UI-098` Settings › **Widgets** has the Hide-amounts switch and the how-to-add card · `UI-099` **design gate:**
the widget designs have been reviewed and approved by the user before any widget implementation begins —
**cleared 2026-09-19** (CR-6).

---

## 8. Resolved visual decisions

> **Plain-English — what this section is:** while a spec like this is being written, various
> open questions come up ("should X work this way or that way?"). This section is a running record
> of exactly those questions and their final answers — a **decision log** — so that if someone
> later asks "wait, why doesn't the Home top bar have a Settings shortcut?", the answer is written
> down here rather than having to be re-litigated from scratch or guessed at. Each entry below is
> phrased as "topic — the decision (+ where it's designed/detailed)".

Home top bar — a Settings shortcut, given Settings is a tab? (no) · Analytics "Where it went" —
coloured ranked list + donut (the one colour carve-out); "Day by day" is a greyscale line/area
chart · category picker surface — full sheet (designed, §6.4/§6.11) ·
amount input — a custom in-app numeric keypad, **amount-only**, docked at the bottom of the Add /
Edit / Confirmation sheets with the primary action button pinned **below** it; the text fields use
the OS keyboard and the amount collapses to a summary bar on scroll (designed, §6.4) ·
typeface — **Manrope** (headings + figures) + **Geist** (UI text), bundled with a system-stack
fallback (§3.2) ·
source SMS — the raw message is **not shown in the UI or stored**; the parser uses it in memory
only (impl. P-9), so there is no "view original SMS" component · center Add treatment — raised
**"FAB notch"** ("FAB" = Floating Action Button, a common mobile-design term for a prominent,
circular, raised button that floats above the rest of the UI rather than sitting flush in a
toolbar — here, the "notch" is the little scalloped cut-out shape in the bottom nav bar that the
raised Add button visually pokes up out of) (**native-tabs constraint** noted for implementation —
a reminder to whoever builds this that Expo Router's built-in `NativeTabs` navigation component,
mentioned in this project's CLAUDE.md, cannot produce this raised-notch look on its own, which is
why CoinFlow uses its own custom-built tab bar component instead — see CLAUDE.md's Architecture
notes) · Transactions section headers —
per-day subtotal · onboarding illustrations — abstract black-and-white graphic compositions per
step, no commissioned art (§6.1) · icon library — **Lucide** (`lucide-react-native`), the family
the prototype was already tracing (§3.4) · motion — three timing tokens + three easing curves,
per-surface transitions, Reduce-Motion fallback (§3.5) · **light theme — dropped from V1; the app
ships one dark theme (§2), light is Future.**

**Nothing open.** All of §3 (§3.1–§3.7) and every screen spec are frozen. The one product-side
question that touches a designed screen — whether Settings › Account rules ships in V1 or the
learning stays silent (§6.14) — is tracked in `SPEC-implementation.md` §15 and does not change
the visual spec either way.

---

## 9. Change log (post-freeze)

> **Plain-English — what a "change log" is, and why it's needed for a "frozen" document:** once
> this spec was declared **frozen** (locked, per the note at the very top of this document), it
> can no longer just be silently edited whenever someone thinks of a tweak — any real change has
> to be proposed, recorded, and justified as a formal **change request**, abbreviated `CR-#`
> (numbered in the order they're accepted, starting from 1) and logged here — "post-freeze" simply
> means "after the freeze happened". This keeps a clear, permanent trail of exactly what changed
> from the originally-frozen version, when, why, and under whose decision — instead of the
> document quietly drifting from what it originally said with no record of it.

Change-requests accepted after the v1 freeze, per `SPEC/PLAN.md` §10 (spec updated first, then
implementation follows — meaning: even after freeze, the correct order for any change is still to
update this design spec *first*, and only then go change the actual app code to match, never the
other way around).

- **CR-1** (2026-09-01, `SPEC-implementation.md` Phase 3 / D14) — **Analytics Week-mode
  comparison label.** §6.10 item 3 and `UI-055` originally specified only "Last month ₹…" on the
  Mean / Median tiles. Week mode (D14, ships in V1) needs a comparison too, so the tile label is
  now **period-aware** (the text of the label itself changes depending on which period mode —
  Month or Week — is currently selected): "Last month" (vs the previous calendar month) in Month
  mode, "Last week" (vs the previous ISO week) in Week mode. The empty-state wording ("no prior
  period") and `UI-055` are updated to match. No layout or component change — same tile, dynamic
  string (i.e. this was a small, contained fix — only the text displayed changes; the tile's
  size/position/styling is untouched).

- **CR-2** (2026-09-18, on-device testing — `SPEC/SPEC-implementation.md` §37 CR-13) —
  **Onboarding Permissions step gains a crash-reports opt-in.** §6.1's Permissions step listed two
  cards; the app had already shipped a third optional **Crash reports** card (impl. CR-7), and
  **Continue** now also offers the same opt-in through a "Send crash reports?" confirm dialog
  (Enable crash reports / Not now) after the OS permission prompts, if it's still off. Default stays
  OFF; nothing is enabled without an explicit tap. Also: (§6.3 Review Queue) the card's dismiss
  control is a plain **×** glyph rather than a ⋮ overflow — it dismisses immediately, there is no
  menu; (§6.4–§6.6 sheets) **Date & time** is chosen with a calendar-grid + hour/minute stepper
  picker instead of two typed `yyyy-mm-dd` / `hh:mm` fields.

- **CR-3** (2026-09-18, brand identity — `SPEC/SPEC-implementation.md` §37 CR-14) — **App icon and
  splash mark defined: a plain ₹.** The spec had no logo or icon definition (§2's illustration policy
  only covers onboarding graphics; the splash was the unmodified create-expo-app template mark on
  Expo blue). The CoinFlow mark is now the **₹ character in Manrope Bold** (§3.2's display face),
  off-white `#F5F5F2` on the app's near-black `#0B0B0C` — black-and-white, consistent with §2's
  direction. It is the launcher icon (dark tile), the Android adaptive-icon foreground/monochrome
  layers (kept inside the adaptive safe zone), the web favicon, and the splash mark. The splash
  background is `#0B0B0C` (was `#208AEF`); the in-app splash overlay shows the same image at the
  same size as the native splash so the handoff doesn't jump. A custom "C-shaped bowl" ₹ was
  explored and dropped in favour of the standard glyph. No screen layout change.

- **CR-4** (2026-09-19, V2 planning — `SPEC/V2-PLAN.md`; linked `SPEC/SPEC-implementation.md` §37 CR-17 /
  CR-18) — **Split payments UI added.** New: Split sheet (People → Amounts stages, §6.17), people rules
  (§6.18), Splits page (§6.19), Merge sheet + suggested-settlement banner (§6.20), split-request notification
  (§6.21), Settings › Splits & people (§6.24), and criteria `UI-070`–`UI-081`. Edited V1 screens (pointer
  paragraphs only, no layout regressions): Home gains an "Owed to you" row (§6.2), Confirmation / Edit gain
  **Split…** (§6.4, §6.6), the list rows gain a split badge + "Your share" line (§6.7), Details gains a Split
  card, Settlements section and overflow items (§6.8), Filter gains a Splits chip (§6.9), Settings gains two
  rows (§6.14), the notification section notes the second kind (§6.15). **Decisions recorded from the plan:**
  Split is available in the Confirm/Edit sheets **and** on Details; if SMS sending is denied the message is
  opened pre-filled in the SMS app; a payment larger than what it settles has **no leftover handling** — the
  transaction just records how much of it settled which split; auto split detection is deferred to **v2.1** (not
  in this CR). **Defaults chosen for the still-open items** (flip via a follow-up CR): requests go from the
  **default SIM**; the request text is readable without CoinFlow.

- **CR-5** (2026-09-19, V2 planning — linked `SPEC/SPEC-implementation.md` §37 CR-19) — **Home-screen widgets
  added (three).** §6.22 Money summary (Balance = Income − Spent for the month, + Income, Spent), §6.23 Queued
  transactions (count + up to 3 rows), §6.24 Quick add (+ tile), Settings › Widgets (§6.24), criteria
  `UI-090`–`UI-099`. The plan's fourth idea ("Owed to you" widget) is **dropped**. Layouts, sizes and colours are
  **provisional** and subject to the design gate (`UI-099`): prototype first, approval second, code third.
  "Hide amounts on widgets" is a Settings switch, **default off** (open item — flip if you prefer private by
  default). "Balance" is defined as **Income − Spent** so the widget matches the Analytics card.

- **CR-6** (2026-09-19, design review of the V2 canvas) — **V2 designs approved; the Queued-transactions 2×2 widget is dropped.** The user reviewed the coded design canvas ("CoinFlow V2 Design": widgets on a home screen, widget sizes/states, the split flow, Details with a split, Splits page, Merge sheet, request notification, Home with the "Owed to you" row) and approved it. The only change: **Queued transactions has no 2×2 size** — it is 4×2 and 4×3 only (§6.23; the Money summary keeps 4×2 and 2×2). The design gate `UI-099` is **cleared**; the design source of truth for V2 screens is that canvas plus §6.17–§6.24. The prototype path named in §6.24 (`design-prototype/01-midnight/widgets.html`) is superseded by the canvas.

- **CR-7** (2026-09-19, phase-0 spike 0b — `SPEC/SPEC-implementation.md` §45.5) — **Split sheet result list: footnote removed.** §6.17 said requests sent by CoinFlow "don't appear in Messages". Measured on a motorola edge 60 pro (Android 16) the message is written to the Sent box, so the sentence is not reliable and is dropped. No other UI change.
