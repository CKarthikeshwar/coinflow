import { fireEvent, render } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { useAddSheetDraft, useSheetRegistry } from '@/stores';
import { useSplitDraft } from '@/stores/split-draft';
import { useToast } from '@/stores/toast';

import { SplitSheet } from './split-sheet';

const mockListPersons = jest.fn((): unknown[] => []);
const mockGetSplitForTransaction = jest.fn((..._a: unknown[]): unknown => undefined);
const mockGetTransaction = jest.fn((..._a: unknown[]): unknown => null);
const mockPersist = jest.fn((..._a: unknown[]): { kind: string; splitId?: string } => ({ kind: 'created' }));

jest.mock('@/db/repositories/persons', () => ({ listPersons: () => mockListPersons() }));
jest.mock('@/db/repositories/splits', () => ({ getSplitForTransaction: (...a: unknown[]) => mockGetSplitForTransaction(...a) }));
jest.mock('@/db/repositories/transactions', () => ({ getTransaction: (...a: unknown[]) => mockGetTransaction(...a) }));
jest.mock('./persist-split', () => ({ persistSplitDraft: (...a: unknown[]) => mockPersist(...a) }));

// --- phase 5: contacts + sending -------------------------------------------------------------------------------
let mockCanSend = false;
let mockAccess = 'denied';
const mockRequestAccess = jest.fn(async () => mockAccess);
const mockListContacts = jest.fn(async (): Promise<unknown[]> => []);
type FakeReport = { results: { shareId: string; personName: string; phone: string; state: string }[]; fallback: { shareId: string; personName: string; phone: string }[] };
const mockSendRequests = jest.fn(async (..._a: unknown[]): Promise<FakeReport> => ({ results: [], fallback: [] }));
const mockOpenInSmsApp = jest.fn(async (..._a: unknown[]) => ({ shareId: 'sh-1', personName: 'Rahul Mehta', phone: '+91', state: 'opened_in_sms_app' }));
const mockOpenSettings = jest.fn();
jest.mock('@/services/sms', () => ({ isSmsCaptureSupported: () => mockCanSend }));
jest.mock('@/services/contacts', () => ({
  getContactsAccess: async () => mockAccess,
  requestContactsAccess: () => mockRequestAccess(),
  listContactCandidates: () => mockListContacts(),
}));
jest.mock('@/services/splits/send-requests', () => ({
  sendRequests: (...a: unknown[]) => mockSendRequests(...a),
  openInSmsApp: (...a: unknown[]) => mockOpenInSmsApp(...a),
}));


const person = (id: string, name: string, phoneKey: string) => ({
  id, displayName: name, phoneKey, phoneDisplay: `+91${phoneKey}`, contactRef: null, source: 'manual' as const, createdAt: 1, updatedAt: 1,
});
const SAVED = [person('p-rahul', 'Rahul Mehta', '9845897555'), person('p-priya', 'Priya Nair', '9742590888')];

/** The Confirm sheet is the parent: its draft carries the ₹1,200 "Dinner". */
function openFromConfirm() {
  useAddSheetDraft.getState().open({ mode: 'confirm', sourceId: 'sug-1', amountMinor: 120_000, note: 'Dinner' });
  useSheetRegistry.setState({ current: 'split', params: { returnTo: 'confirm', suggestionId: 'sug-1' }, onRequestClose: null });
}

beforeEach(() => {
  mockListPersons.mockReset().mockReturnValue(SAVED);
  mockGetSplitForTransaction.mockReset().mockReturnValue(undefined);
  mockGetTransaction.mockReset().mockReturnValue(null);
  mockPersist.mockReset().mockReturnValue({ kind: 'created' });
  useSplitDraft.getState().reset();
  useAddSheetDraft.getState().reset();
  useSheetRegistry.setState({ current: null, params: {}, onRequestClose: null });
  mockCanSend = false;
  mockAccess = 'denied';
  mockRequestAccess.mockClear();
  mockListContacts.mockReset().mockResolvedValue([]);
  mockSendRequests.mockReset().mockResolvedValue({ results: [], fallback: [] });
  mockOpenInSmsApp.mockClear();
  mockOpenSettings.mockClear();
  jest.spyOn(Linking, 'openSettings').mockImplementation(async () => mockOpenSettings());
});

