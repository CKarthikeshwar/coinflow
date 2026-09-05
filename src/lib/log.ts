/**
 * FILE PURPOSE
 * ------------
 * The app's logging utility (`log.debug/info/warn/error`) — this is the ONLY sanctioned way for
 * a `warn`/`error` call to potentially reach Sentry. It's also where the actual PII-scrubbing
 * logic lives (`scrubText`/`redactError`), reused by `src/services/crash/index.ts` too.
 *
 * WHERE IT FITS
 * -------------
 * A handful of files call `log.warn`/`log.error` directly (mainly `src/db/migration-gate.tsx`
 * and the settings/export flow) instead of Sentry directly, so this file is where the "should
 * this actually leave the device" decision is centralized rather than scattered across callers.
 *
 * IMPORTANT — privacy behavior
 * --------------------------------
 * - `debug`/`info` only ever print to the console, and only in dev builds — they can never
 *   reach Sentry, full stop.
 * - `warn`/`error` always print to the console in dev, and in a release build, forward a
 *   *redacted* version of the error to Sentry — but ONLY if crash reporting has been armed
 *   (`src/services/crash`'s `armCrashReporting(true)` has run, meaning the user opted in). If
 *   it hasn't, `forward()` does nothing at all — this matches the app-wide guarantee that
 *   nothing transmits over the network unless the user explicitly turned crash reporting on.
 * - `scrubText` is the actual privacy filter: it strips patterns that look like money (₹1,234),
 *   VPAs (name@bank), or long digit runs (account/reference numbers) from any text before it
 *   could ever reach Sentry, and truncates long strings as a further safety margin. This
 *   strips *known dangerous patterns*, not arbitrary free text — which is exactly why the SMS
 *   parser (`src/domain/parser/`) has its own hard rule to NEVER put raw SMS body text into an
 *   `Error` object in the first place: this scrubber is a safety net, not something to rely on
 *   as the only protection.
 * - `_setCrashSink` exists purely to avoid a circular import: this file needs to call into
 *   `src/services/crash` to actually send to Sentry, but `services/crash` also needs to import
 *   from this file (for `scrubText`/`redactError`). Instead of importing each other directly,
 *   `services/crash` calls `_setCrashSink` once at startup to hand this file a callback.
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
