/**
 * CR-31 — typing an hour or minute on the app's numeric keypad (the Add / Confirm / Edit sheet's Date & time
 * picker). Pure: the sheet keeps the digit `buffer` for the field being typed and applies the returned `value`.
 *
 * - The first digit replaces whatever was there ("8" → 08); the second appends ("1","8" → 18).
 * - A digit that would push past the field's maximum starts over with that digit ("2","7" → 07, not 27).
 * - `complete` is true once no further digit could keep the value valid — two digits typed, or a first digit too big
 *   to have a second ("3" for an hour, "6" for a minute). The sheet uses it to move from the hour to the minute.
 */

export type TimeField = 'hour' | 'minute';

export const TIME_FIELD_MAX: Record<TimeField, number> = { hour: 23, minute: 59 };

export type TimeEntry = { buffer: string; value: number; complete: boolean };

export function typeTimeDigit(buffer: string, digit: string, max: number): TimeEntry {
  let next = buffer.length >= 2 ? digit : buffer + digit;
  if (Number(next) > max) next = digit;
  const value = Number(next);
  return { buffer: next, value, complete: next.length >= 2 || value * 10 > max };
}

/** Backspace: drops the last typed digit; an empty buffer reads as 0. */
export function eraseTimeDigit(buffer: string): TimeEntry {
  const next = buffer.slice(0, -1);
  return { buffer: next, value: Number(next || '0'), complete: false };
}
