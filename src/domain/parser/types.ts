/**
 * FILE PURPOSE
 * ------------
 * The shared type definitions for the SMS parser (`RawSms` in, `ParseResult` out, plus the
 * pieces in between). Kept in their own file, separate from the logic, so both `parse-sms.ts`
 * and `ignore-rules.ts`/`extract.ts` can share one definition of "what a parsed SMS looks like"
 * without any risk of circular imports between them.
 *
 * WHERE IT FITS
 * -------------
 * `ParseResult` is the contract between the parser and the rest of the app: it's either
 * `{ kind: 'ignored', reason }` or `{ kind: 'transaction', fields, parsedFlags, warnings }`.
 * `src/services/tasks/sms-ingest.ts` is the only place outside `domain/parser/` that reads a
 * `ParseResult` — it turns a `'transaction'` result into a `Suggestion` database row.
 */

import type { PaymentMethod } from '@/db/schema';

export type RawSms = { sender: string; body: string; receivedAt: number };

export type Direction = 'debit' | 'credit';

export type ParseWarning = 'amountOutOfRange' | 'ambiguousDirection';

export type IgnoreReason =
  | 'sender'
  | 'otp'
  | 'promo'
  | 'balance-only'
  | 'request-money'
  | 'foreign-currency'
  | 'not-yet-settled'
  | 'not-a-txn';

/** §46.4 — which of the user's own accounts the SMS is about (bank from the sender, digits from the body). */
export type OwnAccountRef = {
  bankKey: string;
  bankName: string | null;
  last4: string;
  kind: 'bank' | 'credit_card';
};

export type ParsedFields = {
  amountMinor: number | null;
  direction: Direction | null;
  account: string | null;
  normalizedKey: string | null;
  paymentMethod: PaymentMethod | null;
  occurredAt: number;
  ownAccount: OwnAccountRef | null;
  /** §46.4 — the balance the bank reports (card: available limit), paise; null when the SMS gives none. */
  balanceMinor: number | null;
  /** §46.4 — a card statement's total due and due date. */
  due: DueRef | null;
};

export type DueRef = { amountMinor: number; dueAt: number };

export type ParseResult =
  | {
      kind: 'transaction';
      fields: ParsedFields;
      parsedFlags: { amount: boolean; direction: boolean; account: boolean; method: boolean };
      warnings: ParseWarning[];
    }
  | { kind: 'ignored'; reason: IgnoreReason }
  /**
   * §46.4 — no transaction, but news about one of your accounts: a balance-only text ("Avl Bal is Rs …") or a card
   * statement (total due + due date). Ingest writes a balance snapshot / due date; no suggestion, no notification.
   */
  | {
      kind: 'balance';
      ownAccount: OwnAccountRef;
      balanceMinor: number | null;
      due: DueRef | null;
      receivedAt: number;
    };
