/**
 * FILE PURPOSE
 * ------------
 * The engine behind the Split sheet's **Amounts** stage (SPEC-UI-UX.md §6.17, UI-072): given the total,
 * who is in, the ₹ / % mode and the amounts the user has typed, work out every row's amount and whether
 * the split is ready to save. Pure — no React, no database — so every rule is unit-tested.
 *
 * THE RULES (from the approved design)
 * ------------------------------------
 * - Rows are **You** first, then each person in the order chosen.
 * - **Default = equal split.** Any row the user types into becomes *custom* (an "override"); the rows that
 *   are not custom re-share what is left **equally**, leftover paise going to the first non-custom row
 *   (You, when You are not custom).
 * - **Equal** resets every override. Switching ₹ ↔ % also resets them (the unit changes).
 * - The footer shows `remaining` (short) or `over` (too much). Save is enabled only when the split is
 *   *balanced* (`remaining = 0`) and every **other person's** amount is greater than 0 — your own may be 0.
 */

import { percentToMinor } from './split';

export const YOU_KEY = 'you';

export type SplitMode = 'rupee' | 'percent';

export type SplitDraftInput = {
  totalMinor: number;
  /** Keys of the other people, in display order. */
  personKeys: readonly string[];
  mode: SplitMode;
  /**
   * Values the user typed, by row key (`YOU_KEY` or a person key): **paise** in ₹ mode, a **percentage**
   * (e.g. `33.34`) in % mode. Rows with no entry are "free" and share the remainder equally.
   */
  overrides: Readonly<Record<string, number>>;
};

export type SplitRow = { key: string; amountMinor: number; percent: number; custom: boolean };

export type SplitDraftResult = {
  rows: SplitRow[];
  /** Your amount (row 0). */
  youMinor: number;
  /** total − Σ every row. `0` = balanced, `> 0` = short, `< 0` = over. */
  remainingMinor: number;
  balanced: boolean;
  /** Keys of people whose amount is ≤ 0 (each person must owe something). */
  zeroPeople: string[];
  /** Balanced and every person owes > 0 — Save may be enabled. */
  canSave: boolean;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Spreads `leftover` over `count` free rows in whole units, the remainder going to the first one. */
function spread(leftover: number, count: number): number[] {
  if (count === 0) return [];
  const safe = Math.max(0, leftover);
  const each = Math.floor(safe / count);
  const out = new Array<number>(count).fill(each);
  out[0] += safe - each * count;
  return out;
}

/** Computes every row of the Amounts stage. */
export function computeSplitDraft(input: SplitDraftInput): SplitDraftResult {
  const { totalMinor, personKeys, mode, overrides } = input;
  const keys = [YOU_KEY, ...personKeys];
  const isCustom = (k: string) => Object.prototype.hasOwnProperty.call(overrides, k);
  const free = keys.filter((k) => !isCustom(k));

  let amounts: Record<string, number> = {};
  let percents: Record<string, number> = {};

  if (mode === 'rupee') {
    const fixed = keys.filter(isCustom).reduce((a, k) => a + overrides[k], 0);
    const shares = spread(totalMinor - fixed, free.length);
    free.forEach((k, i) => (amounts[k] = shares[i]));
    keys.filter(isCustom).forEach((k) => (amounts[k] = overrides[k]));
    keys.forEach((k) => (percents[k] = totalMinor > 0 ? round2((amounts[k] / totalMinor) * 100) : 0));
  } else {
    // percent mode: free rows share the remaining percentage equally (in hundredths, remainder to the first)
    const fixedPct = keys.filter(isCustom).reduce((a, k) => a + overrides[k], 0);
    const shares = spread(Math.round((100 - fixedPct) * 100), free.length);
    free.forEach((k, i) => (percents[k] = shares[i] / 100));
    keys.filter(isCustom).forEach((k) => (percents[k] = overrides[k]));
    const list = keys.map((k) => percents[k]);
    const sum = list.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 100) < 1e-6 && list.every((p) => p >= 0)) {
      const minor = percentToMinor(totalMinor, list); // largest remainder: sums to the total exactly
      keys.forEach((k, i) => (amounts[k] = minor[i]));
    } else {
      // percentages do not add up to 100 yet — show each row's own share; `remaining` will be non-zero
      keys.forEach((k) => (amounts[k] = Math.max(0, Math.round((totalMinor * (percents[k] || 0)) / 100))));
    }
  }

  const rows: SplitRow[] = keys.map((key) => ({ key, amountMinor: amounts[key], percent: percents[key], custom: isCustom(key) }));
  const remainingMinor = totalMinor - rows.reduce((a, r) => a + r.amountMinor, 0);
  const zeroPeople = rows.filter((r) => r.key !== YOU_KEY && r.amountMinor <= 0).map((r) => r.key);
  const balanced = remainingMinor === 0;
  return {
    rows,
    youMinor: rows[0].amountMinor,
    remainingMinor,
    balanced,
    zeroPeople,
    canSave: balanced && zeroPeople.length === 0 && personKeys.length > 0,
  };
}

/** Parses what the user typed into a ₹ field (`"300"`, `"300.5"`, `"₹1,200.00"`) as paise, or `null` if it is not a number. */
export function parseRupeesToMinor(text: string): number | null {
  const cleaned = text.replace(/[₹,\s]/g, '');
  if (!/^\d*\.?\d{0,2}$/.test(cleaned) || cleaned === '' || cleaned === '.') return null;
  return Math.round(parseFloat(cleaned) * 100);
}

/** Parses a % field (`"33.34"`, `"25%"`) as a percentage 0–100, or `null`. */
export function parsePercent(text: string): number | null {
  const cleaned = text.replace(/[%\s]/g, '');
  if (!/^\d*\.?\d{0,2}$/.test(cleaned) || cleaned === '' || cleaned === '.') return null;
  const n = parseFloat(cleaned);
  return n <= 100 ? n : null;
}

/** ₹ field text for an amount: whole rupees without decimals, otherwise two decimals (`300`, `33.34`). */
export function minorToRupeeText(amountMinor: number): string {
  const rupees = amountMinor / 100;
  return Number.isInteger(rupees) ? String(rupees) : rupees.toFixed(2);
}

/** % field text (`33.34`, `25`). */
export function percentText(percent: number): string {
  return Number.isInteger(percent) ? String(percent) : percent.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}
