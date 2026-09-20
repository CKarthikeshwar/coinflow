/**
 * FILE PURPOSE
 * ------------
 * Computes the widget snapshot (SPEC-implementation.md §44.2) and hands it to the native widget providers
 * (§44.3, IMP-090). The figures come from the *same* `periodSummaryQuery` the Analytics card uses, so the widget's
 * Balance can never disagree with the app's (IMP-096).
 *
 * WHERE IT FITS
 * -------------
 * Called from `WidgetSync` (app open + any data change while the app runs) and at the end of every headless task
 * (`src/services/tasks/index.ts`), so a bank SMS caught with the app closed still updates the queue widget.
 * `schedulePublish` debounces to 1 s because one user action often writes several rows.
 *
 * IMPORTANT
 * ---------
 * Publishing must never break the write or task that triggered it — every failure is swallowed and logged
 * (name only, no data). A no-op on web / Expo Go (`publishWidgetSnapshotJson` returns false there).
 */

import { periodSummaryQuery } from '@/db/repositories/analytics';
import { getSetting, setSetting } from '@/db/repositories/settings';
import { listPending } from '@/db/repositories/suggestions';
import { monthPeriod } from '@/domain/period';
import { buildWidgetSnapshot, type WidgetSnapshot } from '@/domain/widget-snapshot';
import { publishWidgetSnapshotJson } from '@/services/sms';

export const WIDGET_PUBLISH_DEBOUNCE_MS = 1000;

/** Reads the database and builds the snapshot for "now" (the current calendar month, like the Analytics card). */
export function computeWidgetSnapshot(now: number = Date.now()): WidgetSnapshot {
  const period = monthPeriod(now);
  const row = periodSummaryQuery(period).get();
  const incomeMinor = row?.incomeMinor ?? 0;
  const spentMinor = row?.spentMinor ?? 0;
  return buildWidgetSnapshot({
    now,
    period,
    incomeMinor,
    spentMinor,
    balanceMinor: incomeMinor - spentMinor,
    pendingSuggestions: listPending(),
    hideAmounts: getSetting<boolean>('widgetHideAmounts', false),
  });
}

/** Computes and pushes the snapshot immediately. Returns whether the native side accepted it. */
export function publishWidgetSnapshotNow(): boolean {
  try {
    const ok = publishWidgetSnapshotJson(JSON.stringify(computeWidgetSnapshot()));
    if (ok) setSetting('widgetSnapshotAt', Date.now());
    return ok;
  } catch (e) {
    console.warn('[widgets] publish failed:', (e as Error)?.name ?? 'unknown');
    return false;
  }
}

let timer: ReturnType<typeof setTimeout> | null = null;

/** Debounced publish (§44.3): a burst of writes collapses into one snapshot, `delayMs` after the last call. */
export function schedulePublish(delayMs: number = WIDGET_PUBLISH_DEBOUNCE_MS): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    publishWidgetSnapshotNow();
  }, delayMs);
}

/** Test/teardown helper — drops a pending debounced publish. */
export function cancelScheduledPublish(): void {
  if (timer) clearTimeout(timer);
  timer = null;
}
