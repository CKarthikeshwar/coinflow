/**
 * FILE PURPOSE
 * ------------
 * The one place a Merge is *performed and announced* (SPEC-UI-UX.md §6.20): writes the settlements in a single DB
 * transaction (`settle`, IMP-083), then shows the `Settled Rahul's share — ₹450` snackbar with **Undo**.
 *
 * WHERE IT FITS
 * -------------
 * Used by the Merge sheet, the Suggested-settlement banner on Details, and the Confirm sheet's banner (which
 * settles right after the transaction is saved). Undo simply deletes the settlements it created — nothing else
 * changed, so nothing else needs reverting.
 */

import { settle, unsettle, type SettlePick } from '@/db/repositories/settlements';
import { formatRupees } from '@/domain/format/money';
import { useToast } from '@/stores/toast';

/** Long enough to reach for Undo (same window as the delete Undo) — found on a phone: 3 s was missed. */
const UNDO_WINDOW_MS = 5000;

export type SettleTargetKind = 'share' | 'request';

/** `Settled Rahul's share — ₹450` / `Settled 2 shares — ₹900` / `Paid Rahul's request — ₹450`. */
export function settleMessage(kind: SettleTargetKind, names: readonly string[], totalMinor: number): string {
  const verb = kind === 'share' ? 'Settled' : 'Paid';
  const noun = kind === 'share' ? 'share' : 'request';
  const what = names.length === 1 ? `${names[0]}’s ${noun}` : `${names.length} ${noun}s`;
  return `${verb} ${what} — ${formatRupees(totalMinor)}`;
}

/**
 * Settles `picks` with `transactionId`. `names` maps a target id (share / request id) to the name shown in the
 * message. Returns the created settlement ids, or `null` (after a toast) when nothing could be settled.
 */
export function settleAndAnnounce(
  input: { transactionId: string; picks: readonly SettlePick[] },
  kind: SettleTargetKind,
  names: ReadonlyMap<string, string>,
): string[] | null {
  try {
    const created = settle(input);
    const total = created.reduce((a, s) => a + s.amountMinor, 0);
    const ids = created.map((s) => s.id);
    const who = created.map((s) => names.get((s.shareId ?? s.requestId) as string) ?? 'someone');
    useToast.getState().show(
      settleMessage(kind, who, total),
      {
        label: 'Undo',
        onPress: () => {
          unsettle(ids);
          useToast.getState().clear();
        },
      },
      UNDO_WINDOW_MS,
    );
    return ids;
  } catch {
    useToast.getState().show('Could not settle that');
    return null;
  }
}
