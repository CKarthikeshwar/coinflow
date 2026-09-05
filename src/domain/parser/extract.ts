/**
 * FILE PURPOSE
 * ------------
 * The regex-based "readers" that pull individual pieces of information out of an SMS message
 * body: how much money, which direction (debit/credit), which account/person it involved, and
 * which payment method (UPI/card/bank transfer/wallet) was used. `parse-sms.ts` calls these
 * one at a time and assembles the results.
 *
 * WHERE IT FITS
 * -------------
 * This is the "read the text" layer, one step below `parse-sms.ts`'s orchestration. Every
 * function here takes a plain string and returns `value | null` — never throws, and never
 * assumes the text is well-formed, because real bank SMS formats vary wildly between banks
 * and change over time.
 *
 * USED BY
 * -------
 * `src/domain/parser/parse-sms.ts` (the only caller) and `src/domain/parser/ignore-rules.ts`
 * (reuses the debit/credit/amount regex *sources* to check "does this message even mention an
 * amount or a direction keyword" before deciding whether to ignore it).
 *
 * IMPORTANT
 * ---------
 * When you're reading `extractAmountAndDirection` below, the tricky part isn't finding a
 * number or a keyword — it's SMS messages that mention MULTIPLE amounts or BOTH debit and
 * credit keywords (e.g. "Rs 500 debited... available balance Rs 12,340"). The function has to
 * pick which amount is the actual transaction amount (as opposed to a balance figure) and
 * whether it was money going out or in — see the inline comments there for exactly how.
 */

import { normalizeAccount } from '@/domain/normalize';
import type { PaymentMethod } from '@/db/schema';

import type { Direction } from './types';

// Shared keyword sources (regex *source strings*, not compiled instances — compiled fresh at
// each use so stateful `lastIndex` on a shared global regex can never leak between calls).
export const DEBIT_KEYWORDS_SOURCE =
  '\\b(debited|debit|spent|paid|withdrawn|purchase of|sent to|transferred to|payment of|dr)\\b';
export const CREDIT_KEYWORDS_SOURCE =
  '\\b(credited|credit|received|deposited|added to|refund of|cr)\\b';

export const AMOUNT_SOURCE =
  '(?:rs\\.?|inr|₹)\\s?((?:\\d{1,2},)?(?:\\d{2},)*\\d{3}(?:\\.\\d{1,2})?|\\d+(?:\\.\\d{1,2})?)';

const VPA_SOURCE = '\\b[\\w.-]{2,}@[a-z]{2,}\\b';

/** ₹1,00,00,000 (one crore) in paise — §23.4 out-of-range ceiling. */
const MAX_PAISE = 1_00_00_000_00;

function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** Rupees-as-string → paise-as-integer. Never `parseFloat` into rupees (D28). */
function toPaise(numStr: string): number {
  const cleaned = numStr.replace(/,/g, '');
  const [majorStr, fracStr = ''] = cleaned.split('.');
  const major = parseInt(majorStr || '0', 10);
  const minorPadded = (fracStr + '00').slice(0, 2);
  return major * 100 + parseInt(minorPadded, 10);
}

function findAllPositions(source: string, text: string): number[] {
  const re = new RegExp(source, 'gi');
  const positions: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    positions.push(m.index);
    if (m.index === re.lastIndex) re.lastIndex += 1;
  }
  return positions;
}

function findAmountCandidates(text: string): { value: number; index: number }[] {
  const re = new RegExp(AMOUNT_SOURCE, 'gi');
  const out: { value: number; index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    out.push({ value: toPaise(m[1]), index: m.index });
    if (m.index === re.lastIndex) re.lastIndex += 1;
  }
  return out;
}

function nearestDistance(positions: number[], index: number): number {
  return Math.min(...positions.map((p) => Math.abs(p - index)));
}

export type AmountResult = { value: number | null; outOfRange: boolean };
export type DirectionResult = { value: Direction | null; ambiguous: boolean };

/**
 * Amount and direction are resolved together (§23.4), because a real bank SMS often contains
 * more than one number ("Rs 500 debited... available balance Rs 12,340") or, less often,
 * mentions both a debit and credit keyword. Neither can be picked in isolation without risking
 * picking the wrong one, so this function finds all the candidates for both, then uses their
 * positions in the text to decide which amount is the real transaction amount and which
 * direction word applies to it — using "closest word wins" as the tie-breaker, on the
 * assumption that a bank writes the amount right next to the verb describing what happened to
 * it ("Rs 500 debited"), not next to an unrelated balance figure.
 *
 * Step 1 — pick the amount:
 *   - Exactly one amount in the message → that's the one, no ambiguity possible.
 *   - Multiple amounts, but no debit/credit keyword anywhere → just take the first amount
 *     (there's no keyword to use as a tie-breaker, so guessing further would be worse).
 *   - Multiple amounts AND at least one direction keyword → pick whichever amount sits
 *     closest (fewest characters away) to any direction keyword in the text.
 *
 * Step 2 — pick the direction:
 *   - Only debit keywords found → direction is 'debit'. Only credit keywords → 'credit'.
 *   - BOTH debit and credit keywords appear (rare, but happens) → look at which one is
 *     physically closer to the amount chosen in step 1, and use that. If they're exactly
 *     tied in distance, direction is genuinely ambiguous, `ambiguous: true` — the caller
 *     surfaces this as a warning rather than guessing.
 */
