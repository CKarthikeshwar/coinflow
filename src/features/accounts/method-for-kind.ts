import type { AccountKind, PaymentMethod } from '@/db/schema';

/** The payment method a prefilled row on an account gets (UI-107 "Add transaction") — one that fits its kind (§46.8). */
export const METHOD_FOR_KIND: Record<AccountKind, PaymentMethod> = {
  bank: 'bank_transfer',
  credit_card: 'card',
  wallet: 'wallet',
  cash: 'cash',
};
