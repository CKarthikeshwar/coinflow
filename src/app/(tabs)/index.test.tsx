import { fireEvent, render } from '@testing-library/react-native';

import type { Category, Transaction } from '@/db/schema';

import HomeScreen from './index';

const mockRouterPush = jest.fn();
const mockOpenSheet = jest.fn();
const mockSetSetting = jest.fn();
const mockRefreshPermission = jest.fn();

jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockRouterPush(...args) } }));

jest.mock('expo-router/js-tabs', () => ({ useBottomTabBarHeight: () => 0 }));

jest.mock('@/stores', () => ({ useSheetRegistry: (selector: (s: unknown) => unknown) => selector({ open: mockOpenSheet }) }));

jest.mock('@/hooks/use-permission-status', () => ({
  usePermissionStatus: () => mockPermission,
}));

jest.mock('@/services/sms', () => ({ requestSmsPermissions: jest.fn().mockResolvedValue({ granted: true }) }));
jest.mock('expo-notifications', () => ({ requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }) }));

const mockCategories: Category[] = [
  { id: 'cat-food', key: null, name: 'Food', icon: 'utensils', kind: 'custom', isProtected: false, order: 1, createdAt: 0, updatedAt: 0 },
];
jest.mock('@/db/repositories/categories', () => ({ getCategoryMap: () => new Map(mockCategories.map((c) => [c.id, c])) }));

jest.mock('@/db/repositories/settings', () => ({
  useSetting: (key: string) => mockSettings[key] ?? { value: undefined },
  setSetting: (...args: unknown[]) => mockSetSetting(...args),
}));

jest.mock('@/db/repositories/suggestions', () => ({ usePendingCount: () => mockPendingCount }));
jest.mock('@/db/repositories/transactions', () => ({ useRecentTransactions: () => mockRecent }));
jest.mock('@/db/repositories/analytics', () => ({
  useRunningBalance: () => mockBalance,
  usePeriodSummary: () => mockSummary,
  useMoMDeltas: () => mockDeltas,
  useUncategorizedCount: () => mockUncategorized,
}));

let mockPermission: { sms: 'unknown' | 'granted' | 'denied'; notifications: 'unknown' | 'granted' | 'denied'; refresh: () => void };
let mockSettings: Record<string, { value: number | null | undefined }>;
let mockPendingCount: { count: number };
let mockUncategorized: { count: number };
let mockRecent: { data: Transaction[]; error: Error | undefined; updatedAt: Date | undefined };
let mockBalance: { balanceMinor: number; error: Error | undefined; updatedAt: Date | undefined };
let mockSummary: { spentMinor: number; incomeMinor: number; error: Error | undefined; updatedAt: Date | undefined };
let mockDeltas: { spendingDeltaPct: number | null; incomeDeltaPct: number | null; error: Error | undefined; updatedAt: Date | undefined };

function transaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'txn-1',
    amountMinor: 45000,
    direction: 'debit',
    type: 'expense',
    categoryId: 'cat-food',
    paymentMethod: 'upi',
    account: 'Swiggy',
    normalizedAccountKey: 'swiggy',
    note: 'Lunch',
    description: null,
    searchText: '',
    occurredAt: 1_700_000_000_000,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    deletedAt: null,
    source: 'manual',
    smsSender: null,
    smsReceivedAt: null,
    dedupeKey: null,
    editedByUser: false,
    ...overrides,
  };
}

const loadedAt = new Date();

beforeEach(() => {
  mockRouterPush.mockReset();
  mockOpenSheet.mockReset();
  mockSetSetting.mockReset();
  mockRefreshPermission.mockReset();
  mockPermission = { sms: 'granted', notifications: 'granted', refresh: mockRefreshPermission };
  mockSettings = {};
  mockPendingCount = { count: 0 };
  mockUncategorized = { count: 0 };
  mockRecent = { data: [], error: undefined, updatedAt: undefined };
  mockBalance = { balanceMinor: 0, error: undefined, updatedAt: undefined };
  mockSummary = { spentMinor: 0, incomeMinor: 0, error: undefined, updatedAt: undefined };
  mockDeltas = { spendingDeltaPct: null, incomeDeltaPct: null, error: undefined, updatedAt: undefined };
});

