import { fireEvent, render } from '@testing-library/react-native';

import type { Category, Transaction } from '@/db/schema';
import { useSheetRegistry } from '@/stores';
import { useUndo } from '@/stores/undo';

import TransactionDetailsScreen from './[id]';

const mockRouterBack = jest.fn();
jest.mock('expo-router', () => ({
  router: { back: (...args: unknown[]) => mockRouterBack(...args) },
  useLocalSearchParams: () => ({ id: 'txn-1' }),
}));

const mockCategories: Category[] = [
  { id: 'cat-food', key: null, name: 'Food', icon: 'utensils', kind: 'custom', isProtected: false, order: 1, createdAt: 0, updatedAt: 0 },
];
const mockSoftDeleteTransaction = jest.fn();
let mockTxnData: Transaction[] | undefined;

jest.mock('@/db/repositories/categories', () => ({ getCategoryMap: () => new Map(mockCategories.map((c) => [c.id, c])) }));
jest.mock('@/db/repositories/transactions', () => ({
  softDeleteTransaction: (...args: unknown[]) => mockSoftDeleteTransaction(...args),
  useTransaction: () => ({ data: mockTxnData }),
}));

function transaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'txn-1',
    amountMinor: 45000,
    direction: 'debit',
    type: 'expense',
    categoryId: null,
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
  mockSoftDeleteTransaction.mockReset();
  useSheetRegistry.setState({ current: null, params: {}, onRequestClose: null });
  useUndo.getState().clear();
  mockTxnData = undefined;
});

// Delete starts the Undo snackbar's 5s auto-hide timer — clear it so it doesn't leak past the
// test that triggered it and keep Jest's process from hanging on an open handle.
afterEach(() => {
  useUndo.getState().clear();
});

it('renders just the bar (no crash) when the transaction is missing/loading', async () => {
  mockTxnData = undefined;
  const { getByText, queryByText } = await render(<TransactionDetailsScreen />);
  expect(getByText('Transaction')).toBeTruthy();
  expect(queryByText('Edit')).toBeNull();
});

it('an Uncategorized expense shows "Set category", which opens the Edit sheet', async () => {
  mockTxnData = [transaction({ categoryId: null })];
  const { getByText } = await render(<TransactionDetailsScreen />);
  await fireEvent.press(getByText('Set category'));
  expect(useSheetRegistry.getState()).toEqual(
    expect.objectContaining({ current: 'edit', params: { transactionId: 'txn-1' } }),
  );
});

it('a categorized expense shows the category name, not "Set category"', async () => {
  mockTxnData = [transaction({ categoryId: 'cat-food' })];
  const { getByText, queryByText } = await render(<TransactionDetailsScreen />);
  expect(getByText('Food')).toBeTruthy();
  expect(queryByText('Set category')).toBeNull();
});

it('income never shows "Set category" even with no category', async () => {
  mockTxnData = [transaction({ direction: 'credit', type: 'income', categoryId: null })];
  const { queryByText, getAllByText } = await render(<TransactionDetailsScreen />);
  expect(queryByText('Set category')).toBeNull();
  expect(getAllByText('Income').length).toBeGreaterThan(0);
});

it('shows the "Detected automatically" provenance line only for an SMS-sourced transaction', async () => {
  mockTxnData = [transaction({ source: 'sms' })];
  const { getByText } = await render(<TransactionDetailsScreen />);
  expect(getByText(/Detected automatically/)).toBeTruthy();
});

it('does not show a provenance line for a manual transaction', async () => {
  mockTxnData = [transaction({ source: 'manual' })];
  const { queryByText } = await render(<TransactionDetailsScreen />);
  expect(queryByText(/Detected automatically/)).toBeNull();
});

it('the Edit button opens the Edit sheet for this transaction', async () => {
  mockTxnData = [transaction()];
  const { getByText } = await render(<TransactionDetailsScreen />);
  await fireEvent.press(getByText('Edit'));
  expect(useSheetRegistry.getState()).toEqual(
    expect.objectContaining({ current: 'edit', params: { transactionId: 'txn-1' } }),
  );
});

it('Delete asks for confirmation, then soft-deletes, goes back, and shows Undo', async () => {
  mockTxnData = [transaction()];
  const { getByLabelText, getByText } = await render(<TransactionDetailsScreen />);
  await fireEvent.press(getByLabelText('Delete'));
  expect(getByText('Delete transaction?')).toBeTruthy();
  await fireEvent.press(getByText('Delete', { exact: true }));
  expect(mockSoftDeleteTransaction).toHaveBeenCalledWith('txn-1');
  expect(mockRouterBack).toHaveBeenCalled();
  expect(useUndo.getState().transactionId).toBe('txn-1');
});
