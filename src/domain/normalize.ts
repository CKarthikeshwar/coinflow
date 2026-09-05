/**
 * FILE PURPOSE
 * ------------
 * Turns a messy, human/bank-formatted account string (e.g. "HDFC A/c XX1234 **** REF98212345")
 * into a stable, comparable "key" (e.g. "hdfc a/c") by lower-casing it and stripping the parts
 * that change every time — masked digits, long reference numbers, punctuation.
 *
 * WHERE IT FITS
 * -------------
 * This is the glue that makes "account memory" (F8 — remembering what category/note/payment
 * method you used last time for an account) actually work. Bank SMS messages never format the
 * same account the same way twice (reference numbers change, masking varies), so if the app
 * compared raw account strings it would treat every transaction from the same account as a new,
 * never-seen-before account. Normalizing first means "HDFC A/c XX1234 REF001" and
 * "HDFC A/c XX1234 REF002" both become the same lookup key.
 *
 * USED BY
 * -------
 * - `src/db/repositories/transactions.ts` — stores `normalizedAccountKey` alongside every
 *   transaction so it can be matched against a saved rule.
 * - `src/db/repositories/account-rules.ts` — the "account memory" table itself is keyed by
 *   this normalized string (`accountRules.normalizedKey`).
 * - `src/domain/parser/extract.ts` — normalizes the account it just pulled out of an SMS body.
 * - `src/features/transactions/write-confirmed-transaction.ts` — normalizes the account typed
 *   or picked by the user before saving, so it lines up with the same key.
 *
 * IMPORTANT
 * ---------
 * VPA characters (`@ . _ -`) are deliberately kept (not stripped) so a UPI id like
 * "name@bank" still survives normalization intact — those characters are part of the
 * identity, not noise, for UPI-style accounts.
 */
export function normalizeAccount(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .toLowerCase()
    .replace(/\*+/g, ' ') // masked-card asterisks
    .replace(/\b\d{4,}\b/g, ' ') // reference / order / masked-account digit runs
    .replace(/[^\p{L}\p{N}\s@._-]/gu, ' ') // punctuation, keep VPA chars
    .replace(/(^[\s._-]+)|([\s._-]+$)/g, '') // trim edge separators
    .replace(/\s+/g, ' ')
    .trim();
}
