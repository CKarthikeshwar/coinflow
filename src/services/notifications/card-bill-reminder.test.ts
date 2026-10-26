import * as Notifications from 'expo-notifications';

import { cardBillReminderAt, planCardBillReminders, scheduleCardBillReminders } from './card-bill-reminder';

let mockCards: { id: string; kind: string; nickname: string; dueAt: number | null; dueAmountMinor: number | null }[] = [];
let mockEnabled = true;
jest.mock('@/db/repositories/accounts', () => ({ listAccounts: () => mockCards }));
jest.mock('@/db/repositories/settings', () => ({ getSetting: (_k: string, fallback: unknown) => (mockEnabled ? fallback : false) }));
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('expo-notifications', () => ({
  getAllScheduledNotificationsAsync: jest.fn(async () => [{ identifier: 'card-bill:old' }, { identifier: 'daily-reminder' }]),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

const due = new Date(2026, 10, 5).getTime(); // 5 Nov 2026, local midnight

beforeEach(() => {
  jest.clearAllMocks();
  mockEnabled = true;
  mockCards = [{ id: 'card', kind: 'credit_card', nickname: 'HDFC card', dueAt: due, dueAmountMinor: 14_200_00 }];
});

describe('cardBillReminderAt', () => {
  it('is 10:00 two days before the due date', () => {
    expect(new Date(cardBillReminderAt(due))).toEqual(new Date(2026, 10, 3, 10));
  });
});

describe('planCardBillReminders (UI-108)', () => {
  it('one per card with a future reminder time', () => {
    expect(planCardBillReminders(mockCards, new Date(2026, 9, 26).getTime())).toEqual([
      {
        identifier: 'card-bill:card',
        fireAt: new Date(2026, 10, 3, 10).getTime(),
        title: 'HDFC card bill ₹14,200 due in 2 days',
        body: 'Paying it from your bank is a transfer, not spending.',
        accountId: 'card',
      },
    ]);
  });

  it('nothing once the reminder time has passed, or with no / a zero bill', () => {
    expect(planCardBillReminders(mockCards, new Date(2026, 10, 3, 11).getTime())).toEqual([]);
    expect(planCardBillReminders([{ ...mockCards[0], dueAt: null }], 0)).toEqual([]);
    expect(planCardBillReminders([{ ...mockCards[0], dueAmountMinor: 0 }], 0)).toEqual([]);
  });
});

describe('scheduleCardBillReminders', () => {
  it('cancels the old card-bill reminders (only those) and schedules the current ones', async () => {
    await scheduleCardBillReminders(new Date(2026, 9, 26).getTime());
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(1);
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('card-bill:old');
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: 'card-bill:card',
        content: expect.objectContaining({ data: { kind: 'card-bill', accountId: 'card' } }),
        trigger: expect.objectContaining({ channelId: 'card-bills', date: new Date(2026, 10, 3, 10).getTime() }),
      }),
    );
  });

  it('setting off ⇒ cancels and schedules nothing', async () => {
    mockEnabled = false;
    await scheduleCardBillReminders(new Date(2026, 9, 26).getTime());
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('card-bill:old');
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('skips bank accounts', async () => {
    mockCards = [{ ...mockCards[0], kind: 'bank' }];
    await scheduleCardBillReminders(new Date(2026, 9, 26).getTime());
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});
