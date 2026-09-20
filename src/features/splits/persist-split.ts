/**
 * FILE PURPOSE
 * ------------
 * Writes a split *draft* (`useSplitDraft`) to the database once the sheet that owns it is saved
 * (SPEC-UI-UX.md §6.4 / §6.6 / §6.8, IMP-070/089). Kept out of the sheets so it is testable against a real
 * database and reusable from the Details screen.
 *
 * WHAT IT DOES
 * ------------
 * - **new split** → resolve each person (an existing saved person, or find-or-create by number) and
 *   `createSplit`;
 * - **existing split, still there** → `replaceShares` (keeps each person's row, so their request history
 *   and settlements survive);
 * - **existing split, removed** → `removeSplit`;
 * - **nothing to do** → no-op.
 * A credit is never split (CR-8), so a draft against a credit is ignored.
 */

import { findOrCreatePerson } from '@/db/repositories/persons';
import { createSplit, removeSplit, replaceShares, type ShareInput } from '@/db/repositories/splits';
import type { PendingSplit } from '@/stores/split-draft';

/** `splitId` is set for `created` / `updated` — what the request SMS are sent for (`send-requests.ts`). */
export type PersistResult = { kind: 'created' | 'updated'; splitId: string } | { kind: 'removed' | 'none' };

function resolveShares(committed: NonNullable<PendingSplit['committed']>, now: number): ShareInput[] {
  return committed.map((c) => {
    const personId =
      c.personId ??
      findOrCreatePerson({ displayName: c.name, phone: c.phone, contactRef: c.contactRef, source: c.source }, now).id;
    return { personId, amountMinor: c.amountMinor };
  });
}

/**
 * Applies `pending` to `transactionId`. Throws (`RangeError` / `Error`) exactly as the repositories do — the
 * caller decides how to tell the user; the transaction itself has already been saved by then.
 */
export function persistSplitDraft(
  transactionId: string,
  pending: PendingSplit,
  options: { direction?: 'debit' | 'credit'; now?: number } = {},
): PersistResult {
  const now = options.now ?? Date.now();
  if (options.direction === 'credit') {
    // a credit cannot carry a split; if it used to be a debit with one, drop it
    if (pending.existingSplitId) {
      removeSplit(pending.existingSplitId);
      return { kind: 'removed' };
    }
    return { kind: 'none' };
  }

  if (pending.existingSplitId) {
    if (pending.committed && pending.committed.length > 0) {
      const view = replaceShares(pending.existingSplitId, resolveShares(pending.committed, now), now);
      return { kind: 'updated', splitId: view.split.id };
    }
    if (pending.removed || !pending.committed) {
      removeSplit(pending.existingSplitId);
      return { kind: 'removed' };
    }
  }
  if (pending.committed && pending.committed.length > 0) {
    const view = createSplit({ transactionId, shares: resolveShares(pending.committed, now) }, now);
    return { kind: 'created', splitId: view.split.id };
  }
  return { kind: 'none' };
}
