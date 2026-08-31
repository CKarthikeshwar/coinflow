# CoinFlow — design prototype

One coded web direction for the CoinFlow core loop (`SPEC/PLAN.md` §3). Static
HTML + CSS, **no JavaScript**, no React Native. Open `index.html` and read each
screen at phone size (`390 × 844`). **One file per phase, no per-screen
duplicates.**

```
design-prototype/
├── index.html            ← start here — the screen files + spec-change notes
├── shared/frame.css      ← device bezel, status bar, home indicator, icon base
└── 01-midnight/          ← the direction: dark, black-and-white
    ├── index.html        ← design contract + links
    ├── app.css           ← tokens + components
    ├── screens.html      ← the tab / flow screens (Home · Transactions · Review
    │                       Queue · Add sheet ×2 · Filter sheet · Analytics · Notification)
    ├── p0-screens.html   ← the P0 detail screens (Confirmation · Details · Edit ·
    │                       Category picker)
    ├── p1-screens.html   ← Onboarding ×3 · Categories · Create/Edit Category ·
    │                       Settings + 5 subpages · states (skeleton / empty /
    │                       error / confirm dialog / undo snackbar)
    └── motion.html       ← §3.5 transition preview (sheet · dialog · snackbar ·
                            tab cross-fade · list rows · segment thumb) — the ONE
                            page with JavaScript; honours Reduce Motion
```

## Direction — Midnight

Dark, native-feeling iOS finance app, faithful to `design-references/screen1.png`
and `screen2.png`. **No colour on any foreground element** — black / white / grey.
The **ground** carries a faint **cool blue-grey ambient wash** (a soft glow behind
the top of each screen, settling to near-black) — a V-11 exception, background only.

## Spec changes made in this pass (written into `SPEC-UI-UX.md`)

1. **No colour.** The whole UI is black, white and grey. Direction and state are
   carried by the always-present `+` / `−` sign, by weight and size, and by fill
   vs hairline — never hue. This changed V-1, V-7, V-9, §2, §3 and added V-11.
2. **The Note is the card label** (a short one-line label).
   - New **Description (optional)** field for longer detail (Details screen + sheet).
   - Card label falls back to the **Account** (see 7), then a muted **“No note”**.
   - Review-Queue rows (detected, not yet noted) lead with a neutral descriptor
     (“UPI payment”, “Bank credit”).
   - Search matches notes + descriptions + accounts.
3. **Transactions tab icon** is a clock / history glyph, not a receipt.
4. **Card layout** (per `design-references/1.png`, `3.png`): each transaction is its
   own rounded card with a **category icon tile** on the left (income tiles invert
   to a light tile). Day headers are plain labels between card groups. Review Queue
   stays a flat list with payment-method icon tiles (`4.png`).
5. **Icon library — Lucide.** With no colour the icon carries category identity;
   Lucide (`lucide-react-native`, ISC) is the one-line family the prototype's sprite
   was already tracing, so the RN swap is 1:1. `strokeWidth` 1.6 app-wide. §3.4.
