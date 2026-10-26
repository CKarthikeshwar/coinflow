import { render } from '@testing-library/react-native';

import type { Category, Transaction } from '@/db/schema';

import { TransactionCard } from './transaction-card';

function txn(over: Partial<Transaction> = {}): Transaction {
  return {
    id: 't1', amountMinor: 120_000, direction: 'debit', type: 'expense', categoryId: null, paymentMethod: 'upi', account: 'Barbeque Nation',
    normalizedAccountKey: null, note: 'Dinner', description: null, searchText: '', occurredAt: 1_700_000_000_000, createdAt: 1, updatedAt: 1,
    deletedAt: null, source: 'manual', smsSender: null, smsReceivedAt: null, dedupeKey: null, editedByUser: false, accountId: null, transferPeerId: null, ...over,
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

describe('income categories (CR-28)', () => {
  const salary: Category = {
    id: 'cat-salary', key: 'salary', name: 'Salary', icon: 'briefcase', kind: 'default', appliesTo: 'income',
    isProtected: false, order: 10, createdAt: 0, updatedAt: 0,
  };
  const income = (over: Partial<Transaction> = {}) => txn({ direction: 'credit', type: 'income', ...over });

  it('an income with a category shows the category name instead of the fixed word "Income"', async () => {
    const { getByText, queryByText } = await render(
      <TransactionCard txn={income({ categoryId: 'cat-salary' })} category={salary} onPress={() => undefined} />,
    );
    expect(getByText('Salary')).toBeTruthy();
    expect(queryByText('Income')).toBeNull();
  });

  it('an income without a category reads Uncategorized', async () => {
    const { getByText } = await render(<TransactionCard txn={income()} category={null} onPress={() => undefined} />);
    expect(getByText('Uncategorized')).toBeTruthy();
  });
});

describe('TransactionCard — accounts and transfers (CR-34)', () => {
  it('adds the account to the meta line', async () => {
    const { getByText } = await render(
      <TransactionCard txn={txn()} category={null} accountLabel="HDFC ··672" onPress={() => undefined} />,
    );
    expect(getByText('Uncategorized · HDFC ··672')).toBeTruthy();
  });

  it('a transfer reads From → To, neutral, never Uncategorized', async () => {
    const { getByText, queryByText } = await render(
      <TransactionCard
        txn={txn({ type: 'transfer', amountMinor: 1_000_000, note: null })}
        category={null}
        transferLabel="SBI ··1234 → HDFC ··672"
        onPress={() => undefined}
      />,
    );
    expect(getByText('SBI ··1234 → HDFC ··672')).toBeTruthy();
    expect(getByText('Transfer')).toBeTruthy();
    expect(getByText('₹10,000')).toBeTruthy();
    expect(queryByText(/Uncategorized/)).toBeNull();
    expect(queryByText(/−/)).toBeNull();
  });
});
