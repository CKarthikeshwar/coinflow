import * as Notifications from 'expo-notifications';
import type { AccountRule, Suggestion } from '@/db/schema';
import { countPending } from '@/db/repositories/suggestions';

import { cancelForSuggestion, postForSuggestion, refreshGroupSummary, TXN_GROUP_IDENTIFIER } from './post';

jest.mock('@/db/repositories/suggestions', () => ({ countPending: jest.fn() }));
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn().mockResolvedValue('id'),
  dismissNotificationAsync: jest.fn().mockResolvedValue(undefined),
}));

const countPendingMock = countPending as jest.Mock;
const getPermissionsMock = Notifications.getPermissionsAsync as jest.Mock;
const scheduleMock = Notifications.scheduleNotificationAsync as jest.Mock;
const dismissMock = Notifications.dismissNotificationAsync as jest.Mock;

function suggestion(overrides: Partial<Suggestion> = {}): Suggestion {
  return {
    id: 'sug-1',
    amountMinor: 45000,
    direction: 'debit',
    occurredAt: 1_700_000_000_000,
    account: 'Swiggy',
    normalizedKey: 'swiggy',
    paymentMethod: 'upi',
    smsSender: 'AD-HDFCBK-S',
    smsReceivedAt: 1_700_000_000_000,
    dedupeKey: 'dedupe-1',
    status: 'pending',
    confirmedTransactionId: null,
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

const KNOWN_RULE: AccountRule = {
  normalizedKey: 'swiggy',
  displayAccount: 'Swiggy',
  lastNote: null,
  categoryId: 'cat-food',
  lastPaymentMethod: 'upi',
  hitCount: 1,
  createdAt: 0,
  updatedAt: 0,
};

beforeEach(() => {
  jest.clearAllMocks();
  getPermissionsMock.mockResolvedValue({ status: 'granted' });
  countPendingMock.mockReturnValue(1);
});

describe('§31.7 — permission off is silent', () => {
  it('postForSuggestion does nothing when permission is not granted', async () => {
    getPermissionsMock.mockResolvedValue({ status: 'denied' });
    await postForSuggestion(suggestion(), KNOWN_RULE);
    expect(scheduleMock).not.toHaveBeenCalled();
  });

  it('refreshGroupSummary does nothing when permission is not granted', async () => {
    getPermissionsMock.mockResolvedValue({ status: 'denied' });
    countPendingMock.mockReturnValue(3);
    await refreshGroupSummary();
    expect(scheduleMock).not.toHaveBeenCalled();
    expect(dismissMock).not.toHaveBeenCalled();
  });
});

describe('postForSuggestion', () => {
  it('always posts the individual notification, identified sug:<id>', async () => {
    await postForSuggestion(suggestion({ id: 'abc' }), KNOWN_RULE);
    expect(scheduleMock).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: 'sug:abc' }),
    );
  });
});

describe('refreshGroupSummary (§31.4)', () => {
  it('dismisses the group summary when 0 pending', async () => {
    countPendingMock.mockReturnValue(0);
    await refreshGroupSummary();
    expect(dismissMock).toHaveBeenCalledWith(TXN_GROUP_IDENTIFIER);
    expect(scheduleMock).not.toHaveBeenCalled();
  });

  it('dismisses the group summary when exactly 1 pending (no group needed)', async () => {
    countPendingMock.mockReturnValue(1);
    await refreshGroupSummary();
    expect(dismissMock).toHaveBeenCalledWith(TXN_GROUP_IDENTIFIER);
    expect(scheduleMock).not.toHaveBeenCalled();
  });

  it('posts/replaces the group summary with the count in the title when 2+ pending', async () => {
    countPendingMock.mockReturnValue(5);
    await refreshGroupSummary();
    expect(scheduleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: TXN_GROUP_IDENTIFIER,
        content: expect.objectContaining({ title: '5 transactions to review' }),
      }),
    );
  });
});

describe('cancelForSuggestion', () => {
  it('dismisses that notification and recounts the summary', async () => {
    countPendingMock.mockReturnValue(0);
    await cancelForSuggestion('sug-1');
    expect(dismissMock).toHaveBeenCalledWith('sug:sug-1');
    expect(dismissMock).toHaveBeenCalledWith(TXN_GROUP_IDENTIFIER);
  });
});
