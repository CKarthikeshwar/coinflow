import { fireEvent, render } from '@testing-library/react-native';

import type { Category, Transaction } from '@/db/schema';
import { useSheetRegistry } from '@/stores';

import TransactionsScreen from './transactions';

const mockRouterBack = jest.fn();
const mockRouterPush = jest.fn();
const mockRouterSetParams = jest.fn();
let mockSearchParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  router: {
    back: (...args: unknown[]) => mockRouterBack(...args),
    push: (...args: unknown[]) => mockRouterPush(...args),
    setParams: (...args: unknown[]) => mockRouterSetParams(...args),
  },
  useLocalSearchParams: () => mockSearchParams,
}));

const mockCategories: Category[] = [
  { id: 'cat-food', key: null, name: 'Food', icon: 'utensils', kind: 'custom', isProtected: false, order: 1, createdAt: 0, updatedAt: 0 },
];

let mockListResult: { rows: Transaction[]; daySubtotals: { dayStartMs: number; spentMinor: number }[]; updatedAt: number | undefined };

jest.mock('@/db/repositories/categories', () => ({
  getCategoryMap: () => new Map(mockCategories.map((c) => [c.id, c])),
  useCategories: () => ({ data: mockCategories }),
}));
jest.mock('@/db/repositories/transactions', () => ({ useTransactionList: (..._args: unknown[]) => mockListResult }));

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

beforeEach(() => {
  mockRouterBack.mockReset();
  mockRouterPush.mockReset();
  mockRouterSetParams.mockReset();
  mockSearchParams = {};
  useSheetRegistry.setState({ current: null, params: {}, onRequestClose: null });
  mockListResult = { rows: [], daySubtotals: [], updatedAt: undefined };
});

it('shows the skeleton while loading, no empty state yet', async () => {
  mockListResult = { rows: [], daySubtotals: [], updatedAt: undefined };
  const { queryByText } = await render(<TransactionsScreen />);
  expect(queryByText('No transactions yet.')).toBeNull();
  expect(queryByText('No transactions match.')).toBeNull();
});

it('no-data empty state offers Add transaction (no search/filter active)', async () => {
  mockListResult = { rows: [], daySubtotals: [], updatedAt: Date.now() };
  const { getByText } = await render(<TransactionsScreen />);
  expect(getByText('No transactions yet.')).toBeTruthy();
  await fireEvent.press(getByText('Add transaction'));
  expect(useSheetRegistry.getState().current).toBe('add');
});

it('no-match empty state (search active) is visually distinct from no-data', async () => {
  mockListResult = { rows: [], daySubtotals: [], updatedAt: Date.now() };
  const { getByPlaceholderText, getByText, queryByText } = await render(<TransactionsScreen />);
  await fireEvent.changeText(getByPlaceholderText('Search note, description, account'), 'zzz');
  expect(getByText('No transactions match.')).toBeTruthy();
  expect(queryByText('No transactions yet.')).toBeNull();
  expect(getByText('Clear filters')).toBeTruthy();
});

it('renders rows grouped under a day header and navigates to Details on tap', async () => {
  mockListResult = {
    rows: [transaction()],
    daySubtotals: [{ dayStartMs: 1_699_999_200_000, spentMinor: 45000 }],
    updatedAt: Date.now(),
  };
  const { getByText } = await render(<TransactionsScreen />);
  await fireEvent.press(getByText('Lunch'));
  expect(mockRouterPush).toHaveBeenCalledWith('/transaction/txn-1');
});

it('shows a removable chip for an active filter and clears just that filter on remove', async () => {
  mockSearchParams = { categoryIds: 'cat-food' };
  mockListResult = { rows: [], daySubtotals: [], updatedAt: Date.now() };
  const { getByText, getByLabelText } = await render(<TransactionsScreen />);
  expect(getByText('Food')).toBeTruthy();
  await fireEvent.press(getByLabelText('Remove Food'));
  expect(mockRouterSetParams).toHaveBeenCalledWith({ categoryIds: '' });
});

it('the Filter button opens the filter sheet seeded with the currently-applied filter', async () => {
  mockSearchParams = { type: 'income' };
  mockListResult = { rows: [], daySubtotals: [], updatedAt: Date.now() };
  const { getByLabelText } = await render(<TransactionsScreen />);
  await fireEvent.press(getByLabelText('Filter'));
  expect(useSheetRegistry.getState()).toEqual(
    expect.objectContaining({ current: 'filter', params: expect.objectContaining({ type: 'income' }) }),
  );
});
