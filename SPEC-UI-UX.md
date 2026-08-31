# CoinFlow — UI/UX Specification

> **Scope.** Screens and visual elements only — layout, visual states, shared visual language.
> Feature behavior, product rules, data, SMS parsing, categorization, and analytics computation
> live in `SPEC-implementation.md`; cross-references use its `F#` / `J#` ids.
>
> **Status: Frozen** (v1, finalized). The visual design is locked against the coded prototype at
> `design-prototype/01-midnight/` (dark, black-and-white) — `screens.html`, `p0-screens.html`,
> `p1-screens.html`. §3 Design System is *extracted from it* (`SPEC/PLAN.md` §4–§6) and every
> subsection is frozen: §3.1 colour, §3.2 type (Manrope + Geist), §3.3 spacing / elevation, §3.4
> iconography (**Lucide**), §3.5 motion, §3.6 component catalog, §3.7 `theme.ts` reconciliation.
> Changes from here are change-requests, not open questions. Implementation follows
> `SPEC-implementation.md`. References live in `design-references/` (`screen1.png` /
> `screen2.png`).

---

## 1. Screen inventory & priority

`P0` core loop · `P1` useful V1 · `P2` V1 if time allows.

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

---

## 2. Visual direction

**Light, fast, low-friction — not a "premium banking app".** Effortlessness is the point:
generous spacing, a small type scale doing the hierarchy work, minimal chrome, no dense financial
dashboards. The reference collection (`design-references/`) folds in here later (`SPEC/PLAN.md`
§3); until then the prototype proceeds from this written direction.

**No colour.** The interface is **black, white and grey only** — no accent colour, no semantic
hues. Direction, state, emphasis and hierarchy are carried by the always-present `+` / `−` sign,
by weight and size, by fill vs hairline, and by position — never by hue. See **V-11**. **Two
sanctioned exceptions:** (1) the Analytics *"Where it went"* category breakdown (§6.10) uses a
fixed category-colour set on its dot / bar / donut; (2) the app **ground** carries a faint **cool
(blue-grey) ambient wash** — a soft glow behind the top of each screen, settling to near-black
below (§3.1). Both are decorative / ambient — never a semantic, category, or state colour, and
no foreground element is tinted.

**V1 is dark only.** The approved prototype is `design-prototype/01-midnight/` (Midnight, dark).
A light rendition of the greyscale ramp is **deferred to Future** — not a V1 deliverable — so the
app ships one theme and the system does not switch on `prefers-color-scheme`.

**Card layout** (`design-references/1.png`, `3.png`). Content sits on rounded surfaces with
spacing between them: the balance hero, the Income / Spending tiles, the action strip, and — the
change in `3.png` — **each transaction is its own card**. Day headers on the Transactions list are
plain labels *between* card groups, not inside a card. Every transaction card carries a
**rounded-square icon tile** on the left holding the **category icon** (see §3); an income tile
inverts (light tile, dark glyph) to show direction without colour.

---

## 3. Design system

Extracted from the approved prototype `design-prototype/01-midnight/` (`app.css` +
`shared/frame.css`). **V1 ships one dark theme** (§2). All of §3 is frozen — colour, type,
spacing / elevation, iconography (**Lucide**), motion, the component catalog, and the `theme.ts`
reconciliation.

### 3.1 Colour

**The law.** Foreground is black, white and grey — no accent, no positive / negative / warning
hue, no colour-coded categories (V-11). Direction, state, emphasis and rank are carried by the
always-on `+` / `−` sign, by weight and size, by **fill vs hairline**, by position, and by
greyscale value. Depth is a **surface step plus a soft drop shadow + a hairline top edge** on
card surfaces (§3.3); controls stay flat.