afterEach(() => {
  useToast.getState().clear();
});

const enabled = (el: { props: { accessibilityState?: { disabled?: boolean } } }) => !el.props.accessibilityState?.disabled;

describe('People stage (UI-071)', () => {
  it('shows the total and note, saved people with masked numbers, and Continue disabled with nobody chosen', async () => {
    openFromConfirm();
    const { getByText, getByRole } = await render(<SplitSheet />);
    expect(getByText('Split ₹1,200')).toBeTruthy();
    expect(getByText('Dinner · who’s in?')).toBeTruthy();
    expect(getByText('Rahul Mehta')).toBeTruthy();
    expect(getByText('98•••• 7555')).toBeTruthy();
    expect(enabled(getByRole('button', { name: 'Continue' }))).toBe(false);
  });

  it('selecting people shows removable chips and enables Continue', async () => {
    openFromConfirm();
    const { getByRole, getByLabelText, queryByLabelText } = await render(<SplitSheet />);
    await fireEvent.press(getByRole('button', { name: 'Rahul Mehta' }));
    await fireEvent.press(getByRole('button', { name: 'Priya Nair' }));
    expect(enabled(getByRole('button', { name: 'Continue' }))).toBe(true);
    expect(getByLabelText('Remove Rahul')).toBeTruthy();
    await fireEvent.press(getByLabelText('Remove Rahul'));
    expect(queryByLabelText('Remove Rahul')).toBeNull();
    expect(useSplitDraft.getState().people.map((p) => p.name)).toEqual(['Priya Nair']);
  });

  it('search filters the saved people by name or number', async () => {
    openFromConfirm();
    const { getByPlaceholderText, queryByText } = await render(<SplitSheet />);
    await fireEvent.changeText(getByPlaceholderText('Search name or number'), 'priya');
    expect(queryByText('Rahul Mehta')).toBeNull();
    expect(queryByText('Priya Nair')).toBeTruthy();
    await fireEvent.changeText(getByPlaceholderText('Search name or number'), '98458');
    expect(queryByText('Rahul Mehta')).toBeTruthy();
    expect(queryByText('Priya Nair')).toBeNull();
  });

  it('"Add a number" rejects an invalid number and adds a valid one as a chip', async () => {
    openFromConfirm();
    const { getByText, getByPlaceholderText, queryByText } = await render(<SplitSheet />);
    await fireEvent.press(getByText('Add a number'));
    await fireEvent.changeText(getByPlaceholderText('10-digit mobile number'), '12345');
    await fireEvent.press(getByText('Add'));
    expect(getByText('Enter a 10-digit mobile number')).toBeTruthy();
    expect(useSplitDraft.getState().people).toEqual([]);

    await fireEvent.changeText(getByPlaceholderText('Name (optional)'), 'Neha Rao');
    await fireEvent.changeText(getByPlaceholderText('10-digit mobile number'), '+91 90000 11111');
    await fireEvent.press(getByText('Add'));
    expect(queryByText('Enter a 10-digit mobile number')).toBeNull();
    expect(useSplitDraft.getState().people).toEqual([
      expect.objectContaining({ name: 'Neha Rao', phone: '+919000011111', personId: null, source: 'manual', key: 'n:9000011111' }),
    ]);
  });

  it('a typed number that is already a saved person reuses them; the same number twice merges into one chip', async () => {
    openFromConfirm();
    const { getByText, getByPlaceholderText } = await render(<SplitSheet />);
    for (let i = 0; i < 2; i++) {
      await fireEvent.press(getByText('Add a number'));
      await fireEvent.changeText(getByPlaceholderText('10-digit mobile number'), '98458 97555');
      await fireEvent.press(getByText('Add'));
    }
    const people = useSplitDraft.getState().people;
    expect(people).toHaveLength(1);
    expect(people[0]).toMatchObject({ personId: 'p-rahul', name: 'Rahul Mehta' });
  });

  it('Cancel goes back to the sheet that opened it, keeping its params', async () => {
    openFromConfirm();
    const { getByText } = await render(<SplitSheet />);
    await fireEvent.press(getByText('Cancel'));
    expect(useSheetRegistry.getState().current).toBe('confirm');
    expect(useSheetRegistry.getState().params).toMatchObject({ suggestionId: 'sug-1' });
  });
});

