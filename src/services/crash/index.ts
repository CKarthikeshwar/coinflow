/**
 * FILE PURPOSE
 * ------------
 * Wires up Sentry (the third-party crash-reporting service) — but only if the user has
 * explicitly opted in via Settings, and with aggressive scrubbing so financial data can never
 * leave the device inside a crash report.
 *
 * WHERE IT FITS
 * -------------
 * `armCrashReporting(enabled)` is called once at startup by `src/db/migration-gate.tsx` (reading
 * the saved setting), and again immediately whenever the user flips the toggle in Settings ›
 * Data. `captureBoundaryError` is called from `src/features/app-shell/root-error-boundary.tsx`
 * when the app crashes. `src/lib/log.ts` also reports errors through this file (via
 * `_setCrashSink`, see below) rather than duplicating the Sentry setup itself.
 *
 * PRIVACY GUARANTEE — this is the whole point of this file
 * ------------------------------------------------------------
 * This app promises it makes NO network requests at all unless the user turns on crash
 * reporting (a strict no-network-by-default policy, enforced app-wide and checked by
 * `src/__tests__/no-network.test.ts`). `Sentry.init()` — the only thing in this whole app that
 * can open a network connection — is called ONLY from inside this file, and ONLY when
 * `armCrashReporting(true)` runs. Until that happens, no Sentry transport object exists, so
 * there is literally nothing capable of opening a socket. This is a deliberate architectural
 * choice, not an accident of where the code happens to live.
 *
 * Even once armed, every event goes through two layers of scrubbing before it can leave the
 * device:
 *   1. `redactError`/`scrubText` in `src/lib/log.ts` — applied before an error ever reaches
 *      this file, stripping obvious PII patterns (amounts, account-like strings) from the
 *      message/stack.
 *   2. `beforeSend`/`beforeBreadcrumb` below — Sentry's own hooks, run right before anything is
 *      actually transmitted. These strip device name/user/server info entirely, drop
 *      breadcrumbs that could leak navigation history through financial screens, and — the
 *      important part — FAIL CLOSED: if an event still matches a money/account-like pattern
 *      (`LEAK_PATTERN`) after scrubbing, the whole event is dropped rather than sent
 *      partially-redacted. Better to lose a crash report than leak financial data.
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
