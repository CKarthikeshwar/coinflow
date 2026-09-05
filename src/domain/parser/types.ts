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

export type ParsedFields = {
  amountMinor: number | null;
  direction: Direction | null;
  account: string | null;
  normalizedKey: string | null;
  paymentMethod: PaymentMethod | null;
  occurredAt: number;
};

export type ParseResult =
  | {
      kind: 'transaction';
      fields: ParsedFields;
      parsedFlags: { amount: boolean; direction: boolean; account: boolean; method: boolean };
      warnings: ParseWarning[];
    }
  | { kind: 'ignored'; reason: IgnoreReason };