describe('loading', () => {
  it('shows neither the empty state nor an error while the core queries are unresolved', async () => {
    const { queryByText } = await render(<HomeScreen />);
    expect(queryByText(/no transactions yet/i)).toBeNull();
    expect(queryByText(/couldn't load/i)).toBeNull();
  });
});

describe('error', () => {
  it("shows 'Couldn't load your data.' with a Try again action when a query fails", async () => {
    mockBalance = { balanceMinor: 0, error: new Error('boom'), updatedAt: undefined };
    const { getByText } = await render(<HomeScreen />);
    expect(getByText("Couldn't load your data.")).toBeTruthy();
    expect(getByText('Try again')).toBeTruthy();
  });
});

describe('empty (new user)', () => {
  beforeEach(() => {
    mockBalance = { balanceMinor: 0, error: undefined, updatedAt: loadedAt };
    mockSummary = { spentMinor: 0, incomeMinor: 0, error: undefined, updatedAt: loadedAt };
    mockRecent = { data: [], error: undefined, updatedAt: loadedAt };
  });

  it('shows the zero-state hero, no action strip, and an Add-transaction empty state', async () => {
    const { getByText, queryByText } = await render(<HomeScreen />);
    expect(getByText('₹0')).toBeTruthy();
    expect(getByText(/no transactions yet/i)).toBeTruthy();
    expect(queryByText('See all')).toBeNull();
  });

  it('tapping Add transaction opens the Add sheet', async () => {
    const { getByText } = await render(<HomeScreen />);
    await fireEvent.press(getByText('Add transaction'));
    expect(mockOpenSheet).toHaveBeenCalledWith('add', {});
  });
});

describe('loaded, with data', () => {
  beforeEach(() => {
    mockBalance = { balanceMinor: -50000, error: undefined, updatedAt: loadedAt };
    mockSummary = { spentMinor: 200000, incomeMinor: 150000, error: undefined, updatedAt: loadedAt };
    mockDeltas = { spendingDeltaPct: 0.12, incomeDeltaPct: null, error: undefined, updatedAt: loadedAt };
    mockPendingCount = { count: 3 };
    mockUncategorized = { count: 2 };
    mockRecent = { data: [transaction()], error: undefined, updatedAt: loadedAt };
  });

  it('shows a negative running balance with a leading "−"', async () => {
    const { getByText } = await render(<HomeScreen />);
    expect(getByText(/^−\s?₹500$/)).toBeTruthy();
  });

  it('shows the Spending tile delta and "No prior month" for Income (no comparison figure)', async () => {
    const { getByText } = await render(<HomeScreen />);
    expect(getByText(/\+12% vs last month/)).toBeTruthy();
    expect(getByText('No prior month')).toBeTruthy();
  });

  it('shows both action-strip rows with their counts, each navigating on press', async () => {
    const { getByText } = await render(<HomeScreen />);
    await fireEvent.press(getByText('3 to review'));
    expect(mockRouterPush).toHaveBeenCalledWith('/review-queue');
    await fireEvent.press(getByText('2 uncategorized'));
    expect(mockRouterPush).toHaveBeenCalledWith('/transactions?filter=uncategorized');
  });

  it('renders the recent transaction and navigates to its Details on tap', async () => {
    const { getByText } = await render(<HomeScreen />);
    await fireEvent.press(getByText('Lunch'));
    expect(mockRouterPush).toHaveBeenCalledWith('/transaction/txn-1');
  });

  it('"See all" navigates to Transactions', async () => {
    const { getByText } = await render(<HomeScreen />);
    await fireEvent.press(getByText('See all'));
    expect(mockRouterPush).toHaveBeenCalledWith('/transactions');
  });
});

describe('permission banner', () => {
  beforeEach(() => {
    mockBalance = { balanceMinor: 0, error: undefined, updatedAt: loadedAt };
    mockSummary = { spentMinor: 0, incomeMinor: 0, error: undefined, updatedAt: loadedAt };
    mockRecent = { data: [], error: undefined, updatedAt: loadedAt };
  });

  it('shows the SMS banner when SMS permission is denied', async () => {
    mockPermission = { sms: 'denied', notifications: 'granted', refresh: mockRefreshPermission };
    const { getByText } = await render(<HomeScreen />);
    expect(getByText(/SMS permission is off/)).toBeTruthy();
  });

  it('prefers the SMS banner over the notifications one when both are denied', async () => {
    mockPermission = { sms: 'denied', notifications: 'denied', refresh: mockRefreshPermission };
    const { getByText, queryByText } = await render(<HomeScreen />);
    expect(getByText(/SMS permission is off/)).toBeTruthy();
    expect(queryByText(/Notifications are off/)).toBeNull();
  });

  it('shows the notifications banner when only notifications are denied', async () => {
    mockPermission = { sms: 'granted', notifications: 'denied', refresh: mockRefreshPermission };
    const { getByText } = await render(<HomeScreen />);
    expect(getByText(/Notifications are off/)).toBeTruthy();
  });

  it('stays hidden once dismissed, even if still denied', async () => {
    mockPermission = { sms: 'denied', notifications: 'granted', refresh: mockRefreshPermission };
    mockSettings = { smsBannerDismissedAt: { value: 1_700_000_000_000 } };
    const { queryByText } = await render(<HomeScreen />);
    expect(queryByText(/SMS permission is off/)).toBeNull();
  });

  it('dismissing the banner persists the dismissal', async () => {
    mockPermission = { sms: 'denied', notifications: 'granted', refresh: mockRefreshPermission };
    const { getByLabelText } = await render(<HomeScreen />);
    await fireEvent.press(getByLabelText('Dismiss'));
    expect(mockSetSetting).toHaveBeenCalledWith('smsBannerDismissedAt', expect.any(Number));
  });
});
