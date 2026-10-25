import { render } from '@testing-library/react-native';

import type { AccountRule, Category } from '@/db/schema';

import { AccountRuleRow } from './account-rule-row';

const rule: AccountRule = {
  normalizedKey: 'employer', displayAccount: 'Employer', lastNote: null, categoryId: null, incomeCategoryId: 'cat-salary',
  lastPaymentMethod: null, hitCount: 3, createdAt: 0, updatedAt: 0,
};
const cat = (id: string, name: string, appliesTo: 'expense' | 'income'): Category => ({
  id, key: null, name, icon: 'shapes', kind: 'custom', appliesTo, isProtected: false, order: 1, createdAt: 0, updatedAt: 0,
});

describe('AccountRuleRow (CR-28)', () => {
  it('shows a second chip for the remembered income category', async () => {
    const { getByText } = await render(
      <AccountRuleRow rule={rule} category={undefined} incomeCategory={cat('cat-salary', 'Salary', 'income')} onPress={jest.fn()} onDeletePress={jest.fn()} />,
    );
    expect(getByText('Uncategorized')).toBeTruthy(); // no expense category remembered
    expect(getByText('Salary')).toBeTruthy();
  });

  it('shows no income chip when the account has no income category', async () => {
    const { queryByText } = await render(
      <AccountRuleRow rule={{ ...rule, incomeCategoryId: null }} category={cat('c', 'Food', 'expense')} onPress={jest.fn()} onDeletePress={jest.fn()} />,
    );
    expect(queryByText('Salary')).toBeNull();
  });
});
