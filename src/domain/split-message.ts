/**
 * FILE PURPOSE
 * ------------
 * The wire format of a CoinFlow **split request** — the SMS one person sends another asking for their
 * share (SPEC-implementation.md §42.1, D39/D40, IMP-078/079/080). Pure: no I/O, no clock, no randomness
 * (`makeRef` takes its random source as a parameter).
 *
 * THE MESSAGE
 * -----------
 *   `<Name> requests Rs 450.00 for Momos (CoinFlow split). {cf1|ab2cd3|45000|Momos}`
 *   `Please pay Rs 450.00 for Momos (CoinFlow split). {cf1|ab2cd3|45000|Momos}`     (no name set)
 *
 * The sentence is for a human who may not have CoinFlow. The `{cf1|ref|paise|note}` token is the only part
 * a machine reads: `ref` (6 chars, base32 `a-z2-7`) names the split, `paise` is the amount, `note` is a
 * short label. The **same ref with a new amount updates** the request; **amount `0` withdraws** it.
 *
 * WHY "Rs" AND NOT "₹"
 * --------------------
 * `₹` is not in the GSM-7 SMS alphabet: one such character forces the whole message into UCS-2 and cuts
 * a segment from 160 to 70 characters. So the text uses `Rs`, and every character we emit is GSM-7. Note
 * `{ } |` are GSM-7 *extension* characters that cost **two** septets each, so lengths here are counted in
 * septets (`gsm7Length`), not characters.
 *
 * TRUST
 * -----
 * Anyone can send such a text, so `decodeRequest` is deliberately strict (exact grammar, bounded amount,
 * exactly one token, bounded length) and the caller additionally requires a numeric sender (D40, see
 * `person.ts`). Nothing decoded is ever acted on automatically.
 */

/** Largest amount a request may carry: ₹10 lakh, in paise. */
export const MAX_REQUEST_MINOR = 100_000_000;
/** Longest note we send or accept. */
export const MAX_NOTE_LENGTH = 24;
/** Longest sender name we put in a request. */
export const MAX_NAME_LENGTH = 20;
/** Messages longer than this are never treated as requests (3 concatenated segments). */
export const MAX_INCOMING_LENGTH = 480;
/** One GSM-7 segment. */
export const MAX_SEPTETS = 160;

const REF_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';
const TOKEN_RE = /\{cf1\|([a-z2-7]{6})\|(\d{1,9})\|([^|{}]{0,24})\}/g;

// GSM 03.38 default alphabet (1 septet each), minus the control characters we never emit.
const GSM_BASIC =
  "@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
// Extension table (2 septets each: an escape + the character).
const GSM_EXTENSION = '^{}\\[~]|€';

/** Number of septets `text` costs, or `null` if it contains a character outside GSM-7 (would force UCS-2). */
export function gsm7Length(text: string): number | null {
  let n = 0;
  for (const ch of text) {
    if (GSM_BASIC.includes(ch)) n += 1;
    else if (GSM_EXTENSION.includes(ch)) n += 2;
    else return null;
  }
  return n;
}

/** Keeps only basic-GSM printable characters (so no `{ } |`, no newlines, no emoji, no `₹`), collapses spaces. */
function keepBasicGsm(text: string): string {
  let out = '';
  for (const ch of text) if (GSM_BASIC.includes(ch)) out += ch;
  return out.replace(/\s+/g, ' ').trim();
}

/** A request note: GSM-7 basic characters only, no token delimiters, trimmed, at most 24 characters. */
export function sanitizeNote(raw: string | null | undefined): string {
  return keepBasicGsm(raw ?? '').slice(0, MAX_NOTE_LENGTH).trim();
}

/** The sender's name as it appears in the sentence: same rules as a note, at most 20 characters. */
export function sanitizeName(raw: string | null | undefined): string {
  return keepBasicGsm(raw ?? '').slice(0, MAX_NAME_LENGTH).trim();
}

/** A fresh 6-character request reference. `randomByte` must return an integer 0–255 (e.g. from `expo-crypto`). */
export function makeRef(randomByte: () => number): string {
  let ref = '';
  for (let i = 0; i < 6; i++) ref += REF_ALPHABET[randomByte() & 31];
  return ref;
}

/** `Rs 1,20,000.00` — Indian digit grouping, always two decimals, ASCII only. */
export function formatRs(amountMinor: number): string {
  const rupees = Math.floor(amountMinor / 100);
  const paise = amountMinor % 100;
  const digits = String(rupees);
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3;
  return `Rs ${grouped}.${String(paise).padStart(2, '0')}`;
}

export type EncodeInput = { name?: string | null; ref: string; amountMinor: number; note?: string | null };

function assertRef(ref: string) {
  if (!/^[a-z2-7]{6}$/.test(ref)) throw new RangeError('ref must be 6 characters of a-z2-7');
}

/**
 * Builds the request SMS. Guarantees a single GSM-7 segment (≤ 160 septets): if the full sentence is too
 * long it first drops the human-readable "for <note>", then the sender's name — the token always keeps
 * the note, and is never truncated.
 */
export function encodeRequest(input: EncodeInput): string {
  assertRef(input.ref);
  if (!Number.isInteger(input.amountMinor) || input.amountMinor < 1 || input.amountMinor > MAX_REQUEST_MINOR) {
    throw new RangeError('amountMinor must be an integer from 1 paise to ₹10 lakh');
  }
  const note = sanitizeNote(input.note);
  const name = sanitizeName(input.name);
  const token = `{cf1|${input.ref}|${input.amountMinor}|${note}}`;
  const amount = formatRs(input.amountMinor);

  const sentence = (withName: boolean, withNote: boolean) => {
    const lead = withName && name ? `${name} requests ${amount}` : `Please pay ${amount}`;
    return `${lead}${withNote && note ? ` for ${note}` : ''} (CoinFlow split). ${token}`;
  };
  for (const [withName, withNote] of [[true, true], [true, false], [false, false]] as const) {
    const text = sentence(withName, withNote);
    const len = gsm7Length(text);
    if (len !== null && len <= MAX_SEPTETS) return text;
  }
  throw new RangeError('request does not fit in one SMS'); // unreachable with the input bounds above
}

/** The "cancel it" message: same ref, amount `0`. */
export function encodeWithdraw(input: { name?: string | null; ref: string }): string {
  assertRef(input.ref);
  const name = sanitizeName(input.name);
  const lead = name ? `${name} withdrew the earlier request` : 'Please ignore my earlier request';
  return `${lead} (CoinFlow split withdrawn). {cf1|${input.ref}|0|}`;
}

export type DecodedRequest = { ref: string; amountMinor: number; note: string };

/**
 * Reads a request out of an incoming SMS body, or returns `null`. Strict on purpose: the body must be at
 * most 480 characters, contain **exactly one** well-formed token, and the amount must be `0`
 * (withdraw) or 1 paise–₹10 lakh. The note is re-sanitised. The sentence around the token is ignored —
 * only the token is trusted.
 */
export function decodeRequest(body: string | null | undefined): DecodedRequest | null {
  if (!body || body.length > MAX_INCOMING_LENGTH) return null;
  const matches = [...body.matchAll(TOKEN_RE)];
  if (matches.length !== 1) return null;
  const [, ref, digits, rawNote] = matches[0];
  const amountMinor = Number(digits);
  if (!Number.isSafeInteger(amountMinor) || amountMinor > MAX_REQUEST_MINOR) return null;
  return { ref, amountMinor, note: sanitizeNote(rawNote) };
}
