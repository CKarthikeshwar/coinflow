/**
 * `parseSms` — SPEC-implementation.md §23.1 / §23.5. Pure TS, no react-native / expo imports.
 *
 *   RawSms
 *     → sender gate      non-match ⇒ ignored:'sender'
 *     → ignore gate       OTP / promo / balance-only / request-money / forex / not-yet-settled
 *     → field extraction  amount · direction · account · paymentMethod
 *     → transaction gate  need direction OR amount, else ⇒ ignored:'not-a-txn'
 *     ⇒ transaction { fields, parsedFlags, warnings }
 *
 * `occurredAt` is not parsed from the body — it is `input.receivedAt` (§7 / P-11). No confidence
 * score (§7).
 */

import { isKnownSender } from '@/constants/sms-senders';

import { collapseWhitespace, extractAccount, extractAmountAndDirection, extractPaymentMethod, hasVpa } from './extract';
import { checkIgnoreGate } from './ignore-rules';
import type { ParseResult, ParseWarning, RawSms } from './types';

export function parseSms(input: RawSms): ParseResult {
  if (!isKnownSender(input.sender)) {
    return { kind: 'ignored', reason: 'sender' };
  }

  const body = collapseWhitespace(input.body ?? '');

  const ignoreReason = checkIgnoreGate(body);
  if (ignoreReason) {
    return { kind: 'ignored', reason: ignoreReason };
  }

  const { amount, direction } = extractAmountAndDirection(body);

  if (amount.value === null && direction.value === null) {
    return { kind: 'ignored', reason: 'not-a-txn' };
  }

  const account = extractAccount(body, direction.value);
  const paymentMethod = extractPaymentMethod(body, hasVpa(body));

  const warnings: ParseWarning[] = [];
  if (amount.outOfRange) warnings.push('amountOutOfRange');
  if (direction.ambiguous) warnings.push('ambiguousDirection');

  return {
    kind: 'transaction',
    fields: {
      amountMinor: amount.value,
      direction: direction.value,
      account: account?.raw ?? null,
      normalizedKey: account?.normalizedKey ?? null,
      paymentMethod,
      occurredAt: input.receivedAt,
    },
    parsedFlags: {
      amount: amount.value !== null,
      direction: direction.value !== null,
      account: account !== null,
      method: paymentMethod !== null,
    },
    warnings,
  };
}

export type { ParseResult, ParsedFields, RawSms } from './types';
