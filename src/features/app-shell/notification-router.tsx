/**
 * FILE PURPOSE
 * ------------
 * Handles what happens when the user taps a notification IN A WAY THAT OPENS THE APP — either
 * the "Add" button or tapping the notification body itself. Reads
 * `src/services/notifications/deep-link.ts`'s decision about where to go, then actually
 * performs the navigation (pushing a route, or opening a sheet via `useSheetRegistry`).
 *
 * WHERE IT FITS
 * -------------
 * Routes a foreground-opening notification tap (the `ADD` action or a plain body tap — the only
 * two actions configured `opensAppToForeground:true`, see `categories.ts`) to the right screen
 * or sheet, on both cold start and while the app is already running.
 *
 * `SAVE`/`DISCARD` never reach here — they're `opensAppToForeground:false` and always handled
 * headless by `NOTIFICATION_RESPONSE_TASK` (`src/services/tasks/index.ts`), whether the app is
 * killed or not; this component ignores them defensively rather than assuming that split holds.
 *
 * Uses `Notifications.useLastNotificationResponse()` rather than manually combining
 * `getLastNotificationResponseAsync()` + `addNotificationResponseReceivedListener` — the spec's
 * literal mechanism. The hook is the SDK 57 API for exactly this (one reactive value covering both
 * cold start and a warm tap, instead of two code paths to keep in sync); the outcome — the §31.6
 * routing table — is identical either way. Same category of simplification as the V-6 discard-guard
 * mechanism in `sheet-host.tsx`: spec'd behavior kept, mechanism simplified.
 *
 * Mounted inside `<MigrationGate>` (alongside `SheetHost`/`UndoHost`) so the DB is ready before
 * `resolveNotificationTarget` re-reads the Suggestion/Transaction row.
 */

import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';

import { resolveNotificationTarget, type NotificationData } from '@/services/notifications/deep-link';
import { useSheetRegistry } from '@/stores';

export function NotificationRouter() {
  const response = Notifications.useLastNotificationResponse();
  const handledId = useRef<string | null>(null);

  useEffect(() => {
    if (!response) return; // undefined (not resolved yet) or null (no response)
    if (
      response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER &&
      response.actionIdentifier !== 'ADD'
    ) {
      return;
    }

    const requestId = response.notification.request.identifier;
    if (handledId.current === requestId) return;
    handledId.current = requestId;

    const data = response.notification.request.content.data as NotificationData;
    const target = resolveNotificationTarget(data);

    switch (target.kind) {
      case 'confirm':
        useSheetRegistry.getState().open('confirm', { suggestionId: target.suggestionId });
        break;
      case 'transaction':
        router.push(`/transaction/${target.transactionId}`);
        break;
      case 'review':
        router.push('/review-queue');
        break;
      case 'home':
        break; // already there, or nothing left to route to
    }
  }, [response]);

  return null;
}
