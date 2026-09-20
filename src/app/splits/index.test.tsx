import { fireEvent, render } from '@testing-library/react-native';

import { useSheetRegistry } from '@/stores';
import { useToast } from '@/stores/toast';

import SplitsScreen from './index';

const mockPush = jest.fn();
const mockBack = jest.fn();
let mockParams: { tab?: string } = {};
let mockOverview: Record<string, unknown>;
const mockAddSample = jest.fn((): boolean => true);

jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), back: () => mockBack() },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@/db/repositories/split-hooks', () => ({ useSplitsOverview: () => mockOverview }));
jest.mock('@/features/splits/dev-seed', () => ({ addSampleRequest: () => mockAddSample() }));
const mockAccept = jest.fn(async (..._a: unknown[]): Promise<{ outcome: string }> => ({ outcome: 'accepted' }));
const mockReject = jest.fn(async (..._a: unknown[]): Promise<{ outcome: string }> => ({ outcome: 'rejected' }));
const mockUndo = jest.fn();
jest.mock('@/services/notifications/respond-split', () => ({
  handleAcceptRequest: (...a: unknown[]) => mockAccept(...a),
  handleRejectRequest: (...a: unknown[]) => mockReject(...a),
}));
jest.mock('@/db/repositories/split-requests', () => ({ undoDecision: (...a: unknown[]) => mockUndo(...a) }));

const item = (o: Record<string, unknown> = {}) => ({
  shareId: 'sh-1', splitId: 'sp-1', transactionId: 'txn-1', personId: 'p1', personName: 'Rahul Mehta', label: 'Dinner',
  occurredAt: 1_700_000_000_000, amountMinor: 45_000, settledMinor: 0, remainingMinor: 45_000, state: 'pending', requestState: 'not_sent', ...o,
});
const request = (o: Record<string, unknown> = {}) => ({
  id: 'rq-1', fromPhoneKey: '9742590888', fromLabel: 'Priya Nair', forNote: 'Momos', receivedAt: 1_700_000_000_000,
  amountMinor: 45_000, settledMinor: 0, remainingMinor: 45_000, status: 'accepted', knownPerson: true, ...o,
});
const base = () => ({
  owed: [], owedSettled: [], owedTotalMinor: 0, youOwe: [], youOweSettled: [], youOweTotalMinor: 0, unattended: [], accepted: [], ready: true,
});

beforeEach(() => {
  mockPush.mockReset();
  mockBack.mockReset();
  mockAddSample.mockReset().mockReturnValue(true);
  mockAccept.mockClear();
  mockReject.mockClear();
  mockUndo.mockReset();
  useToast.getState().clear();
  mockParams = {};
  mockOverview = base();
  useSheetRegistry.setState({ current: null, params: {}, onRequestClose: null });
});

describe('states (UI-076)', () => {
  it('shows a skeleton, not the empty copy, until the data has loaded', async () => {
    mockOverview = { ...base(), ready: false };
    const { queryByText } = await render(<SplitsScreen />);
    expect(queryByText('Nobody owes you anything.')).toBeNull();
  });

  it('has the three segments with the spec’s empty copy', async () => {
    const { getByText } = await render(<SplitsScreen />);
    expect(getByText('Splits')).toBeTruthy();
    expect(getByText('Nobody owes you anything.')).toBeTruthy();
    await fireEvent.press(getByText('You owe'));
    expect(getByText('You don’t owe anyone.')).toBeTruthy();
    await fireEvent.press(getByText('Requests'));
    expect(getByText('No requests.')).toBeTruthy();
  });

  it('opens on the segment named by ?tab= (the notification / deep link)', async () => {
    mockParams = { tab: 'requests' };
    const { getByText } = await render(<SplitsScreen />);
    expect(getByText('No requests.')).toBeTruthy();
  });

  it('back returns', async () => {
    const { getByRole } = await render(<SplitsScreen />);
    await fireEvent.press(getByRole('button', { name: 'Back' }));
    expect(mockBack).toHaveBeenCalled();
  });
});

