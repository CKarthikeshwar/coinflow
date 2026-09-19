/**
 * FILE PURPOSE
 * ------------
 * Pure allocation rule for V2 settlements (SPEC-implementation.md §40.2, IMP-075).
 *
 * A *settlement* records that "`amountMinor` of this transaction settled that share / request". One
 * payment can settle several targets and one target can be paid in parts, so a Merge picks targets and
 * amounts; this module decides what each pick may actually be.
 *
 * NO LEFTOVER FLOW (decided, V2-PLAN §5.6): whatever part of the transaction is not allocated simply
 * stays an ordinary transaction — the function reports it, nothing more.
 */

export type SettlementPick = {
  targetId: string;
  /** What is still owed on the target (share or request). */
  remainingMinor: number;
  /** What the user asked to settle; defaults to `remainingMinor` when omitted. */
  requestedMinor?: number;
};

export type Allocation = { targetId: string; amountMinor: number };

/**
 * Allocates a transaction's still-unallocated paise over `picks`, in order. Each allocation is
 * `min(requested ?? remaining, remaining, what is left of the transaction)`; picks that end up at 0
 * are dropped. `alreadyAllocatedMinor` is what earlier settlements already used of this transaction.
 */
export function allocate(
  txnAmountMinor: number,
  alreadyAllocatedMinor: number,
  picks: readonly SettlementPick[],
): { allocations: Allocation[]; allocatedMinor: number; unallocatedMinor: number } {
  const isNonNegInt = (n: number) => Number.isInteger(n) && n >= 0;
  if (!isNonNegInt(txnAmountMinor) || !isNonNegInt(alreadyAllocatedMinor)) {
    throw new RangeError('amounts must be non-negative integers');
  }
  if (alreadyAllocatedMinor > txnAmountMinor) throw new RangeError('already-allocated exceeds the transaction amount');
  const seen = new Set<string>();
  let left = txnAmountMinor - alreadyAllocatedMinor;
  const allocations: Allocation[] = [];
  for (const pick of picks) {
    if (seen.has(pick.targetId)) throw new RangeError('duplicate settlement target');
    seen.add(pick.targetId);
    const requested = pick.requestedMinor ?? pick.remainingMinor;
    if (!isNonNegInt(pick.remainingMinor) || !isNonNegInt(requested)) {
      throw new RangeError('amounts must be non-negative integers');
    }
    const amountMinor = Math.min(requested, pick.remainingMinor, left);
    if (amountMinor > 0) {
      allocations.push({ targetId: pick.targetId, amountMinor });
      left -= amountMinor;
    }
  }
  const allocatedMinor = allocations.reduce((a, x) => a + x.amountMinor, 0);
  return { allocations, allocatedMinor, unallocatedMinor: txnAmountMinor - alreadyAllocatedMinor - allocatedMinor };
}
