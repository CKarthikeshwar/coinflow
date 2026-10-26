/**
 * §46.3 `looksLikeCardBillPayment` (UI-108) — a bank debit SMS that says it paid a credit-card bill, for a card the
 * user has as an account. Such a debit is really a transfer (bank → card), not spending; when the card's own SMS
 * never arrives there is no twin to link, so the app asks instead. Runs at ingest — the SMS body is never stored.
 */

const BILL_WORDING =
  /\btowards\b[^.]*\bcredit\s*card\b|\bcredit\s*card\s*(?:bill\s*)?payment\b|\bcard\s*bill\b|\bcc\s*(?:bill\s*)?payment\b/i;

/** Masked digits that follow a "card" mention: "Credit Card XX4321", "card ending 4321", "CC *4321". */
const CARD_DIGITS = /\b(?:card|cc)\b(?:\s+(?:no\.?|number))?\s*(?:ending(?:\s+(?:with|in))?\s*)?[x*]*\s?(\d{3,4})\b/gi;

/**
 * The last digits of the card being paid, when the body reads like a card-bill payment AND those digits are one of
 * `cardLast4s` (the user's card accounts). `null` otherwise.
 */
export function looksLikeCardBillPayment(body: string, cardLast4s: readonly string[]): string | null {
  if (cardLast4s.length === 0 || !BILL_WORDING.test(body)) return null;
  for (const m of body.matchAll(CARD_DIGITS)) {
    if (cardLast4s.includes(m[1])) return m[1];
  }
  return null;
}