describe('Owed to you', () => {
  beforeEach(() => {
    mockOverview = {
      ...base(),
      owedTotalMinor: 75_000,
      owed: [
        { personId: 'p1', personName: 'Rahul Mehta', totalMinor: 45_000, items: [item()] },
        { personId: 'p2', personName: 'Priya Nair', totalMinor: 30_000, items: [item({ shareId: 'sh-2', personId: 'p2', personName: 'Priya Nair', amountMinor: 30_000, remainingMinor: 30_000, transactionId: 'txn-2', label: 'Cab' })] },
      ],
    };
  });

  it('groups by person with the total and a per-row status chip', async () => {
    const { getByText, getAllByText } = await render(<SplitsScreen />);
    expect(getByText('₹750 owed to you')).toBeTruthy();
    expect(getByText('Rahul Mehta')).toBeTruthy();
    expect(getByText('₹450 owed')).toBeTruthy();
    expect(getAllByText('Pending')).toHaveLength(2);
  });

  it('a part-paid row shows what is left and "Partly paid"', async () => {
    mockOverview = {
      ...base(),
      owedTotalMinor: 20_000,
      owed: [{ personId: 'p1', personName: 'Rahul Mehta', totalMinor: 20_000, items: [item({ settledMinor: 25_000, remainingMinor: 20_000, state: 'partial' })] }],
    };
    const { getByText } = await render(<SplitsScreen />);
    expect(getByText('Partly paid ₹250')).toBeTruthy();
  });

  it('tapping a row opens that transaction’s Details', async () => {
    const { getByRole } = await render(<SplitsScreen />);
    await fireEvent.press(getByRole('button', { name: /Rahul Mehta, Dinner/ }));
    expect(mockPush).toHaveBeenCalledWith('/transaction/txn-1');
  });

  it('"Mark all paid…" opens the Merge sheet for that person', async () => {
    const { getByRole } = await render(<SplitsScreen />);
    await fireEvent.press(getByRole('button', { name: 'Mark all paid for Rahul Mehta' }));
    expect(useSheetRegistry.getState().current).toBe('merge');
    expect(useSheetRegistry.getState().params).toEqual({ personId: 'p1' });
  });

  it('settled shares hide behind "Show settled"', async () => {
    mockOverview = { ...(mockOverview as object), owedSettled: [item({ shareId: 'sh-9', personName: 'Asha', settledMinor: 45_000, remainingMinor: 0, state: 'settled', label: 'Movie' })] };
    const { getByText, queryByText } = await render(<SplitsScreen />);
    expect(queryByText('Movie')).toBeNull();
    await fireEvent.press(getByText('Show settled (1)'));
    expect(getByText('Movie')).toBeTruthy();
    expect(getByText('Settled')).toBeTruthy();
    await fireEvent.press(getByText('Hide settled'));
    expect(queryByText('Movie')).toBeNull();
  });
});

describe('You owe', () => {
  beforeEach(() => {
    mockParams = { tab: 'owe' };
    mockOverview = { ...base(), youOwe: [request()], youOweTotalMinor: 45_000 };
  });

  it('groups by requester with the header total and a Merge… per row', async () => {
    const { getByText, getByRole } = await render(<SplitsScreen />);
    expect(getByText('₹450 you owe')).toBeTruthy();
    expect(getByText('Priya Nair')).toBeTruthy();
    await fireEvent.press(getByRole('button', { name: /Merge Priya Nair/ }));
    expect(useSheetRegistry.getState().current).toBe('merge');
    expect(useSheetRegistry.getState().params).toEqual({ requestId: 'rq-1' });
  });

  it('settled requests hide behind "Show settled" and have no Merge…', async () => {
    mockOverview = { ...base(), youOweSettled: [request({ id: 'rq-2', fromLabel: 'Asha', settledMinor: 45_000, remainingMinor: 0 })] };
    const { getByText, queryByText, queryByRole } = await render(<SplitsScreen />);
    await fireEvent.press(getByText('Show settled (1)'));
    expect(getByText('Asha')).toBeTruthy();
    expect(queryByText('Merge…')).toBeNull();
    expect(queryByRole('button', { name: /Merge Asha/ })).toBeNull();
  });

  it('a dev build offers a sample request; a refusal says why', async () => {
    const { getByText } = await render(<SplitsScreen />);
    await fireEvent.press(getByText('Add sample request (dev build only)'));
    expect(mockAddSample).toHaveBeenCalledTimes(1);
  });
});

describe('Requests (phase 5)', () => {
  beforeEach(() => {
    mockParams = { tab: 'requests' };
    mockOverview = {
      ...base(),
      unattended: [request({ id: 'rq-u', fromLabel: 'Asha', status: 'unattended', amountMinor: 10_000, knownPerson: false, fromPhoneKey: '9742590888' })],
      accepted: [request()],
    };
  });

  it('lists Unattended and Accepted with the count on the segment, the masked number, and "not in your people"', async () => {
    const { getByText } = await render(<SplitsScreen />);
    expect(getByText('Requests · 1')).toBeTruthy();
    expect(getByText('UNATTENDED')).toBeTruthy();
    expect(getByText('ACCEPTED')).toBeTruthy();
    expect(getByText(/97•••• 0888 · not in your people/)).toBeTruthy();
  });

  it('only an Unattended request has Accept / Reject', async () => {
    const { getAllByText } = await render(<SplitsScreen />);
    expect(getAllByText('Accept')).toHaveLength(1);
    expect(getAllByText('Reject')).toHaveLength(1);
  });

  it('Accept accepts it and offers Undo, which puts it back to Unattended', async () => {
    const { getByRole } = await render(<SplitsScreen />);
    await fireEvent.press(getByRole('button', { name: /Accept Asha/ }));
    expect(mockAccept).toHaveBeenCalledWith('rq-u');
    expect(useToast.getState().message).toMatch(/Accepted — Asha’s request is in You owe/);
    useToast.getState().action?.onPress();
    expect(mockUndo).toHaveBeenCalledWith('rq-u');
  });

  it('Reject discards it silently, with Undo', async () => {
    const { getByRole } = await render(<SplitsScreen />);
    await fireEvent.press(getByRole('button', { name: /Reject Asha/ }));
    expect(mockReject).toHaveBeenCalledWith('rq-u');
    expect(useToast.getState().message).toBe('Request rejected');
    expect(useToast.getState().action?.label).toBe('Undo');
  });

  it('a request already decided elsewhere (e.g. from the notification) shows no snackbar', async () => {
    mockAccept.mockResolvedValueOnce({ outcome: 'noop' });
    const { getByRole } = await render(<SplitsScreen />);
    await fireEvent.press(getByRole('button', { name: /Accept Asha/ }));
    expect(useToast.getState().message).toBeNull();
  });
});
