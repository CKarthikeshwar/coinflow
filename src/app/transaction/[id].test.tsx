import { fireEvent, render } from '@testing-library/react-native';

import type { Category, Transaction } from '@/db/schema';
import { useSheetRegistry } from '@/stores';
import { useToast } from '@/stores/toast';
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
let mockSplit: unknown;
const mockRemoveSplit = jest.fn();
const mockWaiveShare = jest.fn();
const mockUnwaiveShare = jest.fn();

jest.mock('@/db/repositories/categories', () => ({ getCategoryMap: () => new Map(mockCategories.map((c) => [c.id, c])) }));
jest.mock('@/db/repositories/transactions', () => ({
  softDeleteTransaction: (...args: unknown[]) => mockSoftDeleteTransaction(...args),
  useTransaction: () => ({ data: mockTxnData }),
}));

let mockOverview: { owed: { items: unknown[] }[]; youOwe: unknown[] } = { owed: [], youOwe: [] };
let mockSettled: { lines: unknown[]; allocatedMinor: number } = { lines: [], allocatedMinor: 0 };
const mockUnsettle = jest.fn();
const mockSettleAndAnnounce = jest.fn();
jest.mock('@/db/repositories/split-hooks', () => ({
  useSplitForTransaction: () => mockSplit,
  useSplitsOverview: () => mockOverview,
  useSettlementsForTransaction: () => mockSettled,
}));
jest.mock('@/db/repositories/settlements', () => ({ unsettle: (...args: unknown[]) => mockUnsettle(...args) }));
jest.mock('@/features/splits/settle-and-announce', () => ({ settleAndAnnounce: (...args: unknown[]) => mockSettleAndAnnounce(...args) }));
let mockCanSend = false;
type FakeReport = { results: { shareId: string; personName: string; phone: string; state: string }[]; fallback: { shareId: string; personName: string; phone: string }[] };
const sentReport = (): FakeReport => ({ results: [{ shareId: 'sh-1', personName: 'Rahul Mehta', phone: '+91', state: 'sent' }], fallback: [] });
const mockSendRequests = jest.fn(async (..._a: unknown[]): Promise<FakeReport> => sentReport());
const mockSummarize = jest.fn((..._a: unknown[]): string | null => "Request sent to Rahul Mehta");
const mockOpenInSmsApp = jest.fn(async (..._a: unknown[]) => ({ shareId: 'sh-1', personName: 'Rahul Mehta', phone: '+91', state: 'opened_in_sms_app' }));
jest.mock('@/services/sms', () => ({ isSmsCaptureSupported: () => mockCanSend }));
jest.mock('@/services/splits/send-requests', () => ({
  sendRequests: (...a: unknown[]) => mockSendRequests(...a),
  openInSmsApp: (...a: unknown[]) => mockOpenInSmsApp(...a),
  summarizeReport: (...a: unknown[]) => mockSummarize(...a),
}));
jest.mock('@/db/repositories/splits', () => ({
  removeSplit: (...args: unknown[]) => mockRemoveSplit(...args),
  waiveShare: (...args: unknown[]) => mockWaiveShare(...args),
  unwaiveShare: (...args: unknown[]) => mockUnwaiveShare(...args),
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
  mockSplit = undefined;
  mockOverview = { owed: [], youOwe: [] };
  mockSettled = { lines: [], allocatedMinor: 0 };
  mockUnsettle.mockReset();
  mockSettleAndAnnounce.mockReset();
  mockCanSend = false;
  mockSendRequests.mockReset().mockResolvedValue(sentReport());
  mockSummarize.mockClear();
  mockOpenInSmsApp.mockReset().mockResolvedValue({ shareId: 'sh-1', personName: 'Rahul Mehta', phone: '+91', state: 'opened_in_sms_app' });
  mockRemoveSplit.mockReset();
  mockWaiveShare.mockReset();
  mockUnwaiveShare.mockReset();
  useToast.getState().clear();
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

describe('Split on Details (V2 — UI-070, UI-074)', () => {
  const share = (over: Record<string, unknown> = {}) => ({
    id: 'sh-1', personId: 'p-1', amountMinor: 30_000, waivedAt: null, requestState: 'not_sent', changedSinceRequested: false,
    settledMinor: 0, remainingMinor: 30_000, state: 'pending',
    person: { id: 'p-1', displayName: 'Rahul Mehta', phoneKey: '9845897555', phoneDisplay: '+919845897555', contactRef: null, source: 'manual' },
    ...over,
  });
  const view = (shares: unknown[], yourMinor = 30_000) => ({
    split: { id: 'sp-1', ref: 'ab2cd3', transactionId: 'txn-1' },
    transactionAmountMinor: 120_000, shares, yourMinor, effectiveMinor: yourMinor, state: 'open',
  });

  it('offers "Split…" on an unsplit debit and opens the Split sheet in direct mode', async () => {
    mockTxnData = [transaction({ amountMinor: 120_000 })];
    const { getByText } = await render(<TransactionDetailsScreen />);
    await fireEvent.press(getByText('Split…'));
    expect(useSheetRegistry.getState().current).toBe('split');
    expect(useSheetRegistry.getState().params).toEqual({ direct: true, transactionId: 'txn-1' });
  });

  it('does not offer "Split…" on a credit (CR-8)', async () => {
    mockTxnData = [transaction({ direction: 'credit', type: 'income' })];
    const { queryByText } = await render(<TransactionDetailsScreen />);
    expect(queryByText('Split…')).toBeNull();
  });

  it('shows your share, what is still owed, and the card with each person’s status', async () => {
    mockTxnData = [transaction({ amountMinor: 120_000 })];
    mockSplit = view([
      share(),
      share({ id: 'sh-2', personId: 'p-2', person: { ...share().person, id: 'p-2', displayName: 'Priya Nair' }, state: 'partial', settledMinor: 10_000, remainingMinor: 20_000 }),
      share({ id: 'sh-3', personId: 'p-3', person: { ...share().person, id: 'p-3', displayName: 'Amit Shah' }, state: 'settled', settledMinor: 30_000, remainingMinor: 0 }),
    ]);
    const { getByText, queryByText } = await render(<TransactionDetailsScreen />);
    expect(getByText(/Your share ₹300/)).toBeTruthy();
    expect(getByText(/₹500 still owed/)).toBeTruthy(); // 300 + 200 + 0
    expect(getByText('Split')).toBeTruthy();
    expect(getByText('1 of 3 paid')).toBeTruthy();
    expect(getByText('Rahul Mehta')).toBeTruthy();
    expect(getByText('Pending')).toBeTruthy();
    expect(getByText(/Partly paid/)).toBeTruthy();
    expect(getByText('Settled')).toBeTruthy();
    expect(queryByText('Split…')).toBeNull(); // already split → the card replaces the row
  });

  it('says "all settled" once nothing is owed', async () => {
    mockTxnData = [transaction()];
    mockSplit = view([share({ state: 'settled', settledMinor: 30_000, remainingMinor: 0 })]);
    const { getByText } = await render(<TransactionDetailsScreen />);
    expect(getByText(/all settled/)).toBeTruthy();
  });

  it('Edit split reopens the Split sheet in direct mode', async () => {
    mockTxnData = [transaction()];
    mockSplit = view([share()]);
    const { getByText } = await render(<TransactionDetailsScreen />);
    await fireEvent.press(getByText('Edit split'));
    expect(useSheetRegistry.getState().params).toEqual({ direct: true, transactionId: 'txn-1' });
  });

  it('Remove split asks first, then removes it', async () => {
    mockTxnData = [transaction()];
    mockSplit = view([share()]);
    const { getByText } = await render(<TransactionDetailsScreen />);
    await fireEvent.press(getByText('Remove split'));
    expect(getByText('Remove split?')).toBeTruthy();
    expect(mockRemoveSplit).not.toHaveBeenCalled();
    await fireEvent.press(getByText('Remove'));
    expect(mockRemoveSplit).toHaveBeenCalledWith('sp-1');
    expect(useToast.getState().message).toBe('Split removed');
  });

  it('a pending share can be waived, a waived one restored; a paid one offers neither', async () => {
    mockTxnData = [transaction()];
    mockSplit = view([share()]);
    const first = await render(<TransactionDetailsScreen />);
    await fireEvent.press(first.getByRole('button', { name: /Rahul Mehta/ }));
    await fireEvent.press(first.getByText(/Waive/));
    expect(mockWaiveShare).toHaveBeenCalledWith('sh-1');
    await first.unmount();

    mockSplit = view([share({ state: 'waived', waivedAt: 5, remainingMinor: 0 })]);
    const second = await render(<TransactionDetailsScreen />);
    await fireEvent.press(second.getByRole('button', { name: /Rahul Mehta/ }));
    await fireEvent.press(second.getByText(/Restore/));
    expect(mockUnwaiveShare).toHaveBeenCalledWith('sh-1');
    await second.unmount();

    mockSplit = view([share({ state: 'settled', settledMinor: 30_000, remainingMinor: 0 })]);
    const third = await render(<TransactionDetailsScreen />);
    await fireEvent.press(third.getByRole('button', { name: /Rahul Mehta/ }));
    expect(third.getByText('Already paid in full.')).toBeTruthy();
    expect(third.queryByText(/Waive/)).toBeNull();
  });
});

describe('V2 phase 4 — settling from Details (UI-074 / UI-077 / UI-078)', () => {
  const owedItem = (overrides: Record<string, unknown> = {}) => ({
    shareId: 'sh-1',
    personId: 'p-1',
    personName: 'Rahul Mehta',
    remainingMinor: 45_000,
    ...overrides,
  });
  const credit = (overrides: Partial<Transaction> = {}) =>
    transaction({ direction: 'credit', type: 'income', amountMinor: 45_000, account: 'RAHUL MEHTA', note: null, ...overrides });

  it('offers "Merge into a split…" on a credit while someone owes you, and opens the Merge sheet for it', async () => {
    mockTxnData = [credit()];
    mockOverview = { owed: [{ items: [owedItem()] }], youOwe: [] };
    const { getByText } = await render(<TransactionDetailsScreen />);
    await fireEvent.press(getByText('Merge into a split…'));
    expect(useSheetRegistry.getState().current).toBe('merge');
    expect(useSheetRegistry.getState().params).toEqual({ transactionId: 'txn-1' });
  });

  it('hides the merge row when nobody owes anything, or the payment is fully assigned', async () => {
    mockTxnData = [credit()];
    const first = await render(<TransactionDetailsScreen />);
    expect(first.queryByText('Merge into a split…')).toBeNull();
    await first.unmount();

    mockOverview = { owed: [{ items: [owedItem()] }], youOwe: [] };
    mockSettled = { lines: [], allocatedMinor: 45_000 };
    const second = await render(<TransactionDetailsScreen />);
    expect(second.queryByText('Merge into a split…')).toBeNull();
  });

  it('a debit offers to merge only when you owe a request', async () => {
    mockTxnData = [transaction()];
    mockOverview = { owed: [{ items: [owedItem()] }], youOwe: [] };
    const first = await render(<TransactionDetailsScreen />);
    expect(first.queryByText('Merge into a split…')).toBeNull();
    await first.unmount();

    mockOverview = { owed: [], youOwe: [{ id: 'rq-1' }] };
    const second = await render(<TransactionDetailsScreen />);
    expect(second.getByText('Merge into a split…')).toBeTruthy();
  });

  it('shows the suggestion when exactly one open share matches the amount and name, and Settle uses it', async () => {
    mockTxnData = [credit()];
    mockOverview = { owed: [{ items: [owedItem()] }], youOwe: [] };
    const { getByText } = await render(<TransactionDetailsScreen />);
    expect(getByText('Looks like Rahul Mehta paying ₹450')).toBeTruthy();
    await fireEvent.press(getByText('Settle'));
    expect(mockSettleAndAnnounce).toHaveBeenCalledWith(
      { transactionId: 'txn-1', picks: [{ shareId: 'sh-1' }] },
      'share',
      new Map([['sh-1', 'Rahul Mehta']]),
    );
  });

  it('"Not this" hides the suggestion', async () => {
    mockTxnData = [credit()];
    mockOverview = { owed: [{ items: [owedItem()] }], youOwe: [] };
    const { getByText, queryByText } = await render(<TransactionDetailsScreen />);
    await fireEvent.press(getByText('Not this'));
    expect(queryByText(/Looks like/)).toBeNull();
    expect(mockSettleAndAnnounce).not.toHaveBeenCalled();
  });

  it('no suggestion when the amount differs, or on a debit', async () => {
    mockTxnData = [credit({ amountMinor: 30_000 })];
    mockOverview = { owed: [{ items: [owedItem()] }], youOwe: [] };
    const first = await render(<TransactionDetailsScreen />);
    expect(first.queryByText(/Looks like/)).toBeNull();
    await first.unmount();

    mockTxnData = [transaction({ amountMinor: 45_000 })];
    const second = await render(<TransactionDetailsScreen />);
    expect(second.queryByText(/Looks like/)).toBeNull();
  });

  it('lists what the payment settled, with the unassigned remainder, and Remove deletes that settlement', async () => {
    mockTxnData = [credit({ amountMinor: 60_000 })];
    mockSettled = {
      allocatedMinor: 45_000,
      lines: [{ id: 'st-1', kind: 'share', counterpartName: 'Rahul Mehta', label: 'Dinner', amountMinor: 45_000 }],
    };
    const { getByText, getByRole } = await render(<TransactionDetailsScreen />);
    expect(getByText('Settlements')).toBeTruthy();
    expect(getByText('Rahul Mehta’s share')).toBeTruthy();
    expect(getByText(/₹150 of this payment isn’t assigned/)).toBeTruthy();
    await fireEvent.press(getByRole('button', { name: /Remove settlement with Rahul Mehta/ }));
    expect(mockUnsettle).toHaveBeenCalledWith(['st-1']);
    expect(useToast.getState().message).toBe('Settlement removed');
  });

  it('shows no Settlements section when nothing is settled', async () => {
    mockTxnData = [credit()];
    const { queryByText } = await render(<TransactionDetailsScreen />);
    expect(queryByText('Settlements')).toBeNull();
  });
});

describe('V2 phase 5 — sending a request from Details (§6.17)', () => {
  const share = (over: Record<string, unknown> = {}) => ({
    id: 'sh-1', personId: 'p-1', amountMinor: 30_000, waivedAt: null, requestState: 'not_sent', changedSinceRequested: false,
    settledMinor: 0, remainingMinor: 30_000, state: 'pending',
    person: { id: 'p-1', displayName: 'Rahul Mehta', phoneKey: '9845897555', phoneDisplay: '+919845897555', contactRef: null, source: 'manual' },
    ...over,
  });
  const view = (shares: unknown[]) => ({
    split: { id: 'sp-1', ref: 'ab2cd3', transactionId: 'txn-1' },
    transactionAmountMinor: 120_000, shares, yourMinor: 30_000, effectiveMinor: 30_000, state: 'open',
  });

  beforeEach(() => {
    mockCanSend = true;
    mockTxnData = [transaction()];
  });

  it('an unsent share offers "Send request"; sending reports the outcome', async () => {
    mockSplit = view([share()]);
    const { getByRole, getByText } = await render(<TransactionDetailsScreen />);
    await fireEvent.press(getByRole('button', { name: /Rahul Mehta/ }));
    expect(getByText('Send request')).toBeTruthy();
    await fireEvent.press(getByRole('button', { name: /Send request for Rahul Mehta/ }));
    expect(mockSendRequests).toHaveBeenCalledWith('sp-1', { shareIds: ['sh-1'], force: true });
    expect(useToast.getState().message).toBe('Request sent to Rahul Mehta');
  });

  it('a failed one offers Retry, an already-sent one a reminder, and a changed amount a resend', async () => {
    for (const [requestState, changed, label] of [
      ['failed', false, 'Retry request'],
      ['sent', false, 'Send a reminder'],
      ['sent', true, 'Resend — the amount changed'],
    ] as const) {
      mockSplit = view([share({ requestState, changedSinceRequested: changed })]);
      const r = await render(<TransactionDetailsScreen />);
      await fireEvent.press(r.getByRole('button', { name: /Rahul Mehta/ }));
      expect(r.getByText(label)).toBeTruthy();
      await r.unmount();
    }
  });

  it('SEND_SMS refused ⇒ the request is opened in the user’s SMS app instead', async () => {
    mockSendRequests.mockResolvedValue({ results: [], fallback: [{ shareId: 'sh-1', personName: 'Rahul Mehta', phone: '+91' }] });
    mockSplit = view([share()]);
    const { getByRole } = await render(<TransactionDetailsScreen />);
    await fireEvent.press(getByRole('button', { name: /Rahul Mehta/ }));
    await fireEvent.press(getByRole('button', { name: /Send request for Rahul Mehta/ }));
    expect(mockOpenInSmsApp).toHaveBeenCalledWith('sp-1', 'sh-1');
    expect(useToast.getState().message).toMatch(/Opened in Messages/);
  });

  it('a send that throws says so and never crashes the screen', async () => {
    mockSendRequests.mockRejectedValue(new Error('boom'));
    mockSplit = view([share()]);
    const { getByRole } = await render(<TransactionDetailsScreen />);
    await fireEvent.press(getByRole('button', { name: /Rahul Mehta/ }));
    await fireEvent.press(getByRole('button', { name: /Send request for Rahul Mehta/ }));
    expect(useToast.getState().message).toBe('Could not send the request');
  });

  it('no send action on a device that cannot send, on a settled share, or for someone with no number', async () => {
    mockCanSend = false;
    mockSplit = view([share()]);
    const off = await render(<TransactionDetailsScreen />);
    await fireEvent.press(off.getByRole('button', { name: /Rahul Mehta/ }));
    expect(off.queryByText('Send request')).toBeNull();
    await off.unmount();

    mockCanSend = true;
    mockSplit = view([share({ state: 'settled', settledMinor: 30_000, remainingMinor: 0 })]);
    const settledShare = await render(<TransactionDetailsScreen />);
    await fireEvent.press(settledShare.getByRole('button', { name: /Rahul Mehta/ }));
    expect(settledShare.queryByText('Send request')).toBeNull();
    await settledShare.unmount();

    mockSplit = view([share({ person: { displayName: 'Ghost', phoneKey: null, phoneDisplay: null, source: 'manual' } })]);
    const noNumber = await render(<TransactionDetailsScreen />);
    await fireEvent.press(noNumber.getByRole('button', { name: /Ghost/ }));
    expect(noNumber.queryByText('Send request')).toBeNull();
  });
});
