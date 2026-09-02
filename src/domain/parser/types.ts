/** SPEC-implementation.md §23 — pure types, no react-native / expo imports (§18.1). */

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