5b. **Analytics** (`analytics.png` + `5.png` refs). **One colour carve-out:** the
   *"Where it went"* category breakdown (dot / bar / donut) uses a ~9-hue category
   palette; colour appears there and nowhere else (V-11). Cards renamed for tone:
   *"Financial Health" → "This month"*, *"Spending Distribution" → "Where it went"*,
   *"Expenses" → "Day by day"*. Sections: **This month** (Balance + "N% of income
   spent" inside a **continuous circular arc** — fill = share of income spent —
   + the Income/Spent split; no comparison sentence), **Mean / Median** daily-spend tiles
   (each also showing *last month's* value), **Where it went**, **Day by day**
   (greyscale line + a dashed **mean line**), **Biggest expenses**. Cut from the
   earlier draft: the "spent X less than in Y" line, **Top accounts** and **Worth
   noting** (all → Future).
5c. **Typography pass** (CSS only, no layout change). Removed the tracked all-caps
   micro-labels ("ACCOUNT", "CATEGORY", "BALANCE · AUGUST", "DISMISS ALL" …) → all
   sentence case now. Weight is no longer a flat 700: ~700 for large figures /
   buttons, ~600 for titles / names / day headers, ~500 for captions and quiet
   labels. Dropped the global negative body tracking; eased the extreme negative
   tracking on the big numbers. Noted in `SPEC-UI-UX.md` §3.
5d. **Typeface chosen: Manrope + Geist** (from the earlier font comparison,
   pairing 3). Manrope carries headings and every figure (amounts, balance,
   counts, the clock); Geist carries all other UI text. Bundled with the system
   stack as fallback. `SPEC-UI-UX.md` §3.2 / §3.7.
5e. **In-app keypad is amount-only.** The custom numeric keypad only serves the
   amount; Account / Note / Description raise the OS keyboard (the keypad is
   dismissed, the primary button rides above the keyboard). The amount keeps full
   height at rest and only collapses to a slim sticky summary bar once the sheet
   body is scrolled to the fields. `SPEC-UI-UX.md` §6.4 / §6.5 / UI-045.
6. **Hero = Balance.** The big figure is **Income − Spent** for the month (a
   computed net, *not* an account balance from SMS — SPEC D2 revised); Income and
   Spent show as components. "So far" tag removed.
7. **"Account" reintroduced** (the old "merchant / person", renamed) — the payee /
   payer, a name or UPI address. Not shown on cards; on Details + the Add/Edit
   sheets. **Drives auto-categorisation memory** — `account → category` rules
   (F8 un-parked): shown in the Add sheet's account autocomplete and in
   Settings › Account rules. Card label falls back to the account when there's no
   note.
8. **No time of day on the Transactions list** (the day header carries the date).
   Home "Recent" keeps a relative time.
9. **Detection notification** (`notification.html`, §6.15) — the core loop, shown
   on a lock screen: **₹450 debited · Swiggy · UPI** with **Add** / **Discard**
   buttons; the bank SMS that produced it sits faintly below. Body-tap opens the
   Confirmation sheet. `Add` / `Discard` bumped to P1 (was "Add now" P2).
10. Unchanged: `₹` + Indian grouping + leading sign; permission banner on Home +
   Review Queue (a neutral hairline banner, no tint).

## Sample data

August 2026 · Balance `₹22,520` (Income `+₹1,15,000` − Spent `−₹92,480`). Notes like
"Weekly groceries", "Cab to office", "Dinner with Sana", "August rent"; one row has
no note, so it shows its account ("Local Kirana" / "Zomato"). Add sheet shows the
account autocomplete with remembered categories. Review Queue: 5 detected items,
2 flagged low-confidence.

## Built so far

- **`screens.html`** — the tab / flow screens. Card surfaces (hero, action
  strip, transaction cards, stat tiles, analytics cards) lift on a soft drop
  shadow + a hairline edge; controls stay flat. Home hero shows a running
  **"Total balance"** with Income / Spending as two MoM-% stat tiles below (ref
  `1.png`); the Analytics "This month" arc fills to income **remaining**.
- **`p0-screens.html`** — Transaction **Confirmation** (amount-only keypad, action
  button docked *below* it, no confidence markers), Transaction **Details** (a quiet
  "Detected automatically" line — **no SMS text is shown or stored**), **Edit**, and the
  **Category picker** sheet.
- **`p1-screens.html`** — **Onboarding** ×3 (Welcome / Permissions / Category
  review, abstract B&W line art), **Categories** + **Create/Edit Category** sheet
  (name + fixed icon grid), **Settings** + its five subpages (Payment methods, SMS
  &amp; notifications, **Account rules**, Data, About), and the **global states** —
  loading skeleton, empty, error, the confirm dialog (single + the type-`CONFIRM`
  two-step), and the undo snackbar.

**No confidence scoring.** Every format-matching SMS gets a notification; the user
discards or adds. A **known account** (saved rule) → `Save` / `Add` /
`Discard`; a **new account** → `Add` / `Discard`. The same inline `Save` shows on
known-account Review Queue cards.

## Status — UI spec finalized

`SPEC-UI-UX.md` is **frozen** (v1). Every §3 subsection is settled: colour ramp,
type (Manrope + Geist), spacing / radius / elevation, iconography (**Lucide**,
`lucide-react-native`), **motion** (§3.5 — three timing tokens, three easing
curves, per-surface transitions, Reduce-Motion fallback), the component catalog,
and the `theme.ts` reconciliation. A light theme is deferred to Future.

Next: implementation per `SPEC-implementation.md`. The prototype stays as the
visual reference — static screens plus `motion.html`, a JS preview of the §3.5
transitions with the real timing tokens (the RN build tunes them on-device).

## Open decisions (product-side, not visual)

- **Account rules screen** — ship the inspect / edit / delete UI in V1, or keep
  learning silent? Screen is designed (`p1-screens.html`); the call lives in
  `SPEC-implementation.md` §15 q3 and doesn't change the UI spec.

## Notes

- Screenshots (headless Chrome) are in `.impeccable/review/`.
- The `impeccable` design hook / mechanical detector ran clean over the output.
