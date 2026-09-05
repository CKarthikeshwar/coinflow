/**
 * FILE PURPOSE
 * ------------
 * Turns a `Suggestion` row (a detected-but-unconfirmed transaction) into the exact title, body
 * text, and metadata that will be shown in a notification — e.g. "₹450 debited" /
 * "Swiggy · UPI". This file does NOT actually post anything; it just builds the content object.
 *
 * WHERE IT FITS
 * -------------
 * `src/services/notifications/post.ts` calls `buildTxnNotification` and hands the result
 * straight to `expo-notifications`' `scheduleNotificationAsync`. Keeping the "what should this
 * say" logic separate from the "how do I actually post it" logic makes the content easy to
 * unit-test without needing to mock the whole notifications API.
 *
 * IMPORTANT
 * ---------
 * `categoryIdentifier` (which set of action buttons the notification gets — see
 * `categories.ts`) is decided here, by checking `isKnownAccountRule(rule)`
 * (`src/domain/categorize.ts`): a "known" account gets the one-tap `Save` button, a "new" one
 * doesn't. The `data` field carries the `suggestionId` that a tap or button-press needs to look
 * the suggestion back up — see `src/services/notifications/respond.ts` (button presses) and
 * `src/features/app-shell/notification-router.tsx` (a tap that opens the app).
 */

import { isKnownAccountRule } from '@/domain/categorize';
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

export function buildTxnNotification(
  suggestion: Suggestion,
  rule: AccountRule | null,
): TxnNotificationContent {
  return {
    identifier: `sug:${suggestion.id}`,
    categoryIdentifier: isKnownAccountRule(rule) ? TXN_KNOWN_CATEGORY : TXN_NEW_CATEGORY,
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
