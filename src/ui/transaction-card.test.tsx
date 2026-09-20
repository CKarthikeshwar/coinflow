import { render } from '@testing-library/react-native';

import type { Transaction } from '@/db/schema';

import { TransactionCard } from './transaction-card';

function txn(over: Partial<Transaction> = {}): Transaction {
  return {
    id: 't1', amountMinor: 120_000, direction: 'debit', type: 'expense', categoryId: null, paymentMethod: 'upi', account: 'Barbeque Nation',
    normalizedAccountKey: null, note: 'Dinner', description: null, searchText: '', occurredAt: 1_700_000_000_000, createdAt: 1, updatedAt: 1,
    deletedAt: null, source: 'manual', smsSender: null, smsReceivedAt: null, dedupeKey: null, editedByUser: false, ...over,
  };
}

describe('TransactionCard split badge (V2 — UI-075)', () => {
  it('shows nothing extra for an unshared transaction (V1 look unchanged)', async () => {
    const { queryByText, getByText } = await render(<TransactionCard txn={txn()} category={null} onPress={() => undefined} />);
    expect(getByText('Dinner')).toBeTruthy();
    expect(queryByText(/Split/)).toBeNull();
    expect(queryByText(/Your share/)).toBeNull();
  });

  it('shows "Split · 1 of 3 paid" and "Your share ₹300" while the headline stays the real amount', async () => {
    const { getByText } = await render(
      <TransactionCard txn={txn()} category={null} split={{ total: 3, paid: 1, yourMinor: 30_000 }} onPress={() => undefined} />,
    );
    expect(getByText('Split · 1 of 3 paid')).toBeTruthy();
    expect(getByText(/Your share ₹300/)).toBeTruthy();
    expect(getByText(/1,200/)).toBeTruthy(); // the real amount paid, signed as before
  });

  it('says "all paid" once everyone has', async () => {
    const { getByText } = await render(
      <TransactionCard txn={txn()} category={null} split={{ total: 2, paid: 2, yourMinor: 60_000 }} onPress={() => undefined} />,
    );
    expect(getByText('Split · all paid')).toBeTruthy();
  });
});
