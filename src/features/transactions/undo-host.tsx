/**
 * Mounted once at the app root (alongside `SheetHost`) — reads `useUndo` and renders the
 * presentational `UndoSnackbar`, calling `restoreTransaction` on Undo (§27.4).
 */

import { restoreTransaction } from '@/db/repositories/transactions';
import { useUndo } from '@/stores/undo';

import { UndoSnackbar } from '@/ui/undo-snackbar';

export function UndoHost() {
  const transactionId = useUndo((s) => s.transactionId);
  const clear = useUndo((s) => s.clear);

  return (
    <UndoSnackbar
      visible={transactionId !== null}
      message="Transaction deleted"
      onUndo={() => {
        if (transactionId) restoreTransaction(transactionId);
        clear();
      }}
    />
  );
}
