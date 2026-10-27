import { fireEvent, render } from '@testing-library/react-native';

import type { MyAccount } from '@/db/schema';
import { useSheetRegistry } from '@/stores';

import MyAccountsScreen from './my-accounts';

const HOUR = 3_600_000;

function account(id: string, kind: MyAccount['kind'], nickname: string, extra: Partial<MyAccount> = {}): MyAccount {
  return {
    id, kind, nickname, bankName: null, bankKey: null, last4: null, matchKey: null, autoCreated: false, archivedAt: null,
    creditLimitMinor: null, dueAt: null, dueAmountMinor: null, createdAt: 0, updatedAt: 0, ...extra,
  };
}

let mockAccounts: MyAccount[] = [];
let mockViews: unknown[] = [];
jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('@/db/repositories/accounts', () => ({ useAccounts: () => ({ data: mockAccounts }) }));
let mockUnassigned = { balanceMinor: 0, count: 0 };
jest.mock('@/db/repositories/balances', () => ({ useAccountViews: () => mockViews, useUnassigned: () => mockUnassigned }));

const view = (a: MyAccount, balanceMinor: number) => ({ account: a, balanceMinor });

beforeEach(() => {
  mockAccounts = [];
  mockViews = [];
  mockUnassigned = { balanceMinor: 0, count: 0 };
  useSheetRegistry.setState({ current: null, params: {}, onRequestClose: null });
});

it('empty: explains where accounts come from and offers Add account', async () => {
  const { getByText, getAllByText } = await render(<MyAccountsScreen />);
  expect(getByText('Accounts appear here as your bank texts arrive — or add one yourself.')).toBeTruthy();
  await fireEvent.press(getAllByText('Add account')[0]);
  expect(useSheetRegistry.getState().current).toBe('createAccount');
});

it('Total balance: bank + wallet + cash only, "across N accounts", and nothing about how old a figure is (D50)', async () => {
  const sbi = account('sbi', 'bank', 'SBI ··5678', { bankName: 'State Bank of India', last4: '5678' });
  const cash = account('cash', 'cash', 'Cash');
  const card = account('card', 'credit_card', 'HDFC card');
  mockAccounts = [sbi, card, cash];
  mockViews = [view(sbi, 12_000_00), view(card, -1_17_660_00), view(cash, 500_00)];
  const { getByText, queryByText } = await render(<MyAccountsScreen />);
  expect(getByText('₹12,500')).toBeTruthy();
  expect(getByText('across 2 accounts')).toBeTruthy();
  expect(queryByText(/oldest figure/)).toBeNull();
  expect(queryByText(/as of/)).toBeNull();
  expect(queryByText(/Credit available/)).toBeNull();
});

it('a card row shows what is owed (or "in credit"), and is not in the total', async () => {
  const card = account('card', 'credit_card', 'HDFC card');
  const paid = account('paid', 'credit_card', 'Other card');
  const over = account('over', 'credit_card', 'Overpaid card');
  mockAccounts = [card, paid, over];
  mockViews = [view(card, -14_200_00), view(paid, 0), view(over, 300_00)];
  const { getByText } = await render(<MyAccountsScreen />);
  expect(getByText('₹14,200')).toBeTruthy();
  expect(getByText('owed')).toBeTruthy();
  expect(getByText('nothing owed')).toBeTruthy();
  expect(getByText('₹300')).toBeTruthy();
  expect(getByText('in credit')).toBeTruthy();
  expect(getByText('Add a bank account, wallet or cash to see your total here.')).toBeTruthy();
});

it('sections, a New pill, a ₹0 account (never "No balance yet"), card bill line, no Needs a look', async () => {
  const fresh = account('h', 'bank', 'HDFC ··672', { autoCreated: true });
  const card = account('c', 'credit_card', 'HDFC card', { dueAt: Date.now() + 5 * 24 * HOUR, dueAmountMinor: 14_200_00 });
  mockAccounts = [fresh, card];
  mockViews = [view(fresh, 0), view(card, -14_200_00)];
  const { getByText, queryByText } = await render(<MyAccountsScreen />);
  expect(getByText('Bank accounts')).toBeTruthy();
  expect(getByText('Cards')).toBeTruthy();
  expect(getByText('New')).toBeTruthy();
  expect(queryByText('No balance yet')).toBeNull();
  expect(queryByText('Needs a look')).toBeNull();
  expect(getByText(/^Bill ₹14,200 due /)).toBeTruthy();
});

it('tapping a row edits that account; a section Add pre-sets the kind', async () => {
  const sbi = account('sbi', 'bank', 'SBI ··5678');
  mockAccounts = [sbi];
  mockViews = [view(sbi, 0)];
  const { getByLabelText } = await render(<MyAccountsScreen />);
  await fireEvent.press(getByLabelText('SBI ··5678'));
  expect(useSheetRegistry.getState()).toMatchObject({ current: 'editAccount', params: { accountId: 'sbi' } });
  await fireEvent.press(getByLabelText('Add wallets'));
  expect(useSheetRegistry.getState()).toMatchObject({ current: 'createAccount', params: { kind: 'wallet' } });
});

it('archived accounts hide behind Show archived', async () => {
  const old = account('o', 'bank', 'Old account', { archivedAt: 1 });
  const live = account('l', 'bank', 'Live');
  mockAccounts = [old, live];
  mockViews = [view(old, 0), view(live, 0)];
  const { getByText, queryByText } = await render(<MyAccountsScreen />);
  expect(queryByText('Old account')).toBeNull();
  await fireEvent.press(getByText('Show archived (1)'));
  expect(getByText('Old account')).toBeTruthy();
});

describe('D51 (CR-42) — the total counts transactions with no account', () => {
  it('Total balance = accounts + the unassigned rows, with a No account row', async () => {
    const sbi = account('sbi', 'bank', 'Canara ··672');
    mockAccounts = [sbi];
    mockViews = [view(sbi, -777_660)];
    mockUnassigned = { balanceMinor: 962_370, count: 14 };
    const { getByText } = await render(<MyAccountsScreen />);
    expect(getByText('₹1,847.10')).toBeTruthy();
    expect(getByText('across 1 account + unassigned')).toBeTruthy();
    expect(getByText('No account')).toBeTruthy();
    expect(getByText('14 transactions not on any account')).toBeTruthy();
  });

  it('tapping No account opens the Move to account sheet', async () => {
    const sbi = account('sbi', 'bank', 'Canara ··672');
    mockAccounts = [sbi];
    mockViews = [view(sbi, 0)];
    mockUnassigned = { balanceMinor: 100, count: 1 };
    const { getByLabelText, getByText } = await render(<MyAccountsScreen />);
    expect(getByText('1 transaction not on any account')).toBeTruthy();
    await fireEvent.press(getByLabelText('No account'));
    expect(useSheetRegistry.getState().current).toBe('moveUnassigned');
  });

  it('no unassigned transactions means no No account row', async () => {
    const sbi = account('sbi', 'bank', 'Canara ··672');
    mockAccounts = [sbi];
    mockViews = [view(sbi, 100)];
    const { queryByText } = await render(<MyAccountsScreen />);
    expect(queryByText('No account')).toBeNull();
  });

  it('with no accounts at all, unassigned rows still give a total', async () => {
    mockUnassigned = { balanceMinor: -4_500, count: 3 };
    const { getByText } = await render(<MyAccountsScreen />);
    expect(getByText('not on any account')).toBeTruthy();
    expect(getByText('No account')).toBeTruthy();
  });
});
