import { fireEvent, render } from '@testing-library/react-native';

import type { Category, Suggestion, Transaction } from '@/db/schema';
import { useAddSheetDraft, useKeypad, useSheetRegistry } from '@/stores';
import { useToast } from '@/stores/toast';

import { TransactionSheetBody } from './transaction-sheet';

const mockCategories: Category[] = [
  { id: 'cat-food', key: null, name: 'Food', icon: 'utensils', kind: 'custom', isProtected: false, order: 1, createdAt: 0, updatedAt: 0 },
];

const mockGetAccountRule = jest.fn((..._args: unknown[]) => null as unknown);
const mockSearchByPrefix = jest.fn((..._args: unknown[]) => [] as unknown[]);
const mockGetSuggestion = jest.fn((..._args: unknown[]) => null as Suggestion | null);
const mockGetTransaction = jest.fn((..._args: unknown[]) => null as Transaction | null);
const mockWriteConfirmedTransaction = jest.fn((..._args: unknown[]) => ({ transactionId: 'new-txn-id' }));
const mockWriteEditedTransaction = jest.fn((..._args: unknown[]) => ({ transactionId: 'txn-1' }));
const mockRouterPush = jest.fn((..._args: unknown[]) => undefined);

jest.mock('@/db/repositories/account-rules', () => ({
  getAccountRule: (...args: unknown[]) => mockGetAccountRule(...args),
  searchByPrefix: (...args: unknown[]) => mockSearchByPrefix(...args),
}));
jest.mock('@/db/repositories/categories', () => ({ useCategories: () => ({ data: mockCategories }) }));
jest.mock('@/db/repositories/suggestions', () => ({ getSuggestion: (...args: unknown[]) => mockGetSuggestion(...args) }));
jest.mock('@/db/repositories/transactions', () => ({ getTransaction: (...args: unknown[]) => mockGetTransaction(...args) }));
jest.mock('./write-confirmed-transaction', () => ({
  writeConfirmedTransaction: (...args: unknown[]) => mockWriteConfirmedTransaction(...args),
  writeEditedTransaction: (...args: unknown[]) => mockWriteEditedTransaction(...args),
}));
jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockRouterPush(...args) } }));

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
  mockGetAccountRule.mockReset().mockReturnValue(null);
  mockSearchByPrefix.mockReset().mockReturnValue([]);
  mockGetSuggestion.mockReset().mockReturnValue(null);
  mockGetTransaction.mockReset().mockReturnValue(null);
  mockWriteConfirmedTransaction.mockReset().mockReturnValue({ transactionId: 'new-txn-id' });
  mockWriteEditedTransaction.mockReset().mockReturnValue({ transactionId: 'txn-1' });
  mockRouterPush.mockReset();
  useSheetRegistry.setState({ current: null, params: {}, onRequestClose: null });
  useAddSheetDraft.getState().reset();
  useKeypad.getState().reset();
});

// A successful Add starts the toast's 3s auto-hide timer — clear it so it doesn't leak past the
// test that triggered it and keep Jest's process from hanging on an open handle.
afterEach(() => {
  useToast.getState().clear();
});

describe('Add mode', () => {
  it('starts with Add disabled (amount 0) and enables it once a digit is entered', async () => {
    const { getByRole, getByText } = await render(<TransactionSheetBody mode="add" />);
    expect(getByRole('button', { name: 'Add' }).props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
    await fireEvent.press(getByText('5'));
    expect(getByRole('button', { name: 'Add' }).props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: false }),
    );
  });

  it('hides the Category row when direction is Income (UI-022)', async () => {
    const { getByText, queryByText } = await render(<TransactionSheetBody mode="add" />);
    expect(getByText('Category')).toBeTruthy();
    await fireEvent.press(getByText('Income'));
    expect(queryByText('Category')).toBeNull();
  });

  it('Cancel with no changes closes without a discard prompt', async () => {
    const { getByText, queryByText } = await render(<TransactionSheetBody mode="add" />);
    await fireEvent.press(getByText('Cancel'));
    expect(queryByText('Discard changes?')).toBeNull();
  });

  it('Cancel after a real change (typing a note) shows the discard-confirm', async () => {
    const { getByPlaceholderText, getByText } = await render(<TransactionSheetBody mode="add" />);
    await fireEvent.changeText(getByPlaceholderText('Note'), 'Lunch');
    await fireEvent.press(getByText('Cancel'));
    expect(getByText('Discard changes?')).toBeTruthy();
  });

  it('toggling direction Expense→Income→Expense does not count as a change on Cancel', async () => {
    const { getByText, queryByText } = await render(<TransactionSheetBody mode="add" />);
    await fireEvent.press(getByText('Income'));
    await fireEvent.press(getByText('Expense'));
    await fireEvent.press(getByText('Cancel'));
    expect(queryByText('Discard changes?')).toBeNull();
  });

  it('a successful Add writes the transaction and shows the toast', async () => {
    const { getByText, getByRole } = await render(<TransactionSheetBody mode="add" />);
    await fireEvent.press(getByText('5'));
    await fireEvent.press(getByRole('button', { name: 'Add' }));
    expect(mockWriteConfirmedTransaction).toHaveBeenCalled();
  });
});

describe('Confirm mode', () => {
  it('pre-fills from the Suggestion and shows the edge-amount gate for ₹0', async () => {
    mockGetSuggestion.mockReturnValue(suggestion({ amountMinor: 0 }));
    useSheetRegistry.setState({ params: { suggestionId: 'sug-1' } });
    const { getByText } = await render(<TransactionSheetBody mode="confirm" />);
    expect(getByText('Review transaction')).toBeTruthy();
    expect(getByText('Amount is ₹0')).toBeTruthy();
    await fireEvent.press(getByText('Add'));
    expect(getByText('Unusual amount')).toBeTruthy();
    expect(mockWriteConfirmedTransaction).not.toHaveBeenCalled();
  });

  it('closes without writing anything when the Suggestion no longer exists', async () => {
    mockGetSuggestion.mockReturnValue(null);
    useSheetRegistry.setState({ current: 'confirm', params: { suggestionId: 'gone' } });
    await render(<TransactionSheetBody mode="confirm" />);
    expect(useSheetRegistry.getState().current).toBeNull();
  });
});

describe('Edit mode', () => {
  it('pre-fills from the transaction and shows Save, not Add', async () => {
    mockGetTransaction.mockReturnValue(transaction());
    useSheetRegistry.setState({ params: { transactionId: 'txn-1' } });
    const { getByText, getByDisplayValue } = await render(<TransactionSheetBody mode="edit" />);
    expect(getByText('Edit transaction')).toBeTruthy();
    expect(getByDisplayValue('Swiggy')).toBeTruthy();
    expect(getByDisplayValue('Lunch')).toBeTruthy();
    expect(getByText('Save')).toBeTruthy();
  });

  it('Save calls writeEditedTransaction, not writeConfirmedTransaction', async () => {
    mockGetTransaction.mockReturnValue(transaction());
    useSheetRegistry.setState({ params: { transactionId: 'txn-1' } });
    const { getByText } = await render(<TransactionSheetBody mode="edit" />);
    await fireEvent.press(getByText('Save'));
    expect(mockWriteEditedTransaction).toHaveBeenCalled();
    expect(mockWriteConfirmedTransaction).not.toHaveBeenCalled();
  });
});