describe('Amounts stage (UI-072)', () => {
  async function toAmounts(names: string[]) {
    openFromConfirm();
    const utils = await render(<SplitSheet />);
    for (const n of names) await fireEvent.press(utils.getByRole('button', { name: n }));
    await fireEvent.press(utils.getByRole('button', { name: 'Continue' }));
    return utils;
  }

  it('defaults to an equal split including you, balanced, with Done enabled', async () => {
    const { getByLabelText, getByRole, getByText } = await toAmounts(['Rahul Mehta', 'Priya Nair']);
    expect(getByText('How much each?')).toBeTruthy();
    expect(getByLabelText('You amount').props.value).toBe('400');
    expect(getByLabelText('Rahul Mehta amount').props.value).toBe('400');
    expect(getByLabelText('Priya Nair amount').props.value).toBe('400');
    expect(getByText('EQUAL SPLIT')).toBeTruthy();
    expect(enabled(getByRole('button', { name: 'Done' }))).toBe(true);
  });

  it('typing a custom amount re-shares the rest equally; Equal resets', async () => {
    const { getByLabelText, getByText, queryByText } = await toAmounts(['Rahul Mehta', 'Priya Nair']);
    await fireEvent(getByLabelText('Rahul Mehta amount'), 'focus');
    await fireEvent.changeText(getByLabelText('Rahul Mehta amount'), '600');
    await fireEvent(getByLabelText('Rahul Mehta amount'), 'blur');
    expect(getByLabelText('You amount').props.value).toBe('300');
    expect(getByLabelText('Priya Nair amount').props.value).toBe('300');
    expect(getByText('CUSTOM SPLIT')).toBeTruthy();
    await fireEvent.press(getByText('Equal'));
    expect(getByLabelText('Rahul Mehta amount').props.value).toBe('400');
    expect(queryByText('CUSTOM SPLIT')).toBeNull();
  });

  it('shows Remaining when short and Over by when too much, and disables Done', async () => {
    const { getByLabelText, getByText, getByRole } = await toAmounts(['Rahul Mehta']);
    await fireEvent.changeText(getByLabelText('You amount'), '100');
    await fireEvent.changeText(getByLabelText('Rahul Mehta amount'), '100');
    expect(getByText('Remaining')).toBeTruthy(); // ₹1,000 unassigned
    expect(enabled(getByRole('button', { name: 'Done' }))).toBe(false);
    await fireEvent.changeText(getByLabelText('You amount'), '900');
    await fireEvent.changeText(getByLabelText('Rahul Mehta amount'), '900');
    expect(getByText('Over by')).toBeTruthy();
    expect(enabled(getByRole('button', { name: 'Done' }))).toBe(false);
  });

  it('warns and blocks when someone is left owing ₹0', async () => {
    const { getByLabelText, getByText, getByRole } = await toAmounts(['Rahul Mehta']);
    await fireEvent.changeText(getByLabelText('Rahul Mehta amount'), '0');
    expect(getByText('Everyone you add needs to owe something.')).toBeTruthy();
    expect(enabled(getByRole('button', { name: 'Done' }))).toBe(false);
  });

  it('% mode: equal percentages, and switching mode clears custom amounts', async () => {
    const { getByText, getByLabelText } = await toAmounts(['Rahul Mehta', 'Priya Nair']);
    await fireEvent.changeText(getByLabelText('Rahul Mehta amount'), '600');
    await fireEvent.press(getByText('% Percent'));
    expect(getByLabelText('You percent').props.value).toBe('33.34'); // you take the spare hundredth
    expect(getByLabelText('Rahul Mehta percent').props.value).toBe('33.33');
    expect(useSplitDraft.getState().overrides).toEqual({});
  });

  it('Back returns to People with the choice intact', async () => {
    const { getByRole, getByText } = await toAmounts(['Rahul Mehta']);
    await fireEvent.press(getByRole('button', { name: 'Back' }));
    expect(getByText('Split ₹1,200')).toBeTruthy();
    expect(useSplitDraft.getState().people).toHaveLength(1);
  });

  it('Done commits the split and returns to the parent sheet — writing nothing yet', async () => {
    const { getByRole } = await toAmounts(['Rahul Mehta', 'Priya Nair']);
    await fireEvent.press(getByRole('button', { name: 'Done' }));
    expect(useSheetRegistry.getState().current).toBe('confirm');
    expect(useSplitDraft.getState().committed?.map((c) => [c.name, c.amountMinor])).toEqual([['Rahul Mehta', 40_000], ['Priya Nair', 40_000]]);
    expect(mockPersist).not.toHaveBeenCalled(); // the parent's own Save does the writing
  });

  it('Cancel from Amounts leaves the parent’s previously committed split untouched', async () => {
    useSplitDraft.setState({
      committed: [{ key: 'p-rahul', personId: 'p-rahul', name: 'Rahul Mehta', phone: '+919845897555', contactRef: null, source: 'manual', amountMinor: 30_000 }],
    });
    openFromConfirm();
    const { getByText, getByLabelText } = await render(<SplitSheet />);
    expect(getByText('How much each?')).toBeTruthy(); // editing opens straight on Amounts
    await fireEvent.changeText(getByLabelText('Rahul Mehta amount'), '999');
    await fireEvent.press(getByText('Cancel'));
    expect(useSplitDraft.getState().committed?.[0].amountMinor).toBe(30_000);
    expect(useSheetRegistry.getState().current).toBe('confirm');
  });

  it('editing an existing split keeps each person’s amount and shows a Remove split link', async () => {
    useSplitDraft.setState({
      existingSplitId: 'sp-1',
      committed: [{ key: 'p-rahul', personId: 'p-rahul', name: 'Rahul Mehta', phone: '+919845897555', contactRef: null, source: 'manual', amountMinor: 30_000 }],
    });
    openFromConfirm();
    const { getByLabelText, getByText } = await render(<SplitSheet />);
    expect(getByLabelText('Rahul Mehta amount').props.value).toBe('300');
    expect(getByLabelText('You amount').props.value).toBe('900'); // you absorb the rest
    await fireEvent.press(getByText('Remove split'));
    expect(useSplitDraft.getState().pending()).toMatchObject({ committed: null, existingSplitId: 'sp-1', removed: true });
    expect(useSheetRegistry.getState().current).toBe('confirm');
  });
});