export function extractAmountAndDirection(body: string): {
  amount: AmountResult;
  direction: DirectionResult;
} {
  const amounts = findAmountCandidates(body);
  const debitPositions = findAllPositions(DEBIT_KEYWORDS_SOURCE, body);
  const creditPositions = findAllPositions(CREDIT_KEYWORDS_SOURCE, body);
  const directionPositions = [...debitPositions, ...creditPositions];

  let chosen: { value: number; index: number } | null = null;
  if (amounts.length === 1 || (amounts.length > 1 && directionPositions.length === 0)) {
    chosen = amounts[0] ?? null;
  } else if (amounts.length > 1) {
    chosen = amounts.reduce((best, cand) =>
      nearestDistance(directionPositions, cand.index) < nearestDistance(directionPositions, best.index)
        ? cand
        : best,
    );
  }

  // Sanity-check the chosen amount against a hard ceiling (₹1 crore) rather than trusting any
  // number the regex found — a badly-formatted SMS could otherwise produce an absurd amount.
  const outOfRange = chosen !== null && (chosen.value <= 0 || chosen.value > MAX_PAISE);

  const hasDebit = debitPositions.length > 0;
  const hasCredit = creditPositions.length > 0;
  let direction: Direction | null = null;
  let ambiguous = false;

  if (hasDebit && !hasCredit) {
    direction = 'debit';
  } else if (hasCredit && !hasDebit) {
    direction = 'credit';
  } else if (hasDebit && hasCredit) {
    if (chosen) {
      const debitDist = nearestDistance(debitPositions, chosen.index);
      const creditDist = nearestDistance(creditPositions, chosen.index);
      if (debitDist < creditDist) direction = 'debit';
      else if (creditDist < debitDist) direction = 'credit';
      else ambiguous = true;
    } else {
      ambiguous = true;
    }
  }

  return {
    amount: { value: chosen ? chosen.value : null, outOfRange },
    direction: { value: direction, ambiguous },
  };
}

const SCHEME_TOKENS = new Set(['upi', 'dr', 'cr', 'imps', 'neft', 'rtgs']);

/** Alpha segment of a `UPI/DR/123456/NAME/…` style ref that isn't a bank/scheme token. */
function extractFromUpiRef(body: string): string | null {
  const match = body.match(/\bupi[/-][\w/-]*/i);
  if (!match) return null;
  const segments = match[0].split(/[/-]/).filter(Boolean);
  for (const seg of segments) {
    if (/^\d+$/.test(seg)) continue;
    if (SCHEME_TOKENS.has(seg.toLowerCase())) continue;
    return seg;
  }
  return null;
}

/**
 * §23.4 priority: (1) VPA, (2) `to|at|towards|for|in favour of <name>`, (3) UPI-ref alpha
 * segment, (4) `from <name>` for credits. `raw` is returned case-preserved; `normalizedKey`
 * is `normalize(raw)` (§24). No match ⇒ `null` (F7 — never guessed).
 */
export function extractAccount(
  body: string,
  direction: Direction | null,
): { raw: string; normalizedKey: string } | null {
  const vpa = body.match(new RegExp(VPA_SOURCE, 'i'));
  if (vpa) return { raw: vpa[0], normalizedKey: normalizeAccount(vpa[0]) };

  // The negative lookahead guards against "credited/debited to A/c 1234…" — "to" introducing
  // the user's own account, not a counterparty — which would otherwise swallow it as a name.
  const toAt = body.match(
    /\b(?:to|at|towards|for|in favour of)\s+(?!(?:on|ref|upi|a\/c)\b)([^.]+?)(?=\s+(?:on|ref|upi|a\/c)\b|\.|$)/i,
  );
  if (toAt?.[1]?.trim()) {
    const raw = toAt[1].trim();
    return { raw, normalizedKey: normalizeAccount(raw) };
  }

  const upiRef = extractFromUpiRef(body);
  if (upiRef) return { raw: upiRef, normalizedKey: normalizeAccount(upiRef) };

  if (direction === 'credit') {
    const from = body.match(/\bfrom\s+(?!(?:on|ref|upi|a\/c)\b)([^.]+?)(?=\s+(?:on|ref|upi|a\/c)\b|\.|$)/i);
    if (from?.[1]?.trim()) {
      const raw = from[1].trim();
      return { raw, normalizedKey: normalizeAccount(raw) };
    }
  }

  return null;
}

/**
 * §23.4 fourth bullet. VPA presence is passed in — already known from `extractAccount`.
 * Explicit rail names (imps/neft/rtgs) are checked before the bare `xx\d{4}` mask pattern —
 * a masked *account* number ("A/c XX1234") is far more common in bank SMS than an actual card
 * mask, so treating it as a card signal only when nothing more specific matched avoids
 * misreading a plain bank-transfer message as a card payment.
 */
export function extractPaymentMethod(body: string, hasVpa: boolean): PaymentMethod | null {
  if (hasVpa || /\bupi\b/i.test(body)) return 'upi';
  if (/\bcard\b|\bcard ending\b/i.test(body)) return 'card';
  if (/\bimps\b|\bneft\b|\brtgs\b/i.test(body)) return 'bank_transfer';
  if (/\bxx\d{4}\b/i.test(body)) return 'card';
  if (/\bwallet\b|\bpaytm wallet\b|\bamazon pay balance\b|\bphonepe wallet\b/i.test(body)) {
    return 'wallet';
  }
  return null;
}

export function hasVpa(body: string): boolean {
  return new RegExp(VPA_SOURCE, 'i').test(body);
}

export { collapseWhitespace };
