/**
 * `log` — SPEC-implementation.md §32.1. The one place `warn`/`error` are allowed to reach
 * Sentry from. `debug`/`info` are `__DEV__`-only; `warn`/`error` always hit the console in dev
 * and, in release, forward a redacted event to Sentry **only when crash reporting is armed**
 * (`src/services/crash`) — otherwise they're dropped, matching the "nothing transmits by
 * default" guarantee.
 *
 * `redactError`/`scrubText` are the actual privacy boundary: everything that could reach
 * Sentry (log calls here, and `beforeSend`/`beforeBreadcrumb` in `src/services/crash`) is
 * required to pass through `scrubText`. Parser/SMS code must never put SMS body text into an
 * `Error` message — this only strips *patterns* (currency, long digit runs, VPAs, long
 * literals), not arbitrary free text.
 */

let armed = false;
let capture: ((error: unknown, extra: { op?: string }) => void) | null = null;

/** Called once by `src/services/crash` when Sentry is armed/disarmed. Avoids a JS import cycle
 * (crash reporting needs to log; logging needs to reach crash reporting). */
export function _setCrashSink(fn: typeof capture, isArmed: boolean): void {
  capture = fn;
  armed = isArmed;
}

const CURRENCY = /₹\s?[\d,]+(\.\d+)?/g;
const LONG_DIGITS = /\b\d{4,12}\b/g;
const VPA = /\S+@\S+/g;

export function scrubText(input: string): string {
  let out = input.replace(CURRENCY, '[…]').replace(VPA, '[…]').replace(LONG_DIGITS, '[…]');
  if (out.length > 40) out = `${out.slice(0, 40)}[…]`;
  return out;
}

export type RedactedError = { name: string; message: string; stack?: string };

export function redactError(e: unknown): RedactedError {
  const err = e instanceof Error ? e : new Error(String(e));
  return {
    name: err.name,
    message: scrubText(err.message),
    stack: err.stack ? scrubText(err.stack) : undefined,
  };
}

function forward(e: unknown, op?: string) {
  if (!__DEV__ && armed && capture) capture(e, { op });
}

export const log = {
  debug: (...args: unknown[]) => {
    if (__DEV__) console.debug(...args);
  },
  info: (...args: unknown[]) => {
    if (__DEV__) console.info(...args);
  },
  warn: (e: unknown, op?: string) => {
    if (__DEV__) console.warn(op ?? '', e);
    forward(e, op);
  },
  error: (e: unknown, op?: string) => {
    if (__DEV__) console.error(op ?? '', e);
    forward(e, op);
  },
};
