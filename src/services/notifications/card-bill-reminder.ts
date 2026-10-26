/**
 * §46.10 / UI-108 — "HDFC card bill ₹14,200 due in 2 days": one local notification per credit card with a future due
 * date, at 10:00 two days before it. Re-planned from scratch every time (cancel every `card-bill:*`, schedule what
 * applies now), so a changed due date, an archived card or the setting turned off needs no bookkeeping. Tapping it
 * opens My accounts (`deep-link.ts`). Channel `card-bills`, default importance.
 *
 * Called after the database is ready: by `NotificationRouter` on launch / foreground, by ingest when a statement
 * changes a due date, by the account sheet, and by the Settings toggle.
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { listAccounts } from '@/db/repositories/accounts';
import { getSetting } from '@/db/repositories/settings';
import { formatRupees } from '@/domain/format/money';

import { CARD_BILLS_CHANNEL_ID } from './channel';

export const CARD_BILL_ID_PREFIX = 'card-bill:';
export const CARD_BILL_REMINDER_HOUR = 10;
export const CARD_BILL_REMINDER_DAYS_BEFORE = 2;

/** 10:00 local, two days before the due date (`dueAt` is local midnight of that day). */
export function cardBillReminderAt(dueAt: number): number {
  const at = new Date(dueAt);
  at.setDate(at.getDate() - CARD_BILL_REMINDER_DAYS_BEFORE);
  at.setHours(CARD_BILL_REMINDER_HOUR, 0, 0, 0);
  return at.getTime();
}

export type PlannedCardBill = { identifier: string; fireAt: number; title: string; body: string; accountId: string };

/** Pure: which reminders should exist right now. */
export function planCardBillReminders(
  cards: readonly { id: string; nickname: string; dueAt: number | null; dueAmountMinor: number | null }[],
  now: number,
): PlannedCardBill[] {
  return cards.flatMap((card) => {
    if (card.dueAt === null || card.dueAmountMinor === null || card.dueAmountMinor <= 0) return [];
    const fireAt = cardBillReminderAt(card.dueAt);
    if (fireAt <= now) return [];
    return [
      {
        identifier: `${CARD_BILL_ID_PREFIX}${card.id}`,
        fireAt,
        title: `${card.nickname} bill ${formatRupees(card.dueAmountMinor)} due in 2 days`,
        body: 'Paying it from your bank is a transfer, not spending.',
        accountId: card.id,
      },
    ];
  });
}

export function cardBillRemindersEnabled(): boolean {
  return getSetting<boolean>('cardBillRemindersEnabled', true);
}

export async function scheduleCardBillReminders(now: number = Date.now()): Promise<void> {
  if (Platform.OS !== 'android') return;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.identifier.startsWith(CARD_BILL_ID_PREFIX))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
  if (!cardBillRemindersEnabled()) return;
  const permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted') return; // silent, same as the other notifications

  const cards = listAccounts().filter((a) => a.kind === 'credit_card');
  for (const plan of planCardBillReminders(cards, now)) {
    await Notifications.scheduleNotificationAsync({
      identifier: plan.identifier,
      content: { title: plan.title, body: plan.body, data: { kind: 'card-bill', accountId: plan.accountId } },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: plan.fireAt,
        channelId: CARD_BILLS_CHANNEL_ID,
      },
    });
  }
}
