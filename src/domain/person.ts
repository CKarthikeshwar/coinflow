/**
 * FILE PURPOSE
 * ------------
 * Phone-number identity for V2 people (SPEC-implementation.md §40.3, §39.1, IMP-077) and the rule for
 * which SMS senders may be a split request at all (D40).
 *
 * CoinFlow is India-only in V1/V2 (D3), so a person is identified by their **10-digit mobile number**
 * (`phoneKey`, the last ten digits). Two inputs with the same key are the same person.
 */

/** Result of normalising a number typed by the user, picked from contacts, or read off an SMS. */
export type NormalizedPhone = {
  /** Last 10 digits — the identity used for uniqueness and lookups. */
  phoneKey: string;
  /** `+91XXXXXXXXXX` — the form used to send an SMS. */
  phoneDisplay: string;
};

/**
 * Normalises an Indian mobile number: strips spaces, dashes, dots and brackets, accepts `+91`, `91`,
 * `0` prefixes, and requires exactly ten digits starting 6–9. Anything else (landlines, short codes,
 * foreign numbers, garbage) returns `null`. Known limit: a trunk-prefixed landline such as `080-2345-6789`
 * is indistinguishable from `0` + a mobile number and is accepted — the number is only ever used to send an
 * SMS the user chose to send, so this is harmless.
 */
export function normalizePhone(raw: string | null | undefined): NormalizedPhone | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!/^[+\d(][\d\s\-().]*$/.test(trimmed)) return null;
  let digits = trimmed.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  else if (digits.length === 13 && digits.startsWith('091')) digits = digits.slice(3);
  if (!/^[6-9]\d{9}$/.test(digits)) return null;
  return { phoneKey: digits, phoneDisplay: `+91${digits}` };
}

/** `98•••• 7555` — list display: first two digits and the last four. */
export function maskPhone(phoneKey: string): string {
  if (phoneKey.length !== 10) return phoneKey;
  return `${phoneKey.slice(0, 2)}•••• ${phoneKey.slice(6)}`;
}

/**
 * D40 — a split request is only accepted from a **numeric** SMS sender (a phone number): at least ten
 * digits, nothing but digits, `+`, spaces, dashes and brackets. Alphanumeric sender IDs (`VA-SBICRD-P`,
 * `HSBCIN`) — which is what every bank uses — and short codes are never requests.
 */
export function isPhoneNumberSender(address: string | null | undefined): boolean {
  if (!address) return false;
  const trimmed = address.trim();
  if (!/^\+?[\d\s\-()]+$/.test(trimmed)) return false;
  return trimmed.replace(/\D/g, '').length >= 10;
}
