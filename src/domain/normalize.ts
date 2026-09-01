/**
 * Account normalization — the core transform from SPEC-implementation.md §24.1:
 * lower-case, strip `*` and long reference/order digit runs, strip punctuation, collapse
 * whitespace. VPA characters (`@ . _ -`) are kept so `name@bank` survives.
 *
 * The full §24.2 worked table and the §24.3 matching rules are pinned in the
 * business-logic phase; `transactionRepo` / `accountRuleRepo` use this as the shared key.
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
