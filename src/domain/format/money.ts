/**
 * Money formatter — SPEC-implementation.md §27.1. Hand-rolled Indian grouping on the integer
 * rupee string (Hermes `Intl` is partial — D31). Pure TS, no react-native / expo imports.
 */

export type FormatMoneyOptions = {
  /** Leading sign. `'always'` (default) shows `+`/`−`; `'none'` shows the bare magnitude. */
  sign?: 'always' | 'none';
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

  if (sign === 'none') return magnitude;

  // Thin space (U+2009) between the sign and the amount — `+ ₹1,15,000`, `− ₹842` (§27.1).
  const signChar = isNegative ? '−' : '+';
  return `${signChar} ${magnitude}`;
}