describe('direct mode — from Transaction Details', () => {
  const txn = { id: 'txn-1', amountMinor: 90_000, direction: 'debit', note: 'Cab' };
  beforeEach(() => {
    mockGetTransaction.mockReturnValue(txn);
    useSheetRegistry.setState({ current: 'split', params: { direct: true, transactionId: 'txn-1' }, onRequestClose: null });
  });

  it('uses the transaction’s own amount and note, and Save writes straight to the database', async () => {
    const { getByText, getByRole } = await render(<SplitSheet />);
    expect(getByText('Split ₹900')).toBeTruthy();
    await fireEvent.press(getByRole('button', { name: 'Rahul Mehta' }));
    await fireEvent.press(getByRole('button', { name: 'Continue' }));
    await fireEvent.press(getByRole('button', { name: 'Save split' }));
    expect(mockPersist).toHaveBeenCalledWith(
      'txn-1',
      expect.objectContaining({ committed: [expect.objectContaining({ name: 'Rahul Mehta', amountMinor: 45_000 })] }),
      { direction: 'debit' },
    );
    expect(useToast.getState().message).toBe('Split saved');
    expect(useSheetRegistry.getState().current).toBeNull();
    expect(useSplitDraft.getState().committed).toBeNull();
  });

  it('a failed write tells the user and still closes cleanly', async () => {
    mockPersist.mockImplementation(() => {
      throw new Error('boom');
    });
    const { getByRole } = await render(<SplitSheet />);
    await fireEvent.press(getByRole('button', { name: 'Rahul Mehta' }));
    await fireEvent.press(getByRole('button', { name: 'Continue' }));
    await fireEvent.press(getByRole('button', { name: 'Save split' }));
    expect(useToast.getState().message).toBe('Could not save the split');
    expect(useSheetRegistry.getState().current).toBeNull();
  });

  it('opens on Amounts for a transaction that already has a split, and Remove split deletes it', async () => {
    mockGetSplitForTransaction.mockReturnValue({
      split: { id: 'sp-9' },
      shares: [{ personId: 'p-rahul', amountMinor: 20_000, person: { displayName: 'Rahul Mehta', phoneDisplay: '+919845897555', contactRef: null, source: 'manual' } }],
    });
    const { getByText, getByLabelText } = await render(<SplitSheet />);
    expect(getByText('How much each?')).toBeTruthy();
    expect(getByLabelText('Rahul Mehta amount').props.value).toBe('200');
    await fireEvent.press(getByText('Remove split'));
    expect(mockPersist).toHaveBeenCalledWith('txn-1', { committed: null, existingSplitId: 'sp-9', removed: true, send: true });
    expect(useToast.getState().message).toBe('Split removed');
    expect(useSheetRegistry.getState().current).toBeNull();
  });

  it('Cancel closes without touching the database', async () => {
    const { getByText } = await render(<SplitSheet />);
    await fireEvent.press(getByText('Cancel'));
    expect(mockPersist).not.toHaveBeenCalled();
    expect(useSheetRegistry.getState().current).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Phase 5 — contacts and sending
// ---------------------------------------------------------------------------------------------------------------

const CONTACTS = [
  { contactRef: 'c-1', name: 'Asha Rao', phoneKey: '9000000001', phoneDisplay: '+919000000001' },
  { contactRef: 'c-2', name: 'Vikram S', phoneKey: '9000000002', phoneDisplay: '+919000000002' },
];

/** Details entry: the sheet saves (and sends) by itself. */
function openFromDetails() {
  mockGetTransaction.mockReturnValue({ id: 'txn-1', amountMinor: 120_000, note: 'Dinner', direction: 'debit' });
  useSheetRegistry.setState({ current: 'split', params: { direct: true, transactionId: 'txn-1' }, onRequestClose: null });
}

describe('Contacts in the People stage (UI-071, IMP-098)', () => {
  it('without access it shows one row explaining why, and reads no contacts', async () => {
    openFromConfirm();
    const { getByText } = await render(<SplitSheet />);
    expect(getByText('Choose from contacts')).toBeTruthy();
    expect(getByText(/nothing is uploaded/)).toBeTruthy();
    expect(mockListContacts).not.toHaveBeenCalled();
  });

  it('tapping it asks just-in-time, then lists contacts that can be picked', async () => {
    openFromConfirm();
    mockRequestAccess.mockImplementation(async () => {
      mockAccess = 'granted';
      return 'granted';
    });
    mockListContacts.mockResolvedValue(CONTACTS);
    const { getByText, getByRole } = await render(<SplitSheet />);
    await fireEvent.press(getByText('Choose from contacts'));
    expect(mockRequestAccess).toHaveBeenCalledTimes(1);
    expect(getByText('Asha Rao')).toBeTruthy();
    expect(getByText('90•••• 0001')).toBeTruthy();
    await fireEvent.press(getByRole('button', { name: 'Asha Rao' }));
    expect(useSplitDraft.getState().people).toEqual([
      expect.objectContaining({ name: 'Asha Rao', phone: '+919000000001', contactRef: 'c-1', source: 'contact' }),
    ]);
  });

  it('already granted ⇒ the list is there without asking again', async () => {
    mockAccess = 'granted';
    mockListContacts.mockResolvedValue(CONTACTS);
    openFromConfirm();
    const { getByText } = await render(<SplitSheet />);
    expect(getByText('Vikram S')).toBeTruthy();
    expect(mockRequestAccess).not.toHaveBeenCalled();
  });

  it('permanently denied ⇒ the row explains and opens system settings instead of prompting', async () => {
    mockAccess = 'blocked';
    openFromConfirm();
    const { getByText } = await render(<SplitSheet />);
    expect(getByText(/turn it on in Settings/)).toBeTruthy();
    await fireEvent.press(getByText('Choose from contacts'));
    expect(mockOpenSettings).toHaveBeenCalled();
    expect(mockRequestAccess).not.toHaveBeenCalled();
  });

  it('the search field filters contacts too', async () => {
    mockAccess = 'granted';
    mockListContacts.mockResolvedValue(CONTACTS);
    openFromConfirm();
    const { getByPlaceholderText, queryByText, getByText } = await render(<SplitSheet />);
    await fireEvent.changeText(getByPlaceholderText('Search name or number'), 'vikram');
    expect(getByText('Vikram S')).toBeTruthy();
    expect(queryByText('Asha Rao')).toBeNull();
  });
});

describe('Sending requests (§6.17, IMP-081)', () => {
  async function toAmountsFromDetails() {
    openFromDetails();
    const r = await render(<SplitSheet />);
    await fireEvent.press(r.getByRole('button', { name: 'Rahul Mehta' }));
    await fireEvent.press(r.getByRole('button', { name: 'Continue' }));
    return r;
  }

  it('the primary button offers to send, and "Don’t send now" turns it into a plain save', async () => {
    mockCanSend = true;
    const { getByText } = await toAmountsFromDetails();
    expect(getByText('Send requests')).toBeTruthy();
    await fireEvent.press(getByText('Don’t send now'));
    expect(getByText('Save split')).toBeTruthy();
    expect(useSplitDraft.getState().sendOnSave).toBe(false);
  });

  it('a device that cannot send never offers it', async () => {
    const { getByText, queryByText } = await toAmountsFromDetails();
    expect(getByText('Save split')).toBeTruthy();
    expect(queryByText('Don’t send now')).toBeNull();
  });

  it('saves first, then sends, and shows a per-person result list with Done', async () => {
    mockCanSend = true;
    mockPersist.mockReturnValue({ kind: 'created', splitId: 'sp-9' });
    mockSendRequests.mockResolvedValue({ results: [{ shareId: 'sh-1', personName: 'Rahul Mehta', phone: '+91', state: 'sent' }], fallback: [] });
    const { getByText } = await toAmountsFromDetails();
    await fireEvent.press(getByText('Send requests'));
    expect(mockPersist).toHaveBeenCalled();
    expect(mockSendRequests).toHaveBeenCalledWith('sp-9', {});
    expect(getByText('Requests')).toBeTruthy();
    expect(getByText('Sent')).toBeTruthy();
    await fireEvent.press(getByText('Done'));
    expect(useSheetRegistry.getState().current).toBeNull();
  });

  it('a failure keeps the split and offers Retry on just that person', async () => {
    mockCanSend = true;
    mockPersist.mockReturnValue({ kind: 'created', splitId: 'sp-9' });
    mockSendRequests.mockResolvedValue({ results: [{ shareId: 'sh-1', personName: 'Rahul Mehta', phone: '+91', state: 'failed' }], fallback: [] });
    const { getByText, getByRole } = await toAmountsFromDetails();
    await fireEvent.press(getByText('Send requests'));
    expect(getByText('Sending failed')).toBeTruthy();
    expect(useToast.getState().message).toBe('Split saved'); // the split itself is safe

    mockSendRequests.mockResolvedValue({ results: [{ shareId: 'sh-1', personName: 'Rahul Mehta', phone: '+91', state: 'sent' }], fallback: [] });
    await fireEvent.press(getByRole('button', { name: 'Retry Rahul Mehta' }));
    expect(mockSendRequests).toHaveBeenLastCalledWith('sp-9', { shareIds: ['sh-1'], force: true });
    expect(getByText('Sent')).toBeTruthy();
  });

  it('SEND_SMS refused ⇒ each person offers "Open in Messages"', async () => {
    mockCanSend = true;
    mockPersist.mockReturnValue({ kind: 'created', splitId: 'sp-9' });
    mockSendRequests.mockResolvedValue({ results: [], fallback: [{ shareId: 'sh-1', personName: 'Rahul Mehta', phone: '+91' }] });
    const { getByText, getByRole } = await toAmountsFromDetails();
    await fireEvent.press(getByText('Send requests'));
    expect(getByText('Not sent yet')).toBeTruthy();
    expect(getByText(/open each one in Messages/)).toBeTruthy();
    await fireEvent.press(getByRole('button', { name: 'Open Rahul Mehta in Messages' }));
    expect(mockOpenInSmsApp).toHaveBeenCalledWith('sp-9', 'sh-1');
    expect(getByText('Opened in Messages')).toBeTruthy();
  });

  it('turning sending off saves and closes without sending', async () => {
    mockCanSend = true;
    mockPersist.mockReturnValue({ kind: 'created', splitId: 'sp-9' });
    const { getByText } = await toAmountsFromDetails();
    await fireEvent.press(getByText('Don’t send now'));
    await fireEvent.press(getByText('Save split'));
    expect(mockSendRequests).not.toHaveBeenCalled();
    expect(useSheetRegistry.getState().current).toBeNull();
  });
});
