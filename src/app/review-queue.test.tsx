import { fireEvent, render } from '@testing-library/react-native';

import type { Suggestion } from '@/db/schema';

import ReviewQueueScreen from './review-queue';

const mockRouterBack = jest.fn();
const mockGetAccountRule = jest.fn((..._args: unknown[]) => null as unknown);
const mockGetSetting = jest.fn((..._args: unknown[]) => null as unknown);
const mockSetSetting = jest.fn();
const mockDismissAllPending = jest.fn();
const mockCancelAllSuggestionNotifications = jest.fn(async (..._args: unknown[]) => {});
const mockHandleDiscard = jest.fn((..._args: unknown[]) => undefined);
const mockHandleSave = jest.fn((..._args: unknown[]) => undefined);
const mockGetSmsPermissions = jest.fn(async (..._args: unknown[]) => ({ granted: true, canAskAgain: true }));
const mockRequestSmsPermissions = jest.fn(async (..._args: unknown[]) => ({ granted: true, canAskAgain: true }));

let mockPendingData: { data: Suggestion[] | undefined; updatedAt: number | undefined };

jest.mock('expo-router', () => ({ router: { back: (...args: unknown[]) => mockRouterBack(...args) } }));
jest.mock('@/db/repositories/account-rules', () => ({ getAccountRule: (...args: unknown[]) => mockGetAccountRule(...args) }));
jest.mock('@/db/repositories/settings', () => ({
  getSetting: (...args: unknown[]) => mockGetSetting(...args),
  setSetting: (...args: unknown[]) => mockSetSetting(...args),
}));
jest.mock('@/db/repositories/suggestions', () => ({
  dismissAllPending: (...args: unknown[]) => mockDismissAllPending(...args),
  usePendingSuggestions: () => mockPendingData,
}));
jest.mock('@/services/notifications/post', () => ({
  cancelAllSuggestionNotifications: (...args: unknown[]) => mockCancelAllSuggestionNotifications(...args),
}));
jest.mock('@/services/notifications/respond', () => ({
  handleDiscard: (...args: unknown[]) => mockHandleDiscard(...args),
  handleSave: (...args: unknown[]) => mockHandleSave(...args),
}));
jest.mock('@/services/sms', () => ({
  getSmsPermissions: (...args: unknown[]) => mockGetSmsPermissions(...args),
  requestSmsPermissions: (...args: unknown[]) => mockRequestSmsPermissions(...args),
}));

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
    smsReceivedAt: Date.now() - 5 * 60_000,
    dedupeKey: 'dedupe-1',
    status: 'pending',
    confirmedTransactionId: null,
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

beforeEach(() => {
  mockRouterBack.mockReset();
  mockGetAccountRule.mockReset().mockReturnValue(null);
  mockGetSetting.mockReset().mockReturnValue(null);
  mockSetSetting.mockReset();
  mockDismissAllPending.mockReset();
  mockCancelAllSuggestionNotifications.mockReset().mockResolvedValue(undefined);
  mockHandleDiscard.mockReset();
  mockHandleSave.mockReset();
  mockGetSmsPermissions.mockReset().mockResolvedValue({ granted: true, canAskAgain: true });
  mockRequestSmsPermissions.mockReset().mockResolvedValue({ granted: true, canAskAgain: true });
  mockPendingData = { data: undefined, updatedAt: undefined };
});

describe('loading', () => {
  it('shows neither the empty state nor any row while updatedAt is undefined', async () => {
    mockPendingData = { data: undefined, updatedAt: undefined };
    const { queryByText } = await render(<ReviewQueueScreen />);
    expect(queryByText(/all caught up/)).toBeNull();
  });
});

describe('empty', () => {
  it('shows "You\'re all caught up" — not an error state — with no data', async () => {
    mockPendingData = { data: [], updatedAt: Date.now() };
    const { getByText, queryByText } = await render(<ReviewQueueScreen />);
    expect(getByText(/all caught up/)).toBeTruthy();
    expect(queryByText(/couldn't load/i)).toBeNull();
  });
});

describe('rows', () => {
  it('shows inline Save for a known-account row, not for a new one', async () => {
    mockGetAccountRule.mockImplementation((key: unknown) => (key === 'swiggy' ? { categoryId: 'cat-food' } : null));
    mockPendingData = {
      data: [suggestion({ id: 'sug-known', normalizedKey: 'swiggy' }), suggestion({ id: 'sug-new', normalizedKey: 'zomato', account: 'Zomato' })],
      updatedAt: Date.now(),
    };
    const { getAllByText } = await render(<ReviewQueueScreen />);
    // One Save button total — only the known row gets it.
    expect(getAllByText('Save')).toHaveLength(1);
  });

  it('Dismiss all shows a confirm naming the pending count, then clears the queue', async () => {
    mockPendingData = { data: [suggestion(), suggestion({ id: 'sug-2' })], updatedAt: Date.now() };
    const { getByText, getAllByText } = await render(<ReviewQueueScreen />);
    await fireEvent.press(getByText('Dismiss all'));
    expect(getByText('2 pending transactions will be removed.')).toBeTruthy();
    // Two "Dismiss all" texts once the dialog is up: the footer button and the dialog's own
    // confirm button — the confirm button is the second one in render order.
    const dismissTexts = getAllByText('Dismiss all');
    await fireEvent.press(dismissTexts[dismissTexts.length - 1]);
    expect(mockDismissAllPending).toHaveBeenCalled();
  });
});

describe('permission banner', () => {
  it('shows when SMS permission is denied, not when granted', async () => {
    mockGetSmsPermissions.mockResolvedValue({ granted: false, canAskAgain: true });
    mockPendingData = { data: [], updatedAt: Date.now() };
    const { findByText } = await render(<ReviewQueueScreen />);
    expect(await findByText(/SMS permission is off/)).toBeTruthy();
  });

  it('stays hidden once granted', async () => {
    mockGetSmsPermissions.mockResolvedValue({ granted: true, canAskAgain: true });
    mockPendingData = { data: [], updatedAt: Date.now() };
    const { findByText, queryByText } = await render(<ReviewQueueScreen />);
    await findByText(/all caught up/);
    expect(queryByText(/SMS permission is off/)).toBeNull();
  });
});
