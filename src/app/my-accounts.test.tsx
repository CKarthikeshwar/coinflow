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
jest.mock('@/db/repositories/balances', () => ({ useAccountViews: () => mockViews, acknowledgeDiscrepancy: jest.fn() }));

const view = (a: MyAccount, balanceMinor: number | null, extra: Record<string, unknown> = {}) => ({
  account: a,
  balance: balanceMinor === null ? null : { balanceMinor, asOf: Date.now() - 3 * HOUR },
  stale: false,
  discrepancies: [],
  ...extra,
});

beforeEach(() => {
  mockAccounts = [];
  mockViews = [];
  useSheetRegistry.setState({ current: null, params: {}, onRequestClose: null });
});

it('empty: explains where accounts come from and offers Add account', async () => {
  const { getByText, getAllByText } = await render(<MyAccountsScreen />);
  expect(getByText('Accounts appear here as your bank texts arrive — or add one yourself.')).toBeTruthy();
  await fireEvent.press(getAllByText('Add account')[0]);
  expect(useSheetRegistry.getState().current).toBe('createAccount');
});

it('Total balance: bank + wallet + cash only; cards are credit available', async () => {
  const sbi = account('sbi', 'bank', 'SBI ··5678', { bankName: 'State Bank of India', last4: '5678' });
  const cash = account('cash', 'cash', 'Cash');
  const card = account('card', 'credit_card', 'HDFC card');
  mockAccounts = [sbi, card, cash];
  mockViews = [view(sbi, 12_000_00), view(card, 1_17_660_00), view(cash, 500_00)];
  const { getByText } = await render(<MyAccountsScreen />);
  expect(getByText('₹12,500')).toBeTruthy();
  expect(getByText('across 2 accounts · oldest figure 3h ago')).toBeTruthy();
  expect(getByText('Credit available ₹1,17,660')).toBeTruthy();
  expect(getByText('available · as of 3h ago')).toBeTruthy();
});

it('sections, a New pill, Needs a look pill, no-balance row, card bill line', async () => {
  const fresh = account('h', 'bank', 'HDFC ··672', { autoCreated: true });
  const card = account('c', 'credit_card', 'HDFC card', { dueAt: Date.now() + 5 * 24 * HOUR, dueAmountMinor: 14_200_00 });
  mockAccounts = [fresh, card];
  mockViews = [
    view(fresh, null, { discrepancies: [{ snapshotId: 's', fromAsOf: 0, toAsOf: 1, diffMinor: -1_200_00 }] }),
    view(card, null),
  ];
  const { getByText, getAllByText } = await render(<MyAccountsScreen />);
  expect(getByText('Bank accounts')).toBeTruthy();
  expect(getByText('Cards')).toBeTruthy();
  expect(getByText('New')).toBeTruthy();
  expect(getAllByText('Needs a look').length).toBeGreaterThanOrEqual(2); // the pill and the card
  expect(getAllByText('No balance yet')).toHaveLength(2);
  expect(getByText(/^Bill ₹14,200 due /)).toBeTruthy();
});

it('tapping a row edits that account; a section Add pre-sets the kind', async () => {
  const sbi = account('sbi', 'bank', 'SBI ··5678');
  mockAccounts = [sbi];
  mockViews = [view(sbi, null)];
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
  mockViews = [view(old, null), view(live, null)];
  const { getByText, queryByText } = await render(<MyAccountsScreen />);
  expect(queryByText('Old account')).toBeNull();
  await fireEvent.press(getByText('Show archived (1)'));
  expect(getByText('Old account')).toBeTruthy();
});
