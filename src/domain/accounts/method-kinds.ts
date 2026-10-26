/**
 * §46.8 / UI-102 — which kinds of account can be used with each payment method. Drives the sheet's **Paid from**
 * chips and the payment method chosen for an SMS that names an account.
 */

import type { AccountKind, PaymentMethod } from '@/db/schema';

export const ACCOUNT_KINDS_FOR_METHOD: Record<PaymentMethod, readonly AccountKind[]> = {
  upi: ['bank'],
  bank_transfer: ['bank'],
  card: ['credit_card', 'bank'],
  wallet: ['wallet'],
  cash: ['cash'],
};

export function accountFitsMethod(kind: AccountKind, method: PaymentMethod | null): boolean {
  if (!method) return true;
  return ACCOUNT_KINDS_FOR_METHOD[method].includes(kind);
}

type Pickable = { id: string; kind: AccountKind };

/**
 * UI-102 preselection: one fitting account ⇒ it; several ⇒ the one last used with this method (when it still fits);
 * none fitting / no hint ⇒ `null` ("Not sure").
 */
export function preselectAccount(
  accounts: readonly Pickable[],
  method: PaymentMethod | null,
  lastUsedId: string | null,
): string | null {
  const fitting = accounts.filter((a) => accountFitsMethod(a.kind, method));
  if (fitting.length === 1) return fitting[0].id;
  if (lastUsedId && fitting.some((a) => a.id === lastUsedId)) return lastUsedId;
  return null;
}

export const ACCOUNT_KIND_LABEL: Record<AccountKind, string> = {
  bank: 'Bank account',
  credit_card: 'Credit card',
  wallet: 'Wallet',
  cash: 'Cash',
};

/** UI-103 section titles, in display order. */
export const ACCOUNT_SECTIONS: readonly { kind: AccountKind; title: string }[] = [
  { kind: 'bank', title: 'Bank accounts' },
  { kind: 'credit_card', title: 'Cards' },
  { kind: 'wallet', title: 'Wallets' },
  { kind: 'cash', title: 'Cash' },
];
