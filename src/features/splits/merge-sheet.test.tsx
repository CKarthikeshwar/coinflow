import { fireEvent, render } from '@testing-library/react-native';

import { useSheetRegistry } from '@/stores';

import { MergeSheet } from './merge-sheet';

const mockGetTransaction = jest.fn((..._a: unknown[]): unknown => null);
const mockAllocated = jest.fn((..._a: unknown[]) => 0);
const mockPayments = jest.fn((..._a: unknown[]): unknown[] => []);
const mockShares = jest.fn((): unknown[] => []);
const mockRequests = jest.fn((): unknown[] => []);
const mockSettleAndAnnounce = jest.fn();

jest.mock('@/db/repositories/transactions', () => ({ getTransaction: (...a: unknown[]) => mockGetTransaction(...a) }));
jest.mock('@/db/repositories/settlements', () => ({
  allocatedFromTransaction: (...a: unknown[]) => mockAllocated(...a),
  listPaymentCandidates: (...a: unknown[]) => mockPayments(...a),
}));
jest.mock('@/db/repositories/splits', () => ({ listOpenShares: () => mockShares() }));
jest.mock('@/db/repositories/split-requests', () => ({ listOpenRequests: () => mockRequests() }));
jest.mock('./settle-and-announce', () => ({ settleAndAnnounce: (...a: unknown[]) => mockSettleAndAnnounce(...a) }));

const share = (id: string, personId: string, name: string, remainingMinor: number, label = 'Dinner') => ({
  shareId: id, personId, personName: name, label, occurredAt: 1_700_000_000_000, remainingMinor,
});
const txn = (o: Record<string, unknown> = {}) => ({
  id: 't1', direction: 'credit', amountMinor: 45_000, account: 'RAHUL MEHTA', note: null, occurredAt: 1_700_000_000_000, ...o,
});
const enabled = (el: { props: { accessibilityState?: { disabled?: boolean } } }) => !el.props.accessibilityState?.disabled;

beforeEach(() => {
  mockGetTransaction.mockReset().mockReturnValue(txn());
  mockAllocated.mockReset().mockReturnValue(0);
  mockPayments.mockReset().mockReturnValue([]);
  mockShares.mockReset().mockReturnValue([]);
  mockRequests.mockReset().mockReturnValue([]);
  mockSettleAndAnnounce.mockReset();
  useSheetRegistry.setState({ current: 'merge', params: {}, onRequestClose: null });
});

function openFor(params: Record<string, unknown>) {
  useSheetRegistry.setState({ current: 'merge', params });
  return render(<MergeSheet />);
}

describe('from a payment — tick what it settled (UI-077)', () => {
  it('shows the header, pre-ticks the Suggested match, and the footer reads "₹450 of ₹450 used"', async () => {
    mockShares.mockReturnValue([share('sh-1', 'p1', 'Rahul Mehta', 45_000), share('sh-2', 'p2', 'Priya Nair', 30_000)]);
    const { getByText, getByRole } = await openFor({ transactionId: 't1' });
    expect(getByText('Merge ₹450')).toBeTruthy();
    expect(getByText('SUGGESTED')).toBeTruthy();
    expect(getByRole('button', { name: /Rahul Mehta/ }).props.accessibilityState.selected).toBe(true);
    expect(getByRole('button', { name: /Priya Nair/ }).props.accessibilityState.selected).toBe(false);
    expect(getByText('₹450 of ₹450 used')).toBeTruthy();
    expect(enabled(getByRole('button', { name: 'Settle' }))).toBe(true);
  });

  it('no confident match ⇒ nothing pre-ticked and Settle disabled (IMP-085)', async () => {
    mockGetTransaction.mockReturnValue(txn({ amountMinor: 10_000, account: null }));
    mockShares.mockReturnValue([share('sh-1', 'p1', 'Rahul Mehta', 45_000)]);
    const { queryByText, getByRole } = await openFor({ transactionId: 't1' });
    expect(queryByText('SUGGESTED')).toBeNull();
    expect(enabled(getByRole('button', { name: 'Settle' }))).toBe(false);
  });

  it('ticking caps by what is left of the payment and the footer tracks it', async () => {
    mockGetTransaction.mockReturnValue(txn({ amountMinor: 40_000, account: null }));
    mockShares.mockReturnValue([share('sh-1', 'p1', 'Rahul Mehta', 30_000), share('sh-2', 'p2', 'Priya Nair', 30_000)]);
    const { getByRole, getByText } = await openFor({ transactionId: 't1' });
    await fireEvent.press(getByRole('button', { name: /Rahul Mehta/ }));
    await fireEvent.press(getByRole('button', { name: /Priya Nair/ }));
    expect(getByText('₹400 of ₹400 used')).toBeTruthy();
    await fireEvent.press(getByRole('button', { name: 'Settle' }));
    // equally close to ₹400, so ordered by name: Priya first gets her full ₹300, Rahul the ₹100 left
    expect(mockSettleAndAnnounce).toHaveBeenCalledWith(
      { transactionId: 't1', picks: [{ shareId: 'sh-2', amountMinor: 30_000 }, { shareId: 'sh-1', amountMinor: 10_000 }] },
      'share',
      expect.any(Map),
    );
    expect(useSheetRegistry.getState().current).toBeNull();
  });

  it('a typed amount is honoured and lowers the "used" figure', async () => {
    mockShares.mockReturnValue([share('sh-1', 'p1', 'Rahul Mehta', 45_000)]);
    const { getByLabelText, getByText, getByRole } = await openFor({ transactionId: 't1' });
    await fireEvent.changeText(getByLabelText('Rahul Mehta amount'), '200');
    expect(getByText('₹200 of ₹450 used')).toBeTruthy();
    await fireEvent.press(getByRole('button', { name: 'Settle' }));
    expect(mockSettleAndAnnounce.mock.calls[0][0].picks).toEqual([{ shareId: 'sh-1', amountMinor: 20_000 }]);
  });

  it('what was already settled out of the payment is not available again', async () => {
    mockAllocated.mockReturnValue(15_000);
    mockShares.mockReturnValue([share('sh-1', 'p1', 'Rahul Mehta', 45_000)]);
    const { getByText } = await openFor({ transactionId: 't1' });
    expect(getByText('₹0 of ₹300 used')).toBeTruthy(); // 45,000 − 15,000 already used; nothing matches, nothing ticked
  });

  it('a debit lists requests you owe and settles them as requests', async () => {
    mockGetTransaction.mockReturnValue(txn({ direction: 'debit', account: null }));
    mockRequests.mockReturnValue([
      { id: 'rq-1', fromPhoneKey: '9742590888', fromLabel: 'Priya Nair', forNote: 'Momos', receivedAt: 1, remainingMinor: 45_000 },
    ]);
    const { getByRole } = await openFor({ transactionId: 't1' });
    await fireEvent.press(getByRole('button', { name: 'Settle' }));
    expect(mockSettleAndAnnounce.mock.calls[0][0].picks).toEqual([{ requestId: 'rq-1', amountMinor: 45_000 }]);
    expect(mockSettleAndAnnounce.mock.calls[0][1]).toBe('request');
  });

  it('empty and gone states', async () => {
    const empty = await openFor({ transactionId: 't1' });
    expect(empty.getByText('Nobody owes you anything right now.')).toBeTruthy();
    await empty.unmount();
    mockGetTransaction.mockReturnValue(null);
    const gone = await openFor({ transactionId: 't1' });
    expect(gone.getByText('This transaction is gone.')).toBeTruthy();
  });

  it('Cancel closes the sheet without settling', async () => {
    const { getByText } = await openFor({ transactionId: 't1' });
    await fireEvent.press(getByText('Cancel'));
    expect(useSheetRegistry.getState().current).toBeNull();
    expect(mockSettleAndAnnounce).not.toHaveBeenCalled();
  });
});

