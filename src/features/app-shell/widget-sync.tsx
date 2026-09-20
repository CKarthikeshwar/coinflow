/**
 * FILE PURPOSE
 * ------------
 * Keeps the home-screen widgets current while the app is running (SPEC-implementation.md §44.3, IMP-090). Renders
 * nothing: it watches the tables the widget figures depend on plus the "hide amounts" setting, and schedules a
 * debounced snapshot publish whenever any of them changes — and once on mount / every return to the foreground.
 *
 * WHERE IT FITS
 * -------------
 * Mounted next to `SmsReconciler` inside `<MigrationGate>`, so the database is ready. Background changes (an SMS
 * caught with the app closed) are covered separately at the end of each headless task in
 * `src/services/tasks/index.ts`.
 *
 * The transaction / suggestion signals are their tables' `updatedAt`; the split/settlement tables have their own
 * combined signal (`useSplitChangeSignal`) because effective amounts read them but Drizzle's live query only
 * watches a query's main table.
 */

import { useEffect } from 'react';
import { AppState } from 'react-native';

import { db } from '@/db/client';
import { useSplitChangeSignal } from '@/db/repositories/analytics';
import { useSetting } from '@/db/repositories/settings';
import { suggestions, transactions } from '@/db/schema';
import { useLiveQuery } from '@/hooks/use-live-query';
import { schedulePublish } from '@/services/widgets/publish';

export function WidgetSync() {
  const splitSignal = useSplitChangeSignal();
  const txns = useLiveQuery(db.select({ id: transactions.id }).from(transactions));
  const sugg = useLiveQuery(db.select({ id: suggestions.id }).from(suggestions));
  const hide = useSetting<boolean>('widgetHideAmounts');

  const txnAt = txns.updatedAt?.getTime() ?? 0;
  const suggAt = sugg.updatedAt?.getTime() ?? 0;

  useEffect(() => {
    schedulePublish();
  }, [splitSignal, txnAt, suggAt, hide.value]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') schedulePublish();
    });
    return () => sub.remove();
  }, []);

  return null;
}
