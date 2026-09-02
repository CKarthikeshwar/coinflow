/**
 * Mounted once at the app root (alongside `SheetHost`/`UndoHost`) — reads `useToast` and renders
 * the presentational `Toast`. Purely a subscribe-and-render wrapper; whoever calls
 * `useToast.getState().show(...)` (Add/Confirm/Edit's save path, §30.6/§30.7) owns the action.
 */

import { useToast } from '@/stores/toast';

import { Toast } from '@/ui/toast';

export function ToastHost() {
  const message = useToast((s) => s.message);
  const action = useToast((s) => s.action);

  return <Toast visible={message !== null} message={message ?? ''} action={action} />;
}