describe('from an item — pick the payment (Mark all paid… / Merge…)', () => {
  const payment = (id: string, unallocatedMinor: number, o: Record<string, unknown> = {}) => ({
    id, direction: 'credit', amountMinor: unallocatedMinor, unallocatedMinor, note: null, account: 'UPI-RAHUL', occurredAt: 1_700_000_000_000, ...o,
  });

  it('a person: settles all of their open shares with the picked payment', async () => {
    mockShares.mockReturnValue([
      share('sh-1', 'p1', 'Rahul Mehta', 30_000),
      share('sh-2', 'p1', 'Rahul Mehta', 15_000, 'Cab'),
      share('sh-3', 'p2', 'Priya Nair', 99_000),
    ]);
    mockPayments.mockReturnValue([payment('pay-1', 45_000), payment('pay-2', 10_000)]);
    const { getByText, getByRole } = await openFor({ personId: 'p1' });
    expect(getByText('Mark as paid')).toBeTruthy();
    expect(getByText('Rahul Mehta · ₹450 owed')).toBeTruthy();
    expect(mockPayments).toHaveBeenCalledWith('credit');
    // the exact-amount payment is pre-picked
    expect(getByRole('button', { name: /₹450$/ }).props.accessibilityState.selected).toBe(true);
    await fireEvent.press(getByRole('button', { name: 'Settle' }));
    expect(mockSettleAndAnnounce).toHaveBeenCalledWith(
      { transactionId: 'pay-1', picks: [{ shareId: 'sh-1' }, { shareId: 'sh-2' }] },
      'share',
      expect.any(Map),
    );
  });

  it('a request: lists debits and settles the request', async () => {
    mockRequests.mockReturnValue([
      { id: 'rq-1', fromPhoneKey: '9742590888', fromLabel: 'Priya Nair', forNote: 'Momos', receivedAt: 1, remainingMinor: 45_000 },
    ]);
    mockPayments.mockReturnValue([payment('pay-9', 20_000, { direction: 'debit' })]);
    const { getByText, getByRole } = await openFor({ requestId: 'rq-1' });
    expect(getByText('Record payment')).toBeTruthy();
    expect(mockPayments).toHaveBeenCalledWith('debit');
    expect(enabled(getByRole('button', { name: 'Settle' }))).toBe(false); // no exact match ⇒ nothing pre-picked
    await fireEvent.press(getByRole('button', { name: /UPI-RAHUL/ }));
    await fireEvent.press(getByRole('button', { name: 'Settle' }));
    expect(mockSettleAndAnnounce).toHaveBeenCalledWith({ transactionId: 'pay-9', picks: [{ requestId: 'rq-1' }] }, 'request', expect.any(Map));
  });

  it('with no unmatched payment it says how to proceed and keeps Settle disabled', async () => {
    mockShares.mockReturnValue([share('sh-1', 'p1', 'Rahul Mehta', 30_000)]);
    const { getByText, getByRole } = await openFor({ shareId: 'sh-1' });
    expect(getByText(/Add it as an income transaction/)).toBeTruthy();
    expect(enabled(getByRole('button', { name: 'Settle' }))).toBe(false);
  });
});
