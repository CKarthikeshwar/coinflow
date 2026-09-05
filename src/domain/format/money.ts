/**
 * FILE PURPOSE
 * ------------
 * Turns a raw money amount into the exact string shown on screen: "+ ₹1,15,000",
 * "− ₹842.50", a percent-change like "+12%", or a capped badge count like "99+".
 *
 * WHERE IT FITS
 * ------------
 * This is the single place that knows how money should *look*. It's used everywhere an amount
 * is displayed — transaction rows, the Home balance hero, Analytics tiles, notifications — so
 * every screen in the app shows amounts the same way. It's pure formatting only: it never reads
 * from the database, never does money math beyond simple sign/rounding, and has no
 * react-native/expo imports.
 *
 * USED BY
 * -------
 * 14 files across `src/features/`, `src/app/`, and `src/services/notifications/` — essentially
 * anywhere a rupee amount reaches the UI or a notification.
 *
 * IMPORTANT
 * ---------
 * `amountMinor` is always an integer count of **paise** (1 rupee = 100 paise), never a
 * fractional rupee number like `12.5`. This matters: money is stored and passed around as
 * whole-number paise throughout the app specifically to avoid floating-point rounding bugs
 * (`0.1 + 0.2 !== 0.3` in JS) — if you're about to write `amount / 100.0` somewhere else in the
 * app, check whether this file's helpers already do what you need instead.
 *
 * The Indian-style digit grouping ("1,15,000" not "115,000") is hand-written here rather than
 * using `Intl.NumberFormat('en-IN')`, because the JS engine this app runs on (Hermes) only has
 * partial `Intl` support and can't be relied on for this.
 */

export type FormatMoneyOptions = {
  /**
   * Leading sign. `'always'` (default) shows `+`/`−`; `'none'` shows the bare magnitude, even
   * for a negative input; `'negativeOnly'` omits the `+` for a positive value but still shows
   * `−` for a genuine negative — for a figure that's a magnitude, not a signed delta, yet can
   * still legitimately be negative (the Home running-balance hero, §27.5 / IMP-010).
   */
  sign?: 'always' | 'none' | 'negativeOnly';
  /** `₹` prefix. Defaults to `true`. */
  withCurrency?: boolean;
};

/** Indian digit grouping: last group is 3 digits, every group before that is 2. */
function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const lastThree = digits.slice(-3);
  let rest = digits.slice(0, -3);
  const groups: string[] = [];
  while (rest.length > 2) {
    groups.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  if (rest.length > 0) groups.unshift(rest);
  return [...groups, lastThree].join(',');
}

/**
 * `amountMinor` is an integer count of paise (D28) — never a float rupee value.
 * Paise are shown only when non-zero, always 2 digits (`₹12.50`, `₹12`).
 */
export function formatMoney(amountMinor: number, opts: FormatMoneyOptions = {}): string {
  const { sign = 'always', withCurrency = true } = opts;
  const isNegative = amountMinor < 0;
  const absMinor = Math.abs(amountMinor);
  const rupees = Math.trunc(absMinor / 100);
  const paise = absMinor % 100;

  const rupeesGrouped = groupIndian(String(rupees));
  const paiseSuffix = paise !== 0 ? `.${String(paise).padStart(2, '0')}` : '';
  const currency = withCurrency ? '₹' : '';
  const magnitude = `${currency}${rupeesGrouped}${paiseSuffix}`;

  // Thin space (U+2009, explicit escape so it can't silently drift to a plain space) between
  // the sign and the amount — `+ ₹1,15,000`, `− ₹842` (§27.1).
  const THIN_SPACE = '\u2009';

  if (sign === 'none') return magnitude;
  if (sign === 'negativeOnly') return isNegative ? `−${THIN_SPACE}${magnitude}` : magnitude;

  const signChar = isNegative ? '−' : '+';
  return `${signChar}${THIN_SPACE}${magnitude}`;
}

/** Badge / count caps at "99+" (§27.1). */
export function formatCount(n: number): string {
  return n > 99 ? '99+' : String(n);
}

/** Signed percent change; `null` (no comparison period) renders as an em dash (§27.1 / §26.3). */
export function formatPercentDelta(x: number | null): string {
  if (x == null) return '—';
  const sign = x > 0 ? '+' : '';
  return `${sign}${Math.round(x * 100)}%`;
}
