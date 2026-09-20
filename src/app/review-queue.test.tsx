import { fireEvent, render } from '@testing-library/react-native';

import type { Suggestion } from '@/db/schema';

import ReviewQueueScreen from './review-queue';

const mockRouterBack = jest.fn();
const mockRouterPush = jest.fn();
const mockHandleSaveAll = jest.fn(async (..._args: unknown[]) => ({ saved: 2, skipped: 0 }));
let mockDefaultCategoryId: string | null;
let mockCategories: { id: string; name: string }[];
const mockGetAccountRule = jest.fn((..._args: unknown[]) => null as unknown);
const mockSetSetting = jest.fn();
const mockDismissAllPending = jest.fn();
const mockCancelAllSuggestionNotifications = jest.fn(async (..._args: unknown[]) => {});
const mockHandleDiscard = jest.fn((..._args: unknown[]) => undefined);
const mockHandleSave = jest.fn((..._args: unknown[]) => undefined);
const mockRequestSmsPermissions = jest.fn(async (..._args: unknown[]) => ({ granted: true, canAskAgain: true }));
const mockRefreshPermission = jest.fn();

let mockPendingData: { data: Suggestion[] | undefined; updatedAt: number | undefined };
// Mirrors `(tabs)/index.test.tsx`'s shape for the same shared hook (CR-5 — this screen swapped
// onto it from its own older inline SMS-only check).
let mockPermission: { sms: 'unknown' | 'granted' | 'denied' };
let mockSmsBannerValue: number | null;

jest.mock('expo-router', () => ({
  router: {
    back: (...args: unknown[]) => mockRouterBack(...args),
    push: (...args: unknown[]) => mockRouterPush(...args),
  },
}));
jest.mock('@/db/repositories/categories', () => ({
  useCategories: () => ({ data: mockCategories }),
  resolveDefaultCategory: (id: string | null, list: { id: string }[]) => list.find((c) => c.id === id) ?? null,
}));
jest.mock('@/db/repositories/account-rules', () => ({ getAccountRule: (...args: unknown[]) => mockGetAccountRule(...args) }));
jest.mock('@/db/repositories/settings', () => ({
  useSetting: (key: string) => ({ value: key === 'defaultCategoryId' ? mockDefaultCategoryId : mockSmsBannerValue }),
  setSetting: (...args: unknown[]) => mockSetSetting(...args),
}));
jest.mock('@/db/repositories/suggestions', () => ({
  dismissAllPending: (...args: unknown[]) => mockDismissAllPending(...args),
  usePendingSuggestions: () => mockPendingData,
}));
jest.mock('@/hooks/use-permission-status', () => ({
  usePermissionStatus: () => ({ ...mockPermission, refresh: mockRefreshPermission }),
}));
jest.mock('@/services/notifications/post', () => ({
  cancelAllSuggestionNotifications: (...args: unknown[]) => mockCancelAllSuggestionNotifications(...args),
}));
jest.mock('@/services/notifications/respond', () => ({
  handleDiscard: (...args: unknown[]) => mockHandleDiscard(...args),
  handleSave: (...args: unknown[]) => mockHandleSave(...args),
  handleSaveAll: (...args: unknown[]) => mockHandleSaveAll(...args),
}));
jest.mock('@/services/sms', () => ({
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
  mockRouterPush.mockReset();
  mockHandleSaveAll.mockReset().mockResolvedValue({ saved: 2, skipped: 0 });
  mockDefaultCategoryId = null;
  mockCategories = [{ id: 'cat-food', name: 'Food' }];
  mockGetAccountRule.mockReset().mockReturnValue(null);
  mockSetSetting.mockReset();
  mockDismissAllPending.mockReset();
  mockCancelAllSuggestionNotifications.mockReset().mockResolvedValue(undefined);
  mockHandleDiscard.mockReset();
  mockHandleSave.mockReset();
  mockRequestSmsPermissions.mockReset().mockResolvedValue({ granted: true, canAskAgain: true });
  mockRefreshPermission.mockReset();
  mockPendingData = { data: undefined, updatedAt: undefined };
  mockPermission = { sms: 'granted' };
  mockSmsBannerValue = null;
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

describe('Save all (CR-12)', () => {
  it('sends the user to pick a default when none is set', async () => {
    mockPendingData = { data: [suggestion()], updatedAt: Date.now() };
    const { getByText } = await render(<ReviewQueueScreen />);
    await fireEvent.press(getByText('Save all with default category'));
    expect(mockRouterPush).toHaveBeenCalledWith('/default-category');
    expect(mockHandleSaveAll).not.toHaveBeenCalled();
  });

  it('treats a default whose category was deleted as unset', async () => {
    mockDefaultCategoryId = 'cat-gone';
    mockPendingData = { data: [suggestion()], updatedAt: Date.now() };
    const { getByText } = await render(<ReviewQueueScreen />);
    await fireEvent.press(getByText('Save all with default category'));
    expect(mockRouterPush).toHaveBeenCalledWith('/default-category');
  });

  it('confirms with the count, then saves with the default category', async () => {
    mockDefaultCategoryId = 'cat-food';
    mockPendingData = { data: [suggestion(), suggestion({ id: 'sug-2' })], updatedAt: Date.now() };
    const { getByText, getAllByText } = await render(<ReviewQueueScreen />);
    await fireEvent.press(getByText('Save all as Food'));
    expect(getByText('Save 2 transactions?')).toBeTruthy();
    const saveTexts = getAllByText('Save all');
    await fireEvent.press(saveTexts[saveTexts.length - 1]);
    expect(mockHandleSaveAll).toHaveBeenCalledWith('cat-food');
  });
});

describe('permission banner', () => {
  it('shows when SMS permission is denied, not when granted', async () => {
    mockPermission = { sms: 'denied' };
    mockPendingData = { data: [], updatedAt: Date.now() };
    const { getByText } = await render(<ReviewQueueScreen />);
    expect(getByText(/Need SMS permission/)).toBeTruthy();
  });

  it('stays hidden once granted', async () => {
    mockPermission = { sms: 'granted' };
    mockPendingData = { data: [], updatedAt: Date.now() };
    const { findByText, queryByText } = await render(<ReviewQueueScreen />);
    await findByText(/all caught up/);
    expect(queryByText(/Need SMS permission/)).toBeNull();
  });

  it('stays hidden once dismissed, even while still denied', async () => {
    mockPermission = { sms: 'denied' };
    mockSmsBannerValue = Date.now();
    mockPendingData = { data: [], updatedAt: Date.now() };
    const { queryByText } = await render(<ReviewQueueScreen />);
    expect(queryByText(/Need SMS permission/)).toBeNull();
  });

  it('Enable re-requests and refreshes the shared permission status', async () => {
    mockPermission = { sms: 'denied' };
    mockPendingData = { data: [], updatedAt: Date.now() };
    const { getByText } = await render(<ReviewQueueScreen />);
    await fireEvent.press(getByText('Enable'));
    expect(mockRequestSmsPermissions).toHaveBeenCalled();
    expect(mockRefreshPermission).toHaveBeenCalled();
  });
});
