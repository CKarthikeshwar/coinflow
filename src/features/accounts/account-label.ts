/**
 * How one of the user's accounts is written in lists and sheets (UI-103 / UI-109): the nickname, and the quiet
 * "HDFC Bank ··672" line under it.
 */

import { defaultNickname } from '@/domain/accounts/account-key';
import { ACCOUNT_KIND_LABEL } from '@/domain/accounts/method-kinds';
import type { AccountKind, MyAccount } from '@/db/schema';
import type { IconName } from '@/ui/icon';

export const ACCOUNT_KIND_ICON: Record<AccountKind, IconName> = {
  bank: 'landmark',
  credit_card: 'credit-card',
  wallet: 'wallet',
  cash: 'banknote',
};

/** The short name used inside other lines ("SBI ··1234 → HDFC ··672"). */
export function accountName(account: Pick<MyAccount, 'nickname' | 'bankKey' | 'last4'> | null | undefined): string {
  if (!account) return 'No account';
  return account.nickname || defaultNickname(account.bankKey, account.last4);
}

/** "HDFC Bank ··672", or the kind ("Wallet") when there is neither bank nor digits. */
export function accountSubtitle(account: Pick<MyAccount, 'kind' | 'bankName' | 'last4'>): string {
  const parts = [account.bankName, account.last4 ? `··${account.last4}` : null].filter(Boolean);
  return parts.length ? parts.join(' ') : ACCOUNT_KIND_LABEL[account.kind];
}
