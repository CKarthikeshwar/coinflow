/**
 * FILE PURPOSE
 * ------------
 * This is the single entry point for turning one raw SMS message into either "this is a
 * transaction, here's what I could read from it" or "ignore this, and here's why." It's the
 * brain of the whole automatic-detection feature — everything else in `domain/parser/` is a
 * helper this function calls.
 *
 * WHERE IT FITS
 * -------------
 * `parseSms` sits right after the native Android SMS receiver hands a new message to JS, and
 * right before that result gets turned into a database row. It's pure logic with no database or
 * UI involved — it just takes `{ sender, body, receivedAt }` in, and returns a decision out.
 *
 * DATA FLOW (the automatic-detection pipeline)
 * ---------------------------------------------
 *   Android SMS receiver (native, `modules/coinflow-sms`)
 *       ↓ hands the raw SMS to a headless JS task
 *   src/services/tasks/sms-ingest.ts
 *       ↓ calls parseSms(rawSms)   ← YOU ARE HERE
 *   parseSms runs 4 steps, in order, short-circuiting at the first "ignore" match:
 *     1. sender gate      — is this even from a known bank/payment-app sender? (checks
 *                            `constants/sms-senders.ts`) If not: ignored, reason 'sender'.
 *     2. ignore gate       — is this an OTP, a promo, a balance-check, a money *request*
 *                            (not a completed payment), a foreign-currency message, or a
 *                            "will be credited later" message? (`ignore-rules.ts`)
 *     3. field extraction  — pull out amount, debit/credit direction, the other party's
 *                            account/name, and payment method (`extract.ts`)
 *     4. transaction gate  — did we find at least an amount OR a direction? If neither,
 *                            this probably isn't a transaction at all: ignored, reason 'not-a-txn'.
 *   Anything that survives all 4 steps comes back as `{ kind: 'transaction', fields, ... }`.
 *       ↓
 *   sms-ingest.ts turns that into a `Suggestion` row (a "detected, not yet confirmed"
 *   transaction) via `src/db/repositories/suggestions.ts`, which the user reviews via a
 *   notification or the Review Queue before it becomes a real transaction.
 *
 * IMPORTANT
 * ---------
 * - `occurredAt` on the result is NOT parsed out of the message text — it's simply
 *   `input.receivedAt`, the time the phone received the SMS. Banks' own timestamps in the SMS
 *   body are inconsistent/unreliable, so this app deliberately doesn't try to parse them.
 * - There is no confidence score. Every field is either found (with a value) or not found
 *   (`null`) — the app never guesses a "maybe" value, it just leaves the field blank for the
 *   user to fill in.
 * - This file has zero react-native/expo imports on purpose, which is what makes it possible
 *   to unit-test extensively against a corpus of real (anonymized) bank SMS formats
 *   (`__fixtures__/sms-corpus.ts`) without needing to run the app at all.
 */

import { isKnownSender } from '@/constants/sms-senders';
import { bankFromSms } from '@/domain/accounts/account-key';

import {
  collapseWhitespace,
  extractAccount,
  extractAmountAndDirection,
  extractBalance,
  extractDue,
  extractOwnAccount,
  extractPaymentMethod,
  hasVpa,
} from './extract';
import { checkIgnoreGate } from './ignore-rules';
import type { OwnAccountRef, ParseResult, ParseWarning, RawSms } from './types';

const MONEY_MOVED_RE = /\b(?:debited|credited|spent|paid|received|withdrawn|transferred|deposited)\b/i;

/** §46.4 — both halves are required: a bank we can name and masked digits in the body. */
function ownAccountOf(sender: string, body: string): OwnAccountRef | null {
  const digits = extractOwnAccount(body);
  if (!digits) return null;
  const bank = bankFromSms(sender, body);
  if (!bank) return null;
  return {
    bankKey: bank.bankKey,
    bankName: bank.bankName,
    last4: digits.last4,
    kind: digits.isCreditCard ? 'credit_card' : 'bank',
  };
}

export function parseSms(input: RawSms): ParseResult {
  if (!isKnownSender(input.sender)) {
    return { kind: 'ignored', reason: 'sender' };
  }

  const body = collapseWhitespace(input.body ?? '');

  const ignoreReason = checkIgnoreGate(body);
  // §46.4 — a balance-only text about a recognisable account of yours is a balance update, not noise. Every other
  // gate (OTP, promo, request, foreign currency, not settled) still wins: a promo that mentions a balance never
  // writes one.
  if (ignoreReason && ignoreReason !== 'balance-only') {
    return { kind: 'ignored', reason: ignoreReason };
  }
  const ownAccount = ownAccountOf(input.sender, body);
  const balanceMinor = extractBalance(body);
  const due = extractDue(body);
  const accountNews = (): ParseResult | null =>
    ownAccount && (balanceMinor !== null || due !== null)
      ? { kind: 'balance', ownAccount, balanceMinor, due, receivedAt: input.receivedAt }
      : null;
  if (ignoreReason === 'balance-only') {
    return accountNews() ?? { kind: 'ignored', reason: 'balance-only' };
  }

  const { amount, direction } = extractAmountAndDirection(body);

  // a card statement ("Total due Rs 14,200 … due date 05-Nov-26") moves no money — it only updates the card. Its
  // "Credit Card" reads as a credit to the direction reader, so the test is the absence of a money-moving verb.
  if (due && !MONEY_MOVED_RE.test(body)) {
    return accountNews() ?? { kind: 'ignored', reason: 'not-a-txn' };
  }

  if (amount.value === null && direction.value === null) {
    return accountNews() ?? { kind: 'ignored', reason: 'not-a-txn' };
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
      ownAccount,
      balanceMinor,
      due,
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

export type { OwnAccountRef, ParseResult, ParsedFields, RawSms } from './types';
