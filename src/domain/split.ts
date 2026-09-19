/**
 * FILE PURPOSE
 * ------------
 * Pure arithmetic and state rules for V2 split payments (SPEC-implementation.md §40.1, CR-17). No
 * database, no React, no clock — everything here takes plain numbers and returns plain values, so it
 * can be unit-tested exhaustively and reused by the repositories, the analytics SQL's TypeScript
 * twin, and the Split sheet.
 *
 * VOCABULARY
 * ----------
 * - a *split* shares one transaction between the user ("you") and other people;
 * - a *share* is one other person's portion (always a positive whole number of paise);
 * - **your share is never stored** — it is derived: `amount − Σ shares` (D36). Waived shares are
 *   still shares (so the invariant holds), but you absorb them when computing what you actually
 *   spent (`effectiveAmount`).
 *
 * MONEY
 * -----
 * Every amount is an integer count of paise (§19.0). Nothing here ever uses floating point for money
 * except the *percent* inputs, which are converted to paise by the largest-remainder method so the
 * result always sums exactly to the total.
 */

export type ShareState = 'waived' | 'settled' | 'partial' | 'pending';
export type SplitState = 'open' | 'settled';

const isPositiveInt = (n: number): boolean => Number.isInteger(n) && n > 0;

/**
 * Equal split between you and `peopleCount` others (IMP-071). Everyone gets `floor(total / (n+1))`
 * paise; the leftover paise go to **you** — so ₹100 among you + 2 is you ₹34.00, others ₹33.00 each.
 */
export function equalShares(
  totalMinor: number,
  peopleCount: number,
): { youMinor: number; eachMinor: number } {
  if (!Number.isInteger(totalMinor) || totalMinor < 0) throw new RangeError('totalMinor must be a non-negative integer');
  if (!isPositiveInt(peopleCount)) throw new RangeError('peopleCount must be a positive integer');
  const eachMinor = Math.floor(totalMinor / (peopleCount + 1));
  return { youMinor: totalMinor - eachMinor * peopleCount, eachMinor };
}

/**
 * Converts percentages (index 0 = you, then each person, summing to 100) to paise by the
 * largest-remainder method (IMP-072): every entry gets its floored exact amount, then the leftover
 * paise go one each to the entries with the largest fractional parts — ties go to the earlier
 * index, i.e. to you first. The result always sums to exactly `totalMinor`.
 */
export function percentToMinor(totalMinor: number, percents: readonly number[]): number[] {
  if (!Number.isInteger(totalMinor) || totalMinor < 0) throw new RangeError('totalMinor must be a non-negative integer');
  if (percents.length === 0) throw new RangeError('at least one percentage is required');
  if (percents.some((p) => !Number.isFinite(p) || p < 0)) throw new RangeError('percentages must be finite and >= 0');
  const sum = percents.reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 100) > 1e-6) throw new RangeError('percentages must sum to 100');

  // Work in hundredths of a percent as integers so 33.33 + 33.33 + 33.34 has no float drift.
  const hundredths = percents.map((p) => Math.round(p * 100));
  const exactNumerators = hundredths.map((h) => totalMinor * h); // over 10_000
  const floors = exactNumerators.map((n) => Math.floor(n / 10_000));
  const remainders = exactNumerators.map((n, i) => ({ i, r: n - floors[i] * 10_000 }));
  let leftover = totalMinor - floors.reduce((a, b) => a + b, 0);
  remainders.sort((a, b) => b.r - a.r || a.i - b.i);
  const out = [...floors];
  for (const { i } of remainders) {
    if (leftover <= 0) break;
    out[i] += 1;
    leftover -= 1;
  }
  return out;
}

export type SplitValidation =
  | { ok: true; yourMinor: number }
  | { ok: false; yourMinor: number; reason: 'no_shares' | 'bad_share' | 'over_total' };

/**
 * Checks the split invariant (IMP-070): `amount = your share + Σ shares`, every share a positive
 * integer, and your share ≥ 0 (someone else may cover you entirely — your share can be ₹0).
 */
export function validateSplit(totalMinor: number, shareAmounts: readonly number[]): SplitValidation {
  const sum = shareAmounts.reduce((a, b) => a + b, 0);
  const yourMinor = totalMinor - sum;
  if (shareAmounts.length === 0) return { ok: false, yourMinor, reason: 'no_shares' };
  if (!shareAmounts.every(isPositiveInt)) return { ok: false, yourMinor, reason: 'bad_share' };
  if (yourMinor < 0) return { ok: false, yourMinor, reason: 'over_total' };
  return { ok: true, yourMinor };
}

/**
 * The Amounts stage's live footer: `total − (you + Σ shares)`. `0` = balanced (Send enabled),
 * positive = "Remaining ₹N", negative = "Over by ₹N".
 */
export function remainingMinor(totalMinor: number, youMinor: number, shareAmounts: readonly number[]): number {
  return totalMinor - youMinor - shareAmounts.reduce((a, b) => a + b, 0);
}

export type ShareLike = { amountMinor: number; waivedAt?: number | null };

/**
 * What a transaction *effectively* is once splits are taken into account (IMP-073/074):
 * - a **debit**: `amount − Σ non-waived shares` — what you actually spent (waived shares you absorb);
 * - a **credit**: `amount − Σ settlements recorded against it` — money that settled someone's share is
 *   not income (`settledMinor` is that sum; pass 0 when none).
 * Never negative.
 */
export function effectiveAmount(
  txn: { direction: 'debit' | 'credit'; amountMinor: number },
  shares: readonly ShareLike[],
  settledMinor: number,
): number {
  if (txn.direction === 'debit') {
    const owedByOthers = shares.filter((s) => !s.waivedAt).reduce((a, s) => a + s.amountMinor, 0);
    return Math.max(0, txn.amountMinor - owedByOthers);
  }
  return Math.max(0, txn.amountMinor - settledMinor);
}

/** Derived status of one share (IMP-076) — never stored. */
export function shareState(share: ShareLike, settledMinor: number): ShareState {
  if (share.waivedAt) return 'waived';
  if (settledMinor >= share.amountMinor) return 'settled';
  if (settledMinor > 0) return 'partial';
  return 'pending';
}

/** A split is `open` while any share is still pending or partly paid; otherwise `settled`. */
export function splitState(states: readonly ShareState[]): SplitState {
  return states.some((s) => s === 'pending' || s === 'partial') ? 'open' : 'settled';
}

/** What is still owed on a share (0 once settled or waived). */
export function shareRemainingMinor(share: ShareLike, settledMinor: number): number {
  if (share.waivedAt) return 0;
  return Math.max(0, share.amountMinor - settledMinor);
}

/**
 * Editing the amount of a split transaction (IMP-089): other people's shares stay fixed and *your*
 * share is recomputed as `newAmount − Σ shares`; blocked when that would be negative.
 */
export function recomputeYourShare(
  newAmountMinor: number,
  shareAmounts: readonly number[],
): { ok: true; yourMinor: number } | { ok: false; yourMinor: number } {
  const yourMinor = newAmountMinor - shareAmounts.reduce((a, b) => a + b, 0);
  return yourMinor >= 0 ? { ok: true, yourMinor } : { ok: false, yourMinor };
}
