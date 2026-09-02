/**
 * Notification content builder — SPEC-implementation.md §31.3. Pure — no `expo-notifications`
 * calls here, just the content shape `post.ts` hands to `scheduleNotificationAsync`.
 */

import { formatMoney } from '@/domain/format/money';
import type { AccountRule, PaymentMethod, Suggestion } from '@/db/schema';

import { TXN_KNOWN_CATEGORY, TXN_NEW_CATEGORY } from './categories';

/** `txn-review-group` groups every posting under one thread — kept exactly as spec'd; this is
 * a plain `data`/notification-id convention, not a category identifier, so the hyphen is fine. */
export const TXN_REVIEW_THREAD_ID = 'txn-review-group';

const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  upi: 'UPI',
  card: 'Card',
  cash: 'Cash',
  bank_transfer: 'Bank transfer',
  wallet: 'Wallet',
};

function buildTitle(suggestion: Suggestion): string {
  const directionWord = suggestion.direction === 'credit' ? 'credited' : 'debited';
  const amountLabel =
    suggestion.amountMinor !== null ? formatMoney(suggestion.amountMinor, { sign: 'none' }) : '—';
  return `${amountLabel} ${directionWord}`;
}

function buildBody(suggestion: Suggestion): string {
  if (!suggestion.account) return 'Unknown account';
  const methodLabel = suggestion.paymentMethod ? PAYMENT_METHOD_LABEL[suggestion.paymentMethod] : null;
  return methodLabel ? `${suggestion.account} · ${methodLabel}` : suggestion.account;
}

export type TxnNotificationData = {
  kind: 'suggestion';
  suggestionId: string;
  dedupeKey: string;
  ruleKey: string | null;
  postedAt: number;
};

export type TxnNotificationContent = {
  identifier: string;
  categoryIdentifier: string;
  title: string;
  body: string;
  threadId: string;
  data: TxnNotificationData;
};

/** "known" per §25.1 = a rule exists **and** has a category. */
export function isKnownAccount(rule: AccountRule | null): boolean {
  return rule !== null && rule.categoryId !== null;
}

export function buildTxnNotification(
  suggestion: Suggestion,
  rule: AccountRule | null,
): TxnNotificationContent {
  return {
    identifier: `sug:${suggestion.id}`,
    categoryIdentifier: isKnownAccount(rule) ? TXN_KNOWN_CATEGORY : TXN_NEW_CATEGORY,
    title: buildTitle(suggestion),
    body: buildBody(suggestion),
    threadId: TXN_REVIEW_THREAD_ID,
    data: {
      kind: 'suggestion',
      suggestionId: suggestion.id,
      dedupeKey: suggestion.dedupeKey,
      ruleKey: suggestion.normalizedKey,
      postedAt: Date.now(),
    },
  };
}
