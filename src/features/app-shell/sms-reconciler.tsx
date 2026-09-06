/**
 * FILE PURPOSE
 * ------------
 * Mounts the missed-SMS reconciliation sweep (`reconcileMissedSms`, `src/services/tasks/
 * sms-reconcile.ts`) at the two points SPEC-implementation.md §17.8 (CR-10) calls for: once on
 * cold app launch, and again every time the app comes back to the foreground. Calls it with
 * `{ notify: false }` (§17.9, CR-11) — the user is already looking at the app at this trigger, so
 * a caught message lands quietly in the Review Queue instead of pushing a notification. Renders
 * nothing.
 *
 * WHERE IT FITS
 * -------------
 * Mounted inside `<MigrationGate>` (alongside `NotificationRouter`/`SheetHost`/`UndoHost`) so the
 * database is already migrated before a reconciled message tries to write a Suggestion.
 *
 * IMPORTANT
 * ---------
 * This is a *new* lifecycle hook — `src/services/notifications/reconcile.ts`'s own
 * `reconcileNotifications()` was separately designed to run on the same app-launch /
 * `AppState → active` triggers but was never actually wired up to them (a pre-existing,
 * already-flagged gap — see that file's header). This component deliberately does **not** also
 * fix that; it only drives `reconcileMissedSms()`. Conflating the two here would blur which fix
 * shipped when.
 */

import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { reconcileMissedSms } from '@/services/tasks/sms-reconcile';

export function SmsReconciler() {
  const running = useRef(false);

  useEffect(() => {
    const run = () => {
      if (running.current) return;
      running.current = true;
      reconcileMissedSms({ notify: false }).finally(() => {
        running.current = false;
      });
    };

    run(); // cold launch

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') run();
    });
    return () => sub.remove();
  }, []);

  return null;
}
