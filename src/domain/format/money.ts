/**
 * Money formatter — SPEC-implementation.md §27.1. Hand-rolled Indian grouping on the integer
 * rupee string (Hermes `Intl` is partial — D31). Pure TS, no react-native / expo imports.
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
