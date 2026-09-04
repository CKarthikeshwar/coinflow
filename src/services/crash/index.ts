/**
 * Crash reporting — SPEC-implementation.md §33.4 (D34, the P-9 amendment). `Sentry.init()` is
 * called from here and nowhere else, and only while `crashReportingEnabled` is true — that's
 * the entire no-network guarantee (§33.2): until `armCrashReporting(true)` runs, no transport
 * is ever constructed and no socket can open.
 *
 * `beforeSend`/`beforeBreadcrumb` are the second scrub pass (the first is `redactError` /
 * `scrubText` in `src/lib/log.ts`, applied before an event ever reaches here) — fail-closed:
 * an event that still matches a currency/VPA/digit pattern after scrubbing is dropped
 * entirely rather than sent partially-redacted.
 */

import Constants from 'expo-constants';
import * as Sentry from '@sentry/react-native';

import { _setCrashSink, redactError, scrubText } from '@/lib/log';

const FINANCIAL_ROUTES = ['transaction/', 'analytics', 'review-queue', 'sheet'];
const LEAK_PATTERN = /₹\s?[\d,]+|\S+@\S+|\b\d{4,12}\b/;

let armed = false;

function beforeSend(event: Sentry.ErrorEvent): Sentry.ErrorEvent | null {
  delete event.contexts?.device?.name;
  delete event.user;
  delete event.request;
  delete event.server_name;

  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = scrubText(exception.value);
    for (const frame of exception.stacktrace?.frames ?? []) {
      if (frame.filename) frame.filename = scrubText(frame.filename);
      if (frame.function) frame.function = scrubText(frame.function);
    }
    if (exception.value && LEAK_PATTERN.test(exception.value)) return null;
  }

  return event;
}

function beforeBreadcrumb(breadcrumb: Sentry.Breadcrumb): Sentry.Breadcrumb | null {
  if (breadcrumb.category === 'console' || breadcrumb.category === 'xhr' || breadcrumb.category === 'fetch') {
    return null;
  }
  if (breadcrumb.category === 'navigation') {
    const route = String(breadcrumb.data?.to ?? '');
    if (FINANCIAL_ROUTES.some((r) => route.includes(r))) return null;
  }
  if (breadcrumb.category !== 'app.lifecycle' && breadcrumb.category !== 'error' && breadcrumb.category !== 'navigation') {
    return null;
  }
  return breadcrumb;
}

function sendToSentry(e: unknown, op?: string): string | null {
  if (!armed) return null;
  const redacted = redactError(e);
  const err = new Error(redacted.message);
  err.name = redacted.name;
  err.stack = redacted.stack;
  const eventId = Sentry.captureException(err, { tags: op ? { op } : undefined });
  return typeof eventId === 'string' && eventId ? eventId : null;
}

function capture(e: unknown, extra: { op?: string }) {
  sendToSentry(e, extra.op);
}

/** `RootErrorBoundary` (§32.3) — a dedicated path, not `log.error`, because it needs the
 * Sentry event id back (to show a "Ref" the user can cross-reference on the dashboard) and
 * must never report the same crash twice. Returns `null` when reporting is off — the screen
 * only shows a reference for a crash that was actually sent somewhere, never a fake one. */
export function captureBoundaryError(error: unknown): string | null {
  if (__DEV__) console.error('[RootErrorBoundary]', error);
  return sendToSentry(error, 'boundary');
}

/** Read `app_setting.crashReportingEnabled` once at startup, or call directly from the
 * Settings › Data toggle. Safe to call repeatedly with the same value. */
export function armCrashReporting(enabled: boolean): void {
  if (enabled === armed) return;
  armed = enabled;

  if (enabled) {
    const dsn = Constants.expoConfig?.extra?.sentryDsn as string | undefined;
    if (!dsn) return;
    Sentry.init({
      dsn,
      tracesSampleRate: 0,
      enableAutoSessionTracking: false,
      sendDefaultPii: false,
      debug: false,
      beforeSend,
      beforeBreadcrumb,
    });
  } else {
    Sentry.close();
  }

  _setCrashSink(capture, enabled);
}
