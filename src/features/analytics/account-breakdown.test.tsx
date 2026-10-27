import { fireEvent, render } from '@testing-library/react-native';

import type { MyAccount } from '@/db/schema';

import { AccountBreakdown } from './account-breakdown';

const THIN = ' ';

function account(overrides: Partial<MyAccount> = {}): MyAccount {
  return {
    id: 'a-bank',
    kind: 'bank',
    nickname: 'Canara ··672',
    bankName: null,
    bankKey: null,
    last4: '0672',
    matchKey: null,
    autoCreated: false,
    archivedAt: null,
    creditLimitMinor: null,
    dueAt: null,
    dueAmountMinor: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  } as MyAccount;
}

const accounts = [account(), account({ id: 'a-card', kind: 'credit_card', nickname: 'HDFC Card' })];
const totals = [
  { accountId: 'a-bank', spentMinor: 6458400, incomeMinor: 8389900 },
  { accountId: 'a-card', spentMinor: 1840000, incomeMinor: 0 },
  { accountId: null, spentMinor: 570000, incomeMinor: 0 },
];

it('draws nothing when there is only one account and no unlinked entries', async () => {
  const { toJSON } = await render(
    <AccountBreakdown accounts={[account()]} totals={[{ accountId: 'a-bank', spentMinor: 100, incomeMinor: 0 }]} selectedIds={[]} onSelect={jest.fn()} />,
  );
  expect(toJSON()).toBeNull();
});

it('one row per account, plus No account when there are unlinked entries, with spend and income', async () => {
  const { getByText } = await render(<AccountBreakdown accounts={accounts} totals={totals} selectedIds={[]} onSelect={jest.fn()} />);
  expect(getByText('Canara ··672')).toBeTruthy();
  expect(getByText('HDFC Card')).toBeTruthy();
  expect(getByText('No account')).toBeTruthy();
  expect(getByText(`−${THIN}₹64,584`)).toBeTruthy();
  expect(getByText(`+${THIN}₹83,899`)).toBeTruthy();
  expect(getByText('Credit card')).toBeTruthy();
});

it('an account with no activity at all still has a row, at zero', async () => {
  const { getByText } = await render(
    <AccountBreakdown accounts={accounts} totals={[{ accountId: 'a-bank', spentMinor: 500, incomeMinor: 0 }]} selectedIds={[]} onSelect={jest.fn()} />,
  );
  expect(getByText('HDFC Card')).toBeTruthy();
});

it('an archived account shows only if it has activity in the period', async () => {
  const archived = account({ id: 'a-old', nickname: 'Old account', archivedAt: 5 });
  const { queryByText, rerender } = await render(
    <AccountBreakdown accounts={[...accounts, archived]} totals={totals} selectedIds={[]} onSelect={jest.fn()} />,
  );
  expect(queryByText('Old account')).toBeNull();
  await rerender(
    <AccountBreakdown accounts={[...accounts, archived]} totals={[...totals, { accountId: 'a-old', spentMinor: 100, incomeMinor: 0 }]} selectedIds={[]} onSelect={jest.fn()} />,
  );
  expect(queryByText('Old account')).toBeTruthy();
});

it('while filtered, the chosen account is "Selected" and the others read "Not in this view" with dashes', async () => {
  const { getByText, getAllByText } = await render(
    <AccountBreakdown accounts={accounts} totals={totals} selectedIds={['a-bank']} onSelect={jest.fn()} />,
  );
  expect(getByText('Selected')).toBeTruthy();
  expect(getAllByText('Not in this view')).toHaveLength(2);
  expect(getAllByText('—').length).toBeGreaterThanOrEqual(4);
});

it('tapping a row selects that account; the unlinked row uses the "none" id', async () => {
  const onSelect = jest.fn();
  const { getByLabelText } = await render(<AccountBreakdown accounts={accounts} totals={totals} selectedIds={[]} onSelect={onSelect} />);
  await fireEvent.press(getByLabelText('HDFC Card'));
  expect(onSelect).toHaveBeenLastCalledWith('a-card');
  await fireEvent.press(getByLabelText('No account'));
  expect(onSelect).toHaveBeenLastCalledWith('none');
});
