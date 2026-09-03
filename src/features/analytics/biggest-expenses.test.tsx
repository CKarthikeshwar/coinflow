import { fireEvent, render } from '@testing-library/react-native';

import type { Transaction } from '@/db/schema';

import { BiggestExpenses } from './biggest-expenses';

const mockRouterPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockRouterPush(...args) } }));

function txn(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'txn-1',
    amountMinor: 45000,
    direction: 'debit',
    type: 'expense',
    categoryId: null,
    paymentMethod: 'upi',
    account: 'Swiggy',
    normalizedAccountKey: 'swiggy',
    note: 'Dinner',
    description: null,
    searchText: null,
    occurredAt: Date.now(),
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
    source: 'sms',
    smsSender: null,
    smsReceivedAt: null,
    dedupeKey: null,
    editedByUser: false,
    ...overrides,
  };
}

beforeEach(() => {
  mockRouterPush.mockReset();
});

it('shows the empty state when there are no rows', async () => {
  const { getByText } = await render(<BiggestExpenses rows={[]} categoryById={new Map()} />);
  expect(getByText('Nothing recorded for this period.')).toBeTruthy();
});

it('renders a row per transaction', async () => {
  const rows = [txn({ id: 'a', note: 'Dinner' }), txn({ id: 'b', note: 'Groceries' })];
  const { getByText } = await render(<BiggestExpenses rows={rows} categoryById={new Map()} />);
  expect(getByText('Dinner')).toBeTruthy();
  expect(getByText('Groceries')).toBeTruthy();
});

it('tapping a row navigates to that transaction\'s Details', async () => {
  const rows = [txn({ id: 'txn-42' })];
  const { getByText } = await render(<BiggestExpenses rows={rows} categoryById={new Map()} />);
  await fireEvent.press(getByText('Dinner'));
  expect(mockRouterPush).toHaveBeenCalledWith('/transaction/txn-42');
});