**Ground — a cool ambient wash (V-11 exception #2).** The app background is **not** a flat fill:
a radial glow sits behind the top of each screen and settles to near-black lower down, and the
whole ground is shifted a hair **cool (blue-grey)**. `radial-gradient(135% 54% at 50% -8%,
var(--bg-top) 0%, #0e0f18 42%, #090a0d 100%)`. This is ambient only — never on a foreground
element, never encoding meaning. Surface tokens are shifted the same faint cool so nothing reads
warm against it.

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

**Category palette (scoped, the one carve-out — V-11).** Nine desaturated hues, used **only** in
the Analytics *"Where it went"* breakdown (ranked-row dot + bar, and the donut). They read as data
keys, not brand; they never touch a transaction card, chip, selector, or any other chart.
Uncategorized is a **hatched grey**, never a hue.

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

**Family.** **Manrope** on headings and every figure (amounts, balance, counts, percentages, the
lock-screen clock); **Geist** on all other UI text (body, labels, buttons, metadata). Both ship
as bundled web/app fonts with the system stack (`system-ui`, `-apple-system`, …) as the fallback.
`Fonts.mono` is reserved but currently unused in-product. `theme.ts` `Fonts.sans` → Geist,
`Fonts.display` → Manrope (see §3.7).

**Case.** Sentence case everywhere. **No** tracked all-caps eyebrow labels.

**Weights — four, used deliberately** (never a uniform bold):

| Weight | Used for |
|---|---|
| 700 | display figures (amounts, balance), primary-button labels |
| 600 | screen / section / sheet titles, transaction names, day headers, chips |
| 500 | form labels, captions, quiet metadata, secondary values |
| 400 | body copy |

*(300 is reserved for the lock-screen clock only.)*

**Scale** (px · weight · tracking):

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

Negative tracking appears **only** on display figures ≥ 27 px; body and labels sit at 0.
**Tabular numerals** (`font-variant-numeric: tabular-nums`, class `.num`) on every amount, count,
percentage and date figure.

### 3.3 Spacing · radius · elevation · layout

**Spacing** — the named scale (`Spacing`, `theme.ts`): `half 2 · one 4 · two 8 · three 16 ·
four 24 · five 32 · six 64`. Screen gutter = 20 (`--pad`); gap between hero / strip / cards = 12;
card interior = 18–22. Prefer the scale to raw numbers.

**Radius** — `pill 999` (nav, chips, badges, CTAs, toggles) · `card 24` (hero, analytics cards;
sheet top corners 28) · `control 14` (fields, buttons, filter blocks) · `18` transaction card ·
`13 / 11` icon tiles.

**Elevation** — card surfaces (hero, action strip, transaction card, stat tile, analytics card)
lift on `card` = `0 8px 24px rgba(0,0,0,.5), 0 1px 4px rgba(0,0,0,.4)` **plus a hairline top edge**
`1px solid rgba(255,255,255,.05)`. `pop` = `0 12px 34px rgba(0,0,0,.6), 0 3px 10px rgba(0,0,0,.45)`
for the floating nav and popovers. Controls (segmented toggle, chips, fields) stay flat — a 1px
inner shadow at most. Nothing else casts a shadow.

**Layout** — max content width 800 (`MaxContentWidth`); bottom-nav footprint 76 above the home
indicator; every screen respects top and bottom safe-area insets.

### 3.4 Iconography

**Library: [Lucide](https://lucide.dev)** (`lucide-react-native`, ISC-licensed). It is the one
line family the prototype's placeholder sprite was already tracing: ~1.5–2 stroke on a 24 px grid,
`currentColor`, `fill: none`, rounded caps / joins — and it covers everything the app needs
(categories, payment methods, chrome) without a commission. Set `strokeWidth` to **1.6** app-wide
(matching `.app .ic` in `app.css`) so it reads calm at the 42 px transaction tile and stays legible
at 18 px inline.

- Category identity (no colour) rests on the icon, so each of the 9 defaults + **Uncategorized**
  (`help-circle`) + **income** (`arrow-down-to-line` / `banknote`) maps to a fixed Lucide glyph;
  the map lives with the category model (`SPEC-implementation.md`). Custom categories pick from the
  same fixed grid (§6.12).
- Payment methods: UPI / Card (`credit-card`) / Cash (`banknote`) / Bank transfer (`landmark`) /
  Wallet (`wallet`).
- Chrome: `home`, `history`, `bar-chart-3`, `sliders-horizontal`, `plus`, `chevron-right`,
  `arrow-left`, `x`, `more-vertical`, `search`, `filter`, `check`, `delete` (backspace),
  `triangle-alert`, `calendar`, `tag`, `bell`, `shield-check`, `trash-2`, `download`.
- The web prototype keeps its inline `<symbol>` sprite (hand-traced Lucide-style); the RN build
  swaps in the real package. Swapping is 1:1 — no layout change.

### 3.5 Motion

**Principle.** Motion confirms an action or shows where something came from — never decoration.
Short, eased, interruptible. No spring overshoot on functional UI (the splash mark is the one
exception). Everything honours the OS **Reduce Motion** setting: slides and scale become an
opacity cross-fade or an instant cut, and the sheet appears without the slide.

**Timing.**

| Token | ms | Used for |
|---|---|---|
| `fast` | 120 | press feedback, segment / toggle thumb, keypad key flash |
| `base` | 200 | dialog & snackbar in / out, tab cross-fade, list row insert / remove, keypad ↔ keyboard swap |
| `slow` | 320 | bottom-sheet slide-up / dismiss, stack push / pop |

**Easing.** `standard` `cubic-bezier(.2,0,0,1)` (most moves) · `decelerate` `cubic-bezier(0,0,0,1)`
(entering from an edge) · `accelerate` `cubic-bezier(.3,0,1,1)` (leaving).

**Transitions.**

- **Bottom sheet** (Add / Filter / Confirmation / Edit / Category picker / Create-Edit Category) —
  slides up from the bottom over `slow` `decelerate`; scrim fades 0→1 over `base`. Dismiss
  reverses with `accelerate`. Swipe-down tracks the finger 1:1; release past ~30 % height or with
  downward velocity completes, else it springs back over `base`. A dirty sheet routes the dismiss
  through the discard confirm (V-6).
- **Keypad ↔ OS keyboard** — focusing a text field slides the in-app keypad down/out over `base`
  `accelerate` as the OS keyboard rises, and the amount collapses to its summary bar on the same
  curve; returning to the amount reverses it (§6.4).
- **Stack push / pop** (Details, Review Queue, Settings + subpages, Categories) — the
  platform-native transition (iOS slide-from-right, Android shared-axis X) at `slow`.
- **Tab switch** — no slide; outgoing content cross-fades to incoming over `base`; scroll position
  and state are preserved (§4).
- **List row insert / remove** — a saved / undone transaction row animates height + opacity over
  `base` and neighbours settle with a `base` layout animation; a deleted row collapses first, then
  the Undo snackbar rises.
- **Undo snackbar / toast** — rises from behind the nav over `base` `decelerate`, holds ~5 s,
  leaves downward over `base` `accelerate`; **Undo** re-inserts the row with the insert animation.
- **Confirm dialog** — scrim fades over `base`; the card scales .96→1 + fades over `base`
  `standard`; leaves by fade only over `fast`.
- **Segmented control / toggle** — the selected pill slides between options over `fast` `standard`.
- **Press feedback** — cards and buttons drop to ~.97 opacity (or a 1–2 px inset) on press-in over
  `fast`, no bounce on release.
- **Splash** — already coded (`AnimatedSplashOverlay`, reanimated `Keyframe`): the mark settles
  with one gentle spring, then the overlay wipes. Unchanged.

**Implementation.** `react-native-reanimated` v4 — `entering` / `exiting` / `layout` props with
`Keyframe`s for the bespoke moves (sheet, snackbar, list rows), the navigator's built-in
transitions for stack / tab. The three timing tokens and three easing curves live alongside
`theme.ts`. The prototype does not animate; a JS preview of the key transitions with these exact
tokens lives at `design-prototype/01-midnight/motion.html` — the values there are the target,
verified and tuned on-device during the build.

### 3.6 Component catalog

**Built** in the prototype (`screens.html`, `p0-screens.html`):

- **Top bar** — sticky, gradient-masked; brand + month, or title (+ count), or back / close +
  overflow.
- **Bottom nav** — floating blurred pill, 4 tabs + raised centre **Add**; active tab `--text`,
  rest `--text-3`.
- **Permission banner** (V-9) — neutral inset, alert glyph + message + **Enable** + dismiss.
- **Badge** — pill, `--surface-3` / `--text-2`, tabular count.
- **Balance hero card** — "Total balance" label + large running-balance figure (de-emphasised `₹`
  mark).
- **Stat tile** — small card: label + figure + a quiet delta line with a trend glyph. Used for
  Home Income / Spending (MoM %) and Analytics Mean / Median (last-month value). Display only.
- **Action strip** — grouped rows (to-review, uncategorized); fill-dot vs ring marker; count
  badge; chevron.
- **Transaction card** — icon tile (inverts for income) + label (note → account → "No note") +
  category-only meta + signed amount.
- **Day group header** — plain label (date + optional subtotal) between card groups.
- **Analytics cards** — "This month" continuous arc gauge + Income / Spent split; **Mean / Median**
  stat tiles (each with last month's value); "Where it went" ranked coloured rows + donut;
  "Day by day" greyscale area / line + dashed mean line; "Biggest expenses" ranked rows.
- **Bottom sheet** — grabber, dimmed scrim, swipe / scrim-tap dismiss, discard-confirm when dirty
  (V-6).
- **Keypad sheet** (`sheet--kp`) — scrolling body; the in-app numeric keypad is **amount-only**
  and docks at the bottom with the primary action button pinned **below** it. The amount holds
  full height at rest and only collapses to a slim sticky summary bar (`sheet--kp--typing`, ~22 px
  figure, "Amount ₹1,200") once the body is scrolled to the text fields.
- **Amount input** (V-10) — large centred figure + caret (52 px in the keypad sheet, in a
  generously padded block — it is the hero of the sheet); `₹` prefix in `--text-3`; helper line
  for 0 / over-max.
- **Custom numeric keypad** — 3×4 (0–9, ".", backspace); 62 px keys; full-bleed hairline grid;
  tabular. Amount entry only.
- **System keyboard** — Account / Note / Description raise the OS keyboard, not the in-app keypad;
  it replaces the keypad and the primary button rides just above it (iOS input-accessory style).
  Prototype draws a representational `.syskb`.
- **Segmented control** — 2–3 options; selected = `--surface-3` lift.
- **Selector row** — icon + label + value + chevron → opens a picker.
- **Text field** — inset `--surface-2`; `--filled` (hairline border) / `--empty` (muted) /
  `--focus` (`--primary` border); textarea variant.
- **Account autocomplete** — bordered list under the account field; each row = matched account +
  its remembered note / category ("categorises as Food") or "new".
- **Category picker sheet** — full sheet; icon-tile rows for Uncategorized + the 9 categories;
  current = check; "Manage categories →" foot.
- **Filter blocks** — titled groups of toggle chips (category, type segment, payment method, date
  range); **Reset** + "Show N results".
- **Buttons** — primary (filled `--primary` / `--primary-ink`), ghost (`--surface-2`), disabled
  (`--surface-2` / `--text-3`); pill radius; 700 label.
- **Chips** — category chip (`--surface-3` fill), Uncategorized chip (dashed `--text-3` outline),
  removable filter chip (label + ✕).
- **Provenance line** — detected transactions only, on Details: auto glyph + "Detected
  automatically · &lt;bank&gt; · &lt;date&gt;". No SMS body.
- **Detail field row** — key (`--text-3`) over value; the note is the heading line.
- **Review-queue card** — one lifted card per pending row (same elevation as a transaction card):
  payment-method icon tile + signed amount + neutral descriptor ("UPI payment") + relative time +
  overflow; a known-account row also carries an inline one-tap **`Save`**.
- **Transaction notification** (§6.15) — lock-screen card: `₹450 debited` / `Swiggy · UPI`.
  Known account → **`Save`** · **`Add`** · **`Discard`**; new account → **`Add`** ·
  **`Discard`**. Body tap → Confirmation. (Monochrome mock; a real build uses the OS channel
  style.)
- **Empty state** — centred glyph + line + primary action (V-3 baseline).
- **Loading skeleton** — neutral `--surface-3` blocks matching the target layout; no spinner
  (V-3). Prototyped in `p1-screens.html`.
- **Error state** — centred alert glyph + a short line + a hairline **Try again** pill (V-3).
- **Confirm dialog** — centred card (`--surface`, 24 r) on a heavy scrim; a quiet glyph in a
  `--surface-3` circle, title, a short body (≤ 30 ch). Actions are **stacked full-width**: the
  filled + bold confirm on top, a **plain-text Cancel** below — no second filled button competing.
  No red; the glyph, wording and the filled weight carry the warning (V-7). A two-step variant
  adds a centred "type `CONFIRM`" field above the actions (Settings › Data).
- **Undo snackbar** — translucent bar (`rgba(36,38,47,.6)` + blur) above the nav, message + single
  "Undo"; auto-dismiss ~5 s.
- **Onboarding step frame** — 3-dot progress, optional abstract B&W line art, large heading, one
  bottom primary button, Back after step 1.
- **Permission card** — icon tile + title + one-line why + trailing **Allow** button / status pill
  (granted / denied). Reused in onboarding step 2 and Settings › SMS & notifications.
- **Settings grouped list** — inset `--surface-2` groups under quiet `setlabel` headings;
  `selectrow` rows gain a `sub` line (e.g. "Off") and a `--danger` bold label variant.
- **Account-rule row** — lifted card: account · remembered note · category chip · usage count.
- **Icon picker** — fixed 6-wide grid; selected cell inverts (carries category identity, no
  colour).

All of the above are drawn in the prototype (`screens.html` / `p0-screens.html` / `p1-screens.html`).

### 3.7 Reconciliation with `src/constants/theme.ts`

This section is the source of truth and supersedes the current values:

- `Colors.dark` → the §3.1 ramp. Today it is `#000` / `#212225` / `#2E3135` / `#B0B4BA`; update to
  `--bg #0d0e14`, `--bg-top #1b2238`, `--surface #16171d`, `--surface-2 #1c1e26`,
  `--surface-3 #262832`, `--hairline #2b2d38`, `--text #f5f5f6`, `--text-2 #9a9aa1`,
  `--text-3 #85858c`, plus `--primary` / `--primary-ink`. The app background is the §3.1 radial
  (using `--bg-top` → `--bg`), not a flat fill. `ThemeColor` grows from 5 keys to this set.
- `Colors.light` is unused in V1 (dark only) — mirror `dark` or drop it.
- `Fonts` → bundle **Manrope** and **Geist**; `Fonts.sans` = Geist, add `Fonts.display` = Manrope,
  each with the system stack as fallback. `Spacing` already aligns.
- Icons → add `lucide-react-native` (§3.4); one wrapper component sets `strokeWidth={1.6}` and
  `color` from the theme, replacing the prototype's inline `<symbol>` sprite 1:1.
- `ThemedText` / `ThemedView` gain the §3.2 type roles and the §3.1 surface tokens.

---

## 4. Navigation

**Bottom bar:** `[ Home ]  [ Transactions ]  ( + )  [ Analytics ]  [ Settings ]`. The center
**Add** is raised / filled and is **not** a destination — it opens the Add sheet over the current
tab, which stays selected. Tab pages preserve scroll + state. Onboarding renders full-screen,
outside the tab shell. The **Transactions** tab uses a clock / history icon (not a receipt).

| Surface type | Behavior | Screens |
|---|---|---|
| Tab page | Bottom-bar destination, state preserved | Home, Transactions, Analytics, Settings |
| Pushed page | Own back stack, back button | Onboarding steps, Review Queue, Transaction Details, all Settings subpages |
| Bottom sheet | Grabber, dimmed scrim, swipe-down / scrim-tap dismiss | Confirmation, Add, Edit, Create/Edit Category, Filter |
| System surface | OS notification | Transaction notification |

Flow: Onboarding (Welcome → Permissions → Category review) runs on first launch only, then Home.
Review Queue and the notification both open the Confirmation sheet. Analytics category / expense
rows drill into Transactions pre-filtered. Settings rows push their subpages.

---

## 5. Global visual rules

- **V-1 Money.** `₹` prefix, Indian digit grouping (`₹1,23,456`). Whole rupees by default; two
  decimals only when paise are non-zero. Spend has a leading `−`, income a leading `+` — the
  **sign is always present**, with **a thin space between the sign and the `₹`** (`+ ₹1,15,000` /
  `− ₹842`). Direction is the sign (and, where useful, weight or a direction glyph), **never
  colour** — the UI has no positive / negative hue (V-11).
- **V-2 Dates & time.** Relative for the last ~7 days ("2h ago", "Yesterday"); absolute date
  beyond that. Lists group by local calendar day under a section header (date, optional day
  subtotal).
- **V-3 Three baseline states, always rendered.** Every screen has **loading** (skeleton that
  matches the final layout — never a blank region or a lone full-screen spinner), **empty** (short
  line + the primary action), and **error** (short message + a retry affordance). Screen specs
  below note only where a state differs from this baseline.
- **V-4 Uncategorized styling.** Scannable in any list: the transaction card shows the
  **"?" icon tile** and the word "Uncategorized" with a dashed underline (no chip). On Details a
  prominent **Set category** control replaces it.
- **V-5 Accessibility baseline.** Support system font scaling with no clipping (V1 is a single
  dark theme — see §2). Minimum touch target 44 dp. Body-text contrast ≥ 4.5:1, large text ≥ 3:1.
  Every icon-only control has a visible or assistive label. No information conveyed by colour alone.
- **V-6 Sheets.** Grabber at top; background dims; swipe-down and scrim-tap dismiss. A sheet with
  unsaved input shows a discard confirm on dismiss.
- **V-7 Destructive actions** are visually weighted (bold label, filled confirm button) and always
  route through a confirm dialog; transaction delete also shows an Undo snackbar. No red — the
  confirm dialog and the weight carry the warning.
- **V-8 No currency selector** anywhere — single-currency app.
- **V-9 Permission banner.** When SMS or notifications are off, a slim, dismissible banner sits
  directly under the top bar on **Home** and **Review Queue**: short message + **Enable**. It is a
  neutral inset (surface fill + hairline border), **not** tinted — an alert glyph and its position
  do the signalling.
- **V-10 Amount emphasis.** On any screen showing a single transaction (Confirmation, Add, Edit,
  Details) the amount is the largest element on screen.
- **V-11 Palette.** Foreground is black, white and grey — no accent, no semantic colour, no
  colour-coded categories in lists. Category identity is name + icon, never a colour swatch.
  Direction / status / rank are carried by the `+`/`−` sign, weight, size, fill vs hairline,
  iconography, or greyscale value. **Two exceptions, both non-semantic:**
  1. the Analytics *"Where it went"* category breakdown (§6.10) colours its dot, bar and donut
     from the fixed category palette (§3.1), because a greyscale split of 8+ categories cannot be
     read — those colours do **not** leak elsewhere (not onto cards, chips, the category selector,
     or the "Day by day" chart);
  2. the app **ground** carries a faint **cool blue-grey ambient wash** (a soft glow behind the
     top of each screen; §3.1) — background only, no foreground element is tinted, and it never
     encodes meaning.

---

## 6. Screen specifications

Per screen: purpose · layout top → bottom · state / edge-case deltas from the V-3 baseline.

### 6.1 Onboarding · P1

Full-screen, 3-dot step progress, large heading, generous spacing, one bottom-anchored primary
button, **Back** allowed after step 1. Each step carries an **abstract black-and-white graphic
composition** (simple geometric shapes / line work) — no commissioned illustration.

- **Welcome** — app mark; one-line value proposition; one supporting line; **Get started**. Static.
- **Permissions** — heading "Two quick permissions"; two stacked **permission cards** (icon,
  title, one-sentence "why", trailing status pill or **Allow** button); **Continue** (always
  enabled); "Skip for now" link. The two are **not equal**: **Read transaction SMS** is what makes
  auto-detection work at all; **Notifications** is marked **"Optional"** — without it, detected
  items still land in the Review Queue, they just don't post to the lock screen (the one-tap
  Save / Add flow, §6.15). Card states: *not asked* (Allow button), *granted* (check-mark pill),
  *denied* (muted "Enable later in Settings").
- **Category review** — heading "Pick your categories"; scrollable list of the 9 default
  categories as rows (icon, name, trailing checkbox — all checked); optional drag handle; **Done**.

### 6.2 Home · P0

Month status at a glance, fast routes to what needs action, recent activity. Entry: post-onboarding
launch; Home tab.

- Layout: **top bar** ("CoinFlow" wordmark + current month label — the month scopes the two tiles
  below, **not** the balance) · **permission banner** (V-9) · **balance hero card** — label
  **"Total balance"** (no month); the large figure is the **running balance** = all recorded
  income − all recorded expenses (a computed net, may be negative; **never** an "Avl Bal" read
  from SMS — impl. D2). The `₹` mark is de-emphasised (small, muted — ref `1.png`). · **two stat
  tiles** directly beneath the hero, side by side (ref `1.png`), **display only — not links**:
  **Income** and **Spending**, each showing **this month's** total (`+₹…` / `−₹…`) and, on a quiet
  line, the **percent change vs last month** with a small trend glyph (e.g. "↗ 12% vs last
  month"). · **action strip** (up to two rows,
  each shown only when its count > 0: `● N transactions to review` → Review Queue,
  `● N uncategorized` → Transactions pre-filtered; each carries a count badge; the two rows are
  told apart by a filled vs a ring marker, not colour) · **Recent** (header + up to 8 **transaction
  cards**: a **category icon tile** (inverted for income), a label, a meta line of **category name
  · relative time**, the signed amount; trailing **See all** → Transactions).
- Card label = the **note**; when empty, it falls back to the **account** (muted), then to an
  italic muted **"No note"**. Payment method is **not** on the card — it lives on Details and in
  the Filter.
- States: *empty (new user)* — hero shows **Total balance `₹0`**; both tiles show `₹0` with "no
  prior month" in place of a percentage; no action strip; recent section replaced by an empty
  state ("No transactions yet — they'll appear here as you pay." + **Add transaction**). *Error* —
  hero area shows "Couldn't load your data" + **Retry**.
- Edge: a lakh-scale balance must not wrap or shrink illegibly; a **negative balance** shows a
  leading `−`; a tile with no previous-month figure shows "—", not a percentage; counts show
  `99+` past 99; long notes truncate with ellipsis; an all-income month (Spending `₹0`) is valid.

### 6.3 Review Queue · P0

List of detected, unconfirmed transactions to triage. Entry: Home action row; Home-tab badge;
grouped notification.

- Layout: top bar "To review" + count · permission banner (conditional) · **suggestion cards**
  (one lifted card per row, same elevation as a transaction card — a **payment-method icon tile**
  — UPI / Card / Bank — amount, a neutral descriptor "UPI payment" / "Card payment" / "Bank
  credit" since detected items have no note yet, relative time, overflow → **Dismiss**; a card
  whose account is **known** also shows an inline one-tap **`Save`**) · **Dismiss all**
  pinned at the bottom when the list is long. No confidence markers.
- Controls: card body → Confirmation sheet; inline **`Save`** on a known-account card →
  writes it straight from the rule; row swipe → **Dismiss**; **Dismiss all**.
- States: *empty* is the normal resting state — "You're all caught up. New transactions show up
  here." — styled calm, not as an error.
- Edge: 50+ rows scroll with Dismiss all reachable; a suggestion older than ~7 days shows an
  absolute date; identical amount + method twice both render.

### 6.4 Transaction Confirmation (sheet) · P0

Review a detected transaction and add it, fast. Entry: notification body tap; Review Queue row.

- Layout: grabber · title "Review transaction" (+ **Cancel**) · **amount** — large, editable
  (V-10), active on open · **direction** segmented (Expense / Income) · **category** selector row
  (chosen chip, or an Uncategorized chip → opens the category picker sheet) · **payment method**
  selector row · **date & time** row · **account** field (pre-filled from the SMS when parsed; a
  past-account autocomplete) · **note** field (the card label — encouraged, not required) ·
  **description** field (optional; longer detail) · a **custom in-app numeric keypad** docked at
  the bottom (0–9, `.`, backspace) while the amount is active (tapping a text field dismisses it
  for the OS keyboard, with **Add** riding just above that keyboard) · the primary **Add** button
  pinned **below the keypad**, at the very bottom of the sheet.
- The **amount keeps full height at rest**; it only collapses to a slim sticky summary bar
  ("Amount ₹1,200", ~22 px) once the body is scrolled down to the fields — it does not shrink
  just because the keypad is up.
- **The raw SMS is not shown or stored.** The parser reads the message in memory to pre-fill the
  fields, then discards the text (impl. P-9); the pre-filled fields themselves are the review
  surface. No "view original SMS" affordance.
- If the account matches a saved rule, the **note, category and payment method are pre-filled**
  from it (all still editable).
- **No confidence markers.** Every field is shown plainly and is editable; fields the parser
  couldn't fill are simply blank. **Amount** and **direction** are always visible.
- States: *submitting* — **Add** shows a spinner, sheet locked and not dismissible. *Save error* —
  inline message directly above **Add**.
- Edge: amount `₹0` or `> ₹10,00,000` → helper text under the amount (bold, not coloured);
  **Income** selected → category row hidden.

### 6.5 Add Transaction (sheet) · P0

Manual entry. Entry: center **Add** button; empty-state CTAs on Home / Transactions / Analytics.

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

### 6.7 Transactions (list) · P0

The full ledger — scan, search, filter, open. Entry: Transactions tab; Home "uncategorized" row
and "See all"; Analytics category drill-down (opens with filter chips pre-set).

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
- Edge: 2,000+ rows scroll smoothly (virtualized); amounts of very different magnitudes align on
  the decimal; deleting the last row of a day removes its header; a day with only income.

### 6.8 Transaction Details · P0

See everything about one transaction and act on it. Entry: any transaction row; post-add toast
"View"; a stale notification tap.

- Layout: top bar with back + overflow (**Delete**) · **amount** large with its sign (V-10) · a
  **meta row** (direction, category chip, payment method) · **note** (the heading line) ·
  **account** (if present) · **date & time** · **description** (if present) · for a detected
  transaction, a quiet **"Detected automatically"** provenance line (source + date; **no SMS
  text** — the message body is never stored, impl. P-9) · bottom-anchored **Edit** primary button.
- States: *manual* (no provenance line) · *deleting* · *deleted* (screen pops, Undo snackbar on
  the previous screen) · *edited* marker (P2).
- Edge: missing note → "Add a note" inline control in place of the heading; Uncategorized → a
  prominent **Set category** control in the meta row; a future date is shown plainly.

### 6.9 Filter (sheet) · P0

Narrow the transaction list. Entry: Filter button on Transactions.

- Layout: grabber · title "Filter" · **Category** (multi-select chips) · **Type** (segmented: All
  / Expense / Income) · **Payment method** (multi-select chips) · **Date range** (preset chips:
  This month / Last 30 days / Last 3 months / Custom → reveals start + end date fields) · footer
  **Reset** (ghost) + **Apply** (primary).
- States: *no filters* (Reset disabled) · *filters active*.
- Edge: custom range with start > end → inline error on **Apply**; a combination with no results
  is allowed (the list shows its no-match state).

### 6.10 Analytics · P1

Where the money went this period and how the days compare. Entry: Analytics tab. Reference:
`design-references/analytics.png` (structure). Card names are deliberately calm — no "Financial
Health", no "Spending Distribution".

- Layout (top → bottom):
  1. **Period control** — segmented **Month / Week** + a `‹ period label ›` stepper (next is
     disabled on the current period).
  2. **"This month"** card — a greyscale **continuous circular arc** (a half-ring; fill = **share
     of income remaining** = Balance ÷ Income) with the **Balance (Income − Spent)** and an
     **"N% of income left"** caption in its hollow; below, **Income** `+₹…` and **Spent** `−₹…`.
     No period-over-period sentence on this card.
  3. **"Mean" / "Median"** — two small tiles: mean daily spend and **median** daily spend (the
     median resists a rent-day distortion). **Each tile also shows the previous month's value**
     ("Last month ₹1,410") — this is where the period comparison now lives.
  4. **"Where it went"** — the category breakdown, **the one place colour appears** (V-11 / §3
     carve-out): a ranked list (colour dot · category name · % of spend · ₹ · a thin colour bar),
     then a **colour donut**. **Uncategorized** is its own row — hatched, not coloured — with a
     **"Fix N"** affordance.
  5. **"Day by day"** — a greyscale line/area chart of daily spend across the period, with a
     Month / Week toggle and a **dashed mean line** across it (labelled "avg ₹…"). A one-off
     outlier (e.g. rent) peaks off the everyday scale and is labelled inline rather than
     compressing the rest of the curve.
  6. **"Biggest expenses"** — top ~5 individual transactions (label · category · date · amount)
     → Details.
- Controls: period control + stepper; category rows → Transactions filtered to that category +
  period; biggest-expense rows → Details.
- States: *empty (no data in period)* — "Nothing recorded for August" + **Add transaction** / step
  to a period with data. *Insufficient data (no prior month)* — the "Last month …" comparison
  values on the daily tiles are hidden. *Loading* — skeleton cards + chart / bar placeholders.
- Edge: one category ≈ 90% of spend (donut + bars still legible; the list is not truncated);
  income but zero spend (spend sections show their empty state; the "This month" card still shows
  Balance = Income); a **negative Balance** shows a leading `−` and the arc fills full; a current
  incomplete month bases the averages on days elapsed.
- **Deferred to a later release:** a "Top accounts" section, a run-rate projection, and the
  "Worth noting" auto-insight cards. Not in this V1 screen.

### 6.11 Categories · P1

Manage the category set. Entry: Settings › Categories; "Manage categories" from any category
selector.

- Layout: top bar "Categories" + **＋ Add** · **Default** section (the 9 default rows: icon, name,
  usage count [P2]) · **Custom** section (user rows, or its empty state "No custom categories
  yet"). No lock icons or badges anywhere — every category is editable.
- Controls: **Add** → Create sheet; any row → Edit sheet; row swipe → **Delete**. **Other** and
  system **Uncategorized** can be renamed / re-iconed but not deleted (no swipe action) — this is
  silent, not marked with a lock.
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
- **Data (P1):** an **Export** row (opens the OS share sheet); a **Clear all data** row (bold,
  destructive weight — no colour) → a two-step confirm (second step requires typing `CONFIRM`).
- **About (P1):** version; the line "All your data stays on this device."; a licenses link;
  source / help links.

### 6.15 Transaction notification (system surface) · P0

**This is the core loop** — a bank SMS lands, CoinFlow reads it, and the user acts from the lock
screen: one tap for a known account, or **Add** to review a new one — without opening the app.

- **Single suggestion:** app row (CoinFlow · relative time); **title** = `₹450 debited` (or
  `credited`) — the amount + direction; **body** = the **account** (`Swiggy`, or the raw payee /
  VPA) + payment method (`Swiggy · UPI`); "Unknown account" when it did not parse. The **buttons
  depend on whether the account is already known** (a saved `AccountRule`, impl. F8):
  - **Known account — three buttons:** **`Save`** (writes the transaction straight from
    the rule — note + category + method — plus the parsed amount / date; app never opens),
    **`Add`** (opens the **Confirmation sheet** pre-filled from the rule), **`Discard`**. When the
    rule has a category but no stored note the button is just **`Save`**.
  - **New account — two buttons:** **`Add`**, **`Discard`**. No one-tap save until the account has
    a note.
  - **Body tap** (not the buttons) → the **Confirmation sheet** for a full review.
- **Group (2+ pending):** summary `3 transactions to review`; tap → Review Queue. (No per-item
  buttons on the group.)
- Rendered in the OS notification channel style (Android in V1); no custom large imagery. In the
  black-and-white prototype it is shown monochrome; the real build inherits the system theme.

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

---

## 7. Visual acceptance criteria

Presentational checks only — the list is frozen; each criterion is **unverified** until the build
checks it against the running app. Behavioral acceptance lives in `SPEC-implementation.md` as
`IMP-0xx` (traceability: `UI-0xx → IMP-0xx → component → test`).

**Global** — `UI-001` money uses `₹` + Indian grouping and always shows a `+` / `−` sign; **no
foreground element uses colour** (black / white / grey), so nothing — direction, status, category,
chart series — is distinguished by hue. The only colour anywhere is the two sanctioned exceptions
(V-11): the Analytics "Where it went" breakdown, and the cool ambient wash on the app ground ·
`UI-002` no full screen renders a blank region while
loading (skeleton matches the target layout) · `UI-003` every list / summary empty state contains
exactly one primary action · `UI-004` every error state = short message + retry, no raw codes ·
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
`UI-012` recent list shows ≤ 8 rows plus a "See all" · `UI-013` new-user Home shows the zero-state
with an Add CTA · `UI-014` when SMS or notifications are off, Home shows the permission banner with
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
month's value; the "Day by day" chart carries a dashed mean line · `UI-056` "Biggest expenses"
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

---

## 8. Resolved visual decisions

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
"FAB notch" (native-tabs constraint noted for implementation) · Transactions section headers —
per-day subtotal · onboarding illustrations — abstract black-and-white graphic compositions per
step, no commissioned art (§6.1) · icon library — **Lucide** (`lucide-react-native`), the family
the prototype was already tracing (§3.4) · motion — three timing tokens + three easing curves,
per-surface transitions, Reduce-Motion fallback (§3.5) · **light theme — dropped from V1; the app
ships one dark theme (§2), light is Future.**

**Nothing open.** All of §3 (§3.1–§3.7) and every screen spec are frozen. The one product-side
question that touches a designed screen — whether Settings › Account rules ships in V1 or the
learning stays silent (§6.14) — is tracked in `SPEC-implementation.md` §15 and does not change
the visual spec either way.
