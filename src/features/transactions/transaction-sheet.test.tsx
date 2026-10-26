import { act, fireEvent, render } from '@testing-library/react-native';

import type { Category, MyAccount, Suggestion, Transaction } from '@/db/schema';
import { useAddSheetDraft, useKeypad, useSheetRegistry } from '@/stores';
import { useSplitDraft } from '@/stores/split-draft';
import { useToast } from '@/stores/toast';

import { TransactionSheetBody } from './transaction-sheet';

const mockCategories: Category[] = [
  { id: 'cat-food', key: null, name: 'Food', icon: 'utensils', kind: 'custom', appliesTo: 'expense', isProtected: false, order: 1, createdAt: 0, updatedAt: 0 },
  { id: 'cat-salary', key: 'salary', name: 'Salary', icon: 'briefcase', kind: 'default', appliesTo: 'income', isProtected: false, order: 10, createdAt: 0, updatedAt: 0 },
];

const mockGetAccountRule = jest.fn((..._args: unknown[]) => null as unknown);
const mockSearchByPrefix = jest.fn((..._args: unknown[]) => [] as unknown[]);
const mockGetSuggestion = jest.fn((..._args: unknown[]) => null as Suggestion | null);
const mockGetTransaction = jest.fn((..._args: unknown[]) => null as Transaction | null);
const mockWriteConfirmedTransaction = jest.fn((..._args: unknown[]) => ({ transactionId: 'new-txn-id' }));
const mockWriteEditedTransaction = jest.fn((..._args: unknown[]) => ({ transactionId: 'txn-1' }));
const mockRouterPush = jest.fn((..._args: unknown[]) => undefined);
const mockGetSplitForTransaction = jest.fn((..._args: unknown[]) => undefined as unknown);
const mockPersistSplitDraft = jest.fn((..._args: unknown[]) => ({ kind: 'created' }));

jest.mock('@/db/repositories/account-rules', () => ({
  getAccountRule: (...args: unknown[]) => mockGetAccountRule(...args),
  searchByPrefix: (...args: unknown[]) => mockSearchByPrefix(...args),
}));
jest.mock('@/db/repositories/categories', () => ({ useCategories: () => ({ data: mockCategories }) }));

// CR-34 — your accounts
function account(id: string, kind: MyAccount['kind'], nickname: string, extra: Partial<MyAccount> = {}): MyAccount {
  return {
    id, kind, nickname, bankName: null, bankKey: null, last4: null, matchKey: null, autoCreated: false, archivedAt: null,
    creditLimitMinor: null, dueAt: null, dueAmountMinor: null, createdAt: 0, updatedAt: 0, ...extra,
  };
}
let mockAccounts: MyAccount[] = [];
const mockLastUsed = jest.fn((..._a: unknown[]) => null as string | null);
jest.mock('@/db/repositories/accounts', () => ({
  useAccounts: () => ({ data: mockAccounts }),
  listAccounts: () => mockAccounts.filter((a) => !a.archivedAt),
  lastUsedAccountForMethod: (...a: unknown[]) => mockLastUsed(...a),
}));
const mockUnlinkTransfer = jest.fn();
jest.mock('@/db/repositories/transfers', () => ({ unlinkTransfer: (...a: unknown[]) => mockUnlinkTransfer(...a) }));
const mockWriteTransfer = jest.fn((..._a: unknown[]) => ({ transactionId: 'out-1' }));
jest.mock('@/db/repositories/suggestions', () => ({ getSuggestion: (...args: unknown[]) => mockGetSuggestion(...args) }));
const mockSearchNotes = jest.fn((..._args: unknown[]) => [] as string[]);
jest.mock('@/db/repositories/transactions', () => ({
  getTransaction: (...args: unknown[]) => mockGetTransaction(...args),
  searchNotesByPrefix: (...args: unknown[]) => mockSearchNotes(...args),
}));
jest.mock('./write-confirmed-transaction', () => ({
  writeConfirmedTransaction: (...args: unknown[]) => mockWriteConfirmedTransaction(...args),
  writeEditedTransaction: (...args: unknown[]) => mockWriteEditedTransaction(...args),
  writeTransfer: (...args: unknown[]) => mockWriteTransfer(...args),
}));
let mockOpenShares: unknown[] = [];
jest.mock('@/db/repositories/splits', () => ({
  getSplitForTransaction: (...args: unknown[]) => mockGetSplitForTransaction(...args),
  listOpenShares: () => mockOpenShares,
}));
const mockSettleAndAnnounce = jest.fn();
jest.mock('../splits/settle-and-announce', () => ({ settleAndAnnounce: (...args: unknown[]) => mockSettleAndAnnounce(...args) }));
const mockSendRequests = jest.fn(async (..._a: unknown[]) => ({ results: [], fallback: [] }));
jest.mock('@/services/splits/send-requests', () => ({
  sendRequests: (...a: unknown[]) => mockSendRequests(...a),
  summarizeReport: () => 'Requests sent to 2 people',
}));
jest.mock('../splits/persist-split', () => ({ persistSplitDraft: (...args: unknown[]) => mockPersistSplitDraft(...args) }));
jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockRouterPush(...args) } }));

function suggestion(overrides: Partial<Suggestion> = {}): Suggestion {
  return {
    id: 'sug-1',
    amountMinor: 45000,
    direction: 'debit',
    occurredAt: 1_700_000_000_000,
    account: 'Swiggy',
    normalizedKey: 'swiggy',
    paymentMethod: 'upi',
    smsSender: 'AD-HDFCBK-S',
    smsReceivedAt: 1_700_000_000_000,
    dedupeKey: 'dedupe-1',
    status: 'pending',
    confirmedTransactionId: null,
    dismissedAt: null,
    accountId: null,
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

function transaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'txn-1',
    amountMinor: 45000,
    direction: 'debit',
    type: 'expense',
    categoryId: 'cat-food',
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
    accountId: null,
    transferPeerId: null,
    ...overrides,
  };
}

beforeEach(() => {
  mockGetAccountRule.mockReset().mockReturnValue(null);
  mockSearchByPrefix.mockReset().mockReturnValue([]);
  mockGetSuggestion.mockReset().mockReturnValue(null);
  mockGetTransaction.mockReset().mockReturnValue(null);
  mockWriteConfirmedTransaction.mockReset().mockReturnValue({ transactionId: 'new-txn-id' });
  mockWriteEditedTransaction.mockReset().mockReturnValue({ transactionId: 'txn-1' });
  mockRouterPush.mockReset();
  mockGetSplitForTransaction.mockReset().mockReturnValue(undefined);
  mockPersistSplitDraft.mockReset().mockReturnValue({ kind: 'created' });
  useSplitDraft.getState().reset();
  useSheetRegistry.setState({ current: null, params: {}, onRequestClose: null });
  useAddSheetDraft.getState().reset();
  useKeypad.getState().reset();
  mockAccounts = [];
  mockLastUsed.mockReset().mockReturnValue(null);
  mockWriteTransfer.mockReset().mockReturnValue({ transactionId: 'out-1' });
  mockUnlinkTransfer.mockReset();
});

describe('CR-34 — Paid from / Paid into (UI-102)', () => {
  const sbi = account('sbi', 'bank', 'SBI ··1234');
  const hdfc = account('hdfc', 'bank', 'HDFC ··672');
  const card = account('card', 'credit_card', 'HDFC card');
  const cash = account('cash', 'cash', 'Cash');

  it('is hidden for someone with no accounts', async () => {
    const { queryByText } = await render(<TransactionSheetBody mode="add" />);
    expect(queryByText('Paid from')).toBeNull();
    expect(queryByText('Transfer')).toBeNull();
  });

  it('one fitting account is preselected; only fitting accounts are offered', async () => {
    mockAccounts = [sbi, cash];
    const { getByText, queryByText } = await render(<TransactionSheetBody mode="add" />);
    expect(getByText('Paid from')).toBeTruthy();
    expect(useAddSheetDraft.getState().accountId).toBe('sbi');
    expect(queryByText('Cash', { exact: true })).toBeTruthy(); // the payment-method segment
    expect(getByText('Not sure')).toBeTruthy();
  });

  it('several fitting accounts: the one last used with the method, else Not sure', async () => {
    mockAccounts = [sbi, hdfc];
    mockLastUsed.mockReturnValue('hdfc');
    await render(<TransactionSheetBody mode="add" />);
    expect(useAddSheetDraft.getState().accountId).toBe('hdfc');
  });

  it('changing the method re-picks the account (card → the credit card is offered)', async () => {
    mockAccounts = [sbi, card];
    const { getByText } = await render(<TransactionSheetBody mode="add" />);
    expect(useAddSheetDraft.getState().accountId).toBe('sbi');
    await fireEvent.press(getByText('Card'));
    expect(getByText('HDFC card')).toBeTruthy();
    expect(useAddSheetDraft.getState().accountId).toBe('sbi'); // still fits a card payment (debit card)
    await fireEvent.press(getByText('Cash'));
    expect(useAddSheetDraft.getState().accountId).toBeNull();
  });

  it('reads Paid into for income', async () => {
    mockAccounts = [sbi];
    const { getByText } = await render(<TransactionSheetBody mode="add" />);
    await fireEvent.press(getByText('Income'));
    expect(getByText('Paid into')).toBeTruthy();
  });

  it('Confirm starts on the account the SMS named', async () => {
    mockAccounts = [sbi, hdfc];
    mockGetSuggestion.mockReturnValue(suggestion({ accountId: 'hdfc' }));
    useSheetRegistry.setState({ current: 'confirm', params: { suggestionId: 'sug-1' } });
    await render(<TransactionSheetBody mode="confirm" />);
    expect(useAddSheetDraft.getState().accountId).toBe('hdfc');
  });

  it('an account that no longer fits the method is still shown, with a ⚠', async () => {
    mockAccounts = [sbi, cash];
    mockGetTransaction.mockReturnValue(transaction({ paymentMethod: 'upi', accountId: 'cash' }));
    useSheetRegistry.setState({ current: 'edit', params: { transactionId: 'txn-1' } });
    const { getByText } = await render(<TransactionSheetBody mode="edit" />);
    expect(getByText('⚠ Cash')).toBeTruthy();
  });

  it('labels the merchant field Paid to / from (UI-101)', async () => {
    const { getByText, getByPlaceholderText } = await render(<TransactionSheetBody mode="add" />);
    expect(getByText('Paid to / from')).toBeTruthy();
    expect(getByPlaceholderText('Shop or person')).toBeTruthy();
  });

  it('a save that links as a transfer says so, with Undo', async () => {
    mockAccounts = [sbi];
    mockWriteConfirmedTransaction.mockReturnValue({ transactionId: 'new-txn-id', linkedPeerId: 'peer' } as never);
    mockPersistSplitDraft.mockReturnValue({ kind: 'none' }); // no split requests — their toast would replace this one
    const { getByText, getByRole } = await render(<TransactionSheetBody mode="add" />);
    await fireEvent.press(getByText('5'));
    await fireEvent.press(getByRole('button', { name: 'Add' }));
    expect(useToast.getState().message).toBe('Linked as a transfer');
    expect(useToast.getState().action?.label).toBe('Undo');
    useToast.getState().action?.onPress();
    expect(mockUnlinkTransfer).toHaveBeenCalledWith('new-txn-id');
  });
});

describe('CR-34 — Transfer (UI-105)', () => {
  const sbi = account('sbi', 'bank', 'SBI ··1234');
  const hdfc = account('hdfc', 'bank', 'HDFC ··672');
  const cash = account('cash', 'cash', 'Cash in hand');

  it('needs two accounts', async () => {
    mockAccounts = [sbi];
    const { queryByText } = await render(<TransactionSheetBody mode="add" />);
    expect(queryByText('Transfer')).toBeNull();
  });

  it('shows amount, From, To, date and note — no category, method, merchant or description', async () => {
    mockAccounts = [sbi, hdfc, cash];
    const { getByText, queryByText, queryByPlaceholderText } = await render(<TransactionSheetBody mode="add" />);
    await fireEvent.press(getByText('Transfer'));
    expect(getByText('From')).toBeTruthy();
    expect(getByText('To')).toBeTruthy();
    expect(queryByText('Category')).toBeNull();
    expect(queryByText('Payment method')).toBeNull();
    expect(queryByPlaceholderText('Shop or person')).toBeNull();
    expect(queryByPlaceholderText('Description (optional)')).toBeNull();
    expect(queryByPlaceholderText('Note')).toBeTruthy();
  });

  it('From ≠ To; Add stays disabled until both are picked, then writes the pair', async () => {
    mockAccounts = [sbi, hdfc, cash];
    const { getByText, getAllByText, getByRole } = await render(<TransactionSheetBody mode="add" />);
    await fireEvent.press(getByText('5')); // the keypad is up on a fresh Add; picking a segment puts it away
    await fireEvent.press(getByText('Transfer'));
    await fireEvent.press(getAllByText('SBI ··1234')[0]); // From
    expect(getAllByText('SBI ··1234')).toHaveLength(1); // not offered as To
    expect(getByRole('button', { name: 'Add' }).props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    await fireEvent.press(getAllByText('Cash in hand')[1]); // To (the first one is in From)
    await fireEvent.press(getByRole('button', { name: 'Add' }));
    expect(mockWriteTransfer).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'transfer', accountId: 'sbi', toAccountId: 'cash', amountMinor: 500 }),
    );
    expect(mockWriteConfirmedTransaction).not.toHaveBeenCalled();
  });

  it('editing a transfer opens on the Transfer segment with From / To from the pair', async () => {
    mockAccounts = [sbi, hdfc];
    mockGetTransaction.mockImplementation((id: unknown) =>
      id === 'txn-1'
        ? transaction({ id: 'txn-1', type: 'transfer', direction: 'credit', accountId: 'hdfc', transferPeerId: 'out-1' })
        : transaction({ id: 'out-1', type: 'transfer', direction: 'debit', accountId: 'sbi', transferPeerId: 'txn-1' }),
    );
    useSheetRegistry.setState({ current: 'edit', params: { transactionId: 'txn-1' } });
    const { getByText } = await render(<TransactionSheetBody mode="edit" />);
    expect(getByText('From')).toBeTruthy();
    expect(useAddSheetDraft.getState()).toMatchObject({ accountId: 'sbi', toAccountId: 'hdfc', type: 'transfer' });
  });

  it('Confirm never offers Transfer', async () => {
    mockAccounts = [sbi, hdfc];
    mockGetSuggestion.mockReturnValue(suggestion());
    useSheetRegistry.setState({ current: 'confirm', params: { suggestionId: 'sug-1' } });
    const { queryByText } = await render(<TransactionSheetBody mode="confirm" />);
    expect(queryByText('Transfer')).toBeNull();
  });
});

// A successful Add starts the toast's 3s auto-hide timer — clear it so it doesn't leak past the
// test that triggered it and keep Jest's process from hanging on an open handle.
afterEach(() => {
  useToast.getState().clear();
});

describe('Add mode', () => {
  it('starts with Add disabled (amount 0) and enables it once a digit is entered', async () => {
    const { getByRole, getByText } = await render(<TransactionSheetBody mode="add" />);
    expect(getByRole('button', { name: 'Add' }).props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
    await fireEvent.press(getByText('5'));
    expect(getByRole('button', { name: 'Add' }).props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: false }),
    );
  });

  it('keeps the Category row when direction is Income (CR-28 supersedes UI-022)', async () => {
    const { getByText } = await render(<TransactionSheetBody mode="add" />);
    expect(getByText('Category')).toBeTruthy();
    await fireEvent.press(getByText('Income'));
    expect(getByText('Category')).toBeTruthy();
  });

  it('drops an expense category when switching to Income, and an income one when switching back (CR-28)', async () => {
    const { getByText } = await render(<TransactionSheetBody mode="add" />);
    useAddSheetDraft.getState().patch({ categoryId: 'cat-food' });
    await fireEvent.press(getByText('Income'));
    expect(useAddSheetDraft.getState().categoryId).toBeNull();

    useAddSheetDraft.getState().patch({ categoryId: 'cat-salary' });
    await fireEvent.press(getByText('Expense'));
    expect(useAddSheetDraft.getState().categoryId).toBeNull();
  });

  it('keeps a category that already fits when the direction is re-selected (CR-28)', async () => {
    const { getByText } = await render(<TransactionSheetBody mode="add" />);
    useAddSheetDraft.getState().patch({ categoryId: 'cat-food' });
    await fireEvent.press(getByText('Expense'));
    expect(useAddSheetDraft.getState().categoryId).toBe('cat-food');
  });

  it('Cancel with no changes closes without a discard prompt', async () => {
    const { getByText, queryByText } = await render(<TransactionSheetBody mode="add" />);
    await fireEvent.press(getByText('Cancel'));
    expect(queryByText('Discard changes?')).toBeNull();
  });

  it('Cancel after a real change (typing a note) shows the discard-confirm', async () => {
    const { getByPlaceholderText, getByText } = await render(<TransactionSheetBody mode="add" />);
    await fireEvent.changeText(getByPlaceholderText('Note'), 'Lunch');
    await fireEvent.press(getByText('Cancel'));
    expect(getByText('Discard changes?')).toBeTruthy();
  });

  it('toggling direction Expense→Income→Expense does not count as a change on Cancel', async () => {
    const { getByText, queryByText } = await render(<TransactionSheetBody mode="add" />);
    await fireEvent.press(getByText('Income'));
    await fireEvent.press(getByText('Expense'));
    await fireEvent.press(getByText('Cancel'));
    expect(queryByText('Discard changes?')).toBeNull();
  });

  it('a successful Add writes the transaction and shows the toast', async () => {
    const { getByText, getByRole } = await render(<TransactionSheetBody mode="add" />);
    await fireEvent.press(getByText('5'));
    await fireEvent.press(getByRole('button', { name: 'Add' }));
    expect(mockWriteConfirmedTransaction).toHaveBeenCalled();
  });

  // Regression (2026-09-04, found via a Maestro E2E run of e2e/j4-manual-add.yaml): SheetHost
  // fully unmounts/remounts this component whenever `current` swaps to a sub-picker (Category)
  // and back — this component's own mount effect used to unconditionally re-seed a blank draft
  // every time, silently discarding whatever the user had already typed the moment they picked
  // a category. Simulates that round trip directly: unmount, then mount a fresh instance the
  // same way SheetHost would on return, and assert the draft survived it.
  it('preserves an in-progress amount across an unmount/remount (Category-picker round trip)', async () => {
    const first = await render(<TransactionSheetBody mode="add" />);
    await fireEvent.press(first.getByText('5'));
    expect(useAddSheetDraft.getState().amountMinor).toBe(500);
    await first.unmount();

    const second = await render(<TransactionSheetBody mode="add" />);
    expect(useAddSheetDraft.getState().amountMinor).toBe(500);
    // The keypad's own buffer must have survived too, in sync with the draft — not just the
    // draft's numeric mirror — or the very next digit press corrupts it (see the store's own
    // header comment for why the two must move together).
    // CR-31: with an amount already typed the keypad comes back hidden; tapping the amount brings it back.
    expect(second.queryByText('3')).toBeNull();
    await fireEvent.press(second.getByLabelText('Amount'));
    await fireEvent.press(second.getByText('3'));
    expect(useAddSheetDraft.getState().amountMinor).toBe(5300);
    await second.unmount();
  });
});

describe('keypad only while typing the amount or a time (CR-31)', () => {
  it('a fresh Add opens with the keypad on the amount', async () => {
    const { getByText } = await render(<TransactionSheetBody mode="add" />);
    expect(getByText('5')).toBeTruthy();
  });

  it('focusing a text field puts the keypad away; tapping the amount brings it back', async () => {
    const { getByPlaceholderText, getByLabelText, queryByText, getByText } = await render(<TransactionSheetBody mode="add" />);
    await fireEvent(getByPlaceholderText('Note'), 'focus');
    expect(queryByText('5')).toBeNull();
    await fireEvent.press(getByLabelText('Amount'));
    expect(getByText('5')).toBeTruthy();
  });

  it('switching Expense / Income puts the keypad away', async () => {
    const { getByText, queryByText } = await render(<TransactionSheetBody mode="add" />);
    await fireEvent.press(getByText('Income'));
    expect(queryByText('5')).toBeNull();
  });

  it('Edit opens with the keypad hidden (the amount is already there)', async () => {
    mockGetTransaction.mockReturnValue(transaction());
    useSheetRegistry.setState({ params: { transactionId: 'txn-1' } });
    const { queryByText } = await render(<TransactionSheetBody mode="edit" />);
    expect(queryByText('5')).toBeNull();
  });

  it('tapping the hour lets the keypad type it, then moves on to the minutes', async () => {
    const { getByText, getByLabelText } = await render(<TransactionSheetBody mode="add" />);
    useAddSheetDraft.getState().patch({ occurredAt: new Date(2026, 9, 18, 10, 30).getTime() });
    await fireEvent.press(getByText('Date & time'));
    await fireEvent.press(getByLabelText(/^Hour \d\d, type a value$/));
    await fireEvent.press(getByLabelText('1'));
    await fireEvent.press(getByLabelText('8'));
    expect(new Date(useAddSheetDraft.getState().occurredAt).getHours()).toBe(18);
    // the hour is complete — the next digits go to the minutes (keys by label: the calendar also shows day numbers)
    await fireEvent.press(getByLabelText('0'));
    await fireEvent.press(getByLabelText('7'));
    const picked = new Date(useAddSheetDraft.getState().occurredAt);
    expect(picked.getHours()).toBe(18);
    expect(picked.getMinutes()).toBe(7);
    expect(useAddSheetDraft.getState().amountMinor).toBe(0); // none of that touched the amount
  });
});

describe('note autocomplete (CR-31)', () => {
  beforeEach(() => {
    mockSearchNotes.mockReset().mockImplementation((prefix: unknown) =>
      String(prefix).toLowerCase().startsWith('fre') ? ['French fries', 'Fresh juice'] : [],
    );
  });

  it('suggests past notes for what is typed while the Note field is focused, and a tap fills it in', async () => {
    const { getByPlaceholderText, getByText, queryByText } = await render(<TransactionSheetBody mode="add" />);
    const field = getByPlaceholderText('Note');
    await fireEvent(field, 'focus');
    await fireEvent.changeText(field, 'Fre');
    expect(mockSearchNotes).toHaveBeenCalledWith('Fre');
    expect(getByText('French fries')).toBeTruthy();
    expect(getByText('Fresh juice')).toBeTruthy();

    await fireEvent.press(getByText('French fries'));
    expect(useAddSheetDraft.getState().note).toBe('French fries');
    expect(queryByText('Fresh juice')).toBeNull(); // the list closes after a pick
  });

  it('shows nothing while the Note field is not focused', async () => {
    const { getByPlaceholderText, queryByText } = await render(<TransactionSheetBody mode="add" />);
    await fireEvent.changeText(getByPlaceholderText('Note'), 'Fre');
    expect(queryByText('French fries')).toBeNull();
  });
});

describe('"in the future" hint (CR-31)', () => {
  it('does not show on a fresh Add (it used to, from a few-ms race)', async () => {
    const { queryByText } = await render(<TransactionSheetBody mode="add" />);
    expect(queryByText('This date is in the future')).toBeNull();
  });

  it('shows once the date really is in the future', async () => {
    const { getByText } = await render(<TransactionSheetBody mode="add" />);
    await act(async () => {
      useAddSheetDraft.getState().patch({ occurredAt: Date.now() + 2 * 86_400_000 });
    });
    expect(getByText('This date is in the future')).toBeTruthy();
  });
});

describe('Confirm mode', () => {
  it('pre-fills from the Suggestion and shows the edge-amount gate for ₹0', async () => {
    mockGetSuggestion.mockReturnValue(suggestion({ amountMinor: 0 }));
    useSheetRegistry.setState({ params: { suggestionId: 'sug-1' } });
    const { getByText } = await render(<TransactionSheetBody mode="confirm" />);
    expect(getByText('Review transaction')).toBeTruthy();
    expect(getByText('Amount is ₹0')).toBeTruthy();
    await fireEvent.press(getByText('Add'));
    expect(getByText('Unusual amount')).toBeTruthy();
    expect(mockWriteConfirmedTransaction).not.toHaveBeenCalled();
  });

  it('closes without writing anything when the Suggestion no longer exists', async () => {
    mockGetSuggestion.mockReturnValue(null);
    useSheetRegistry.setState({ current: 'confirm', params: { suggestionId: 'gone' } });
    await render(<TransactionSheetBody mode="confirm" />);
    expect(useSheetRegistry.getState().current).toBeNull();
  });

  // Regression (2026-09-04) — same class of bug as Add's own version below: a remount for the
  // *same* suggestion (a Category-picker round trip) must not re-seed from the original
  // Suggestion and discard an in-progress edit.
  it('preserves an in-progress edit across a remount for the same Suggestion', async () => {
    mockGetSuggestion.mockReturnValue(suggestion({ amountMinor: 45000, account: 'Swiggy' }));
    useSheetRegistry.setState({ params: { suggestionId: 'sug-1' } });
    const first = await render(<TransactionSheetBody mode="confirm" />);
    useAddSheetDraft.getState().patch({ account: 'Edited Account' });
    await first.unmount();

    const second = await render(<TransactionSheetBody mode="confirm" />);
    expect(useAddSheetDraft.getState().account).toBe('Edited Account');
    await second.unmount();
  });

  // A remount for a genuinely *different* Suggestion (not the sub-picker return-trip case above)
  // must still re-seed — the guard shouldn't over-fire and get stuck showing stale data forever.
  it('still re-seeds on a remount for a different Suggestion', async () => {
    mockGetSuggestion.mockReturnValue(suggestion({ amountMinor: 45000, account: 'Swiggy' }));
    useSheetRegistry.setState({ params: { suggestionId: 'sug-1' } });
    const first = await render(<TransactionSheetBody mode="confirm" />);
    useAddSheetDraft.getState().patch({ account: 'Edited Account' });
    await first.unmount();

    mockGetSuggestion.mockReturnValue(suggestion({ id: 'sug-2', amountMinor: 10000, account: 'Uber' }));
    useSheetRegistry.setState({ params: { suggestionId: 'sug-2' } });
    const second = await render(<TransactionSheetBody mode="confirm" />);
    expect(useAddSheetDraft.getState().account).toBe('Uber');
    await second.unmount();
  });
});

describe('Edit mode', () => {
  it('pre-fills from the transaction and shows Save, not Add', async () => {
    mockGetTransaction.mockReturnValue(transaction());
    useSheetRegistry.setState({ params: { transactionId: 'txn-1' } });
    const { getByText, getByDisplayValue } = await render(<TransactionSheetBody mode="edit" />);
    expect(getByText('Edit transaction')).toBeTruthy();
    expect(getByDisplayValue('Swiggy')).toBeTruthy();
    expect(getByDisplayValue('Lunch')).toBeTruthy();
    expect(getByText('Save')).toBeTruthy();
  });

  it('Save calls writeEditedTransaction, not writeConfirmedTransaction', async () => {
    mockGetTransaction.mockReturnValue(transaction());
    useSheetRegistry.setState({ params: { transactionId: 'txn-1' } });
    const { getByText } = await render(<TransactionSheetBody mode="edit" />);
    await fireEvent.press(getByText('Save'));
    expect(mockWriteEditedTransaction).toHaveBeenCalled();
    expect(mockWriteConfirmedTransaction).not.toHaveBeenCalled();
  });

  // Regression (2026-09-04) — a remount for the same transaction (Category-picker round trip)
  // must not re-fetch and overwrite an in-progress edit with the original, unedited row.
  it('preserves an in-progress note edit across a remount for the same transaction', async () => {
    mockGetTransaction.mockReturnValue(transaction());
    useSheetRegistry.setState({ params: { transactionId: 'txn-1' } });
    const first = await render(<TransactionSheetBody mode="edit" />);
    await fireEvent.changeText(first.getByPlaceholderText('Note'), 'Edited note');
    await first.unmount();

    const second = await render(<TransactionSheetBody mode="edit" />);
    expect(second.getByDisplayValue('Edited note')).toBeTruthy();
    expect(mockGetTransaction).toHaveBeenCalledTimes(1);
    await second.unmount();
  });
});

describe('Split row (V2 — UI-070, IMP-089)', () => {
  const twoPeople = [
    { key: 'a', personId: 'p-a', name: 'Rahul', phone: '+919845897555', contactRef: null, source: 'manual' as const, amountMinor: 10_000 },
    { key: 'b', personId: 'p-b', name: 'Priya', phone: '+919742590888', contactRef: null, source: 'manual' as const, amountMinor: 10_000 },
  ];

  function openConfirm(over: Partial<Suggestion> = {}) {
    mockGetSuggestion.mockReturnValue(suggestion({ amountMinor: 45000, ...over }));
    useSheetRegistry.setState({ current: 'confirm', params: { suggestionId: 'sug-1' } });
    return render(<TransactionSheetBody mode="confirm" />);
  }

  it('is not offered in the Add sheet (a transaction must exist to be split)', async () => {
    const { getByText, queryByText } = await render(<TransactionSheetBody mode="add" />);
    await fireEvent.press(getByText('5'));
    expect(queryByText('Split…')).toBeNull();
  });

  it('is offered in Confirm for a debit with an amount, and opens the Split sheet returning to Confirm', async () => {
    const { getByText } = await openConfirm();
    await fireEvent.press(getByText('Split…'));
    expect(useSheetRegistry.getState().current).toBe('split');
    expect(useSheetRegistry.getState().params).toMatchObject({ returnTo: 'confirm', suggestionId: 'sug-1' });
  });

  it('is hidden for an income and for a ₹0 amount', async () => {
    const { queryByText, unmount } = await openConfirm({ direction: 'credit' });
    expect(queryByText('Split…')).toBeNull();
    await unmount();
    useAddSheetDraft.getState().reset();
    const again = await openConfirm({ amountMinor: 0 });
    expect(again.queryByText('Split…')).toBeNull();
  });

  it('shows "Split with N" and your share once a split is committed', async () => {
    useSplitDraft.setState({ committed: twoPeople });
    const { getByText, queryByText } = await openConfirm();
    expect(getByText('Split with 2')).toBeTruthy();
    expect(getByText(/250.*yours/)).toBeTruthy(); // ₹450 − ₹100 − ₹100
    expect(queryByText('Split…')).toBeNull();
  });

  it('blocks Add and explains why when others’ shares would exceed a lowered amount (IMP-089)', async () => {
    useSplitDraft.setState({ committed: twoPeople }); // others owe ₹200
    const { getByText, getByRole } = await openConfirm({ amountMinor: 15_000 }); // ₹150 < ₹200
    expect(getByText('Others’ shares are more than the amount — edit the split.')).toBeTruthy();
    expect(getByRole('button', { name: 'Add' }).props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    await fireEvent.press(getByRole('button', { name: 'Add' }));
    expect(mockWriteConfirmedTransaction).not.toHaveBeenCalled();
  });

  it('saving the transaction then writes the split against the new transaction id', async () => {
    useSplitDraft.setState({ committed: twoPeople, dirty: true });
    const { getByRole } = await openConfirm();
    await fireEvent.press(getByRole('button', { name: 'Add' }));
    expect(mockWriteConfirmedTransaction).toHaveBeenCalledTimes(1);
    expect(mockPersistSplitDraft).toHaveBeenCalledWith(
      'new-txn-id',
      expect.objectContaining({ committed: twoPeople, existingSplitId: null }),
      expect.objectContaining({ direction: 'debit' }),
    );
    expect(useSplitDraft.getState().committed).toBeNull(); // draft cleared after save
  });

  it('a failing split write never loses the saved transaction — it tells the user instead', async () => {
    mockPersistSplitDraft.mockImplementation(() => {
      throw new Error('boom');
    });
    useSplitDraft.setState({ committed: twoPeople, dirty: true });
    const { getByRole } = await openConfirm();
    await fireEvent.press(getByRole('button', { name: 'Add' }));
    expect(mockWriteConfirmedTransaction).toHaveBeenCalledTimes(1);
    expect(useToast.getState().message).toBe('Saved, but the split could not be saved');
    expect(useSheetRegistry.getState().current).toBeNull(); // the sheet still closed
  });

  it('with no split, saving does not attempt to write one that is empty', async () => {
    const { getByRole } = await openConfirm();
    await fireEvent.press(getByRole('button', { name: 'Add' }));
    expect(mockPersistSplitDraft).toHaveBeenCalledWith('new-txn-id', expect.objectContaining({ committed: null }), expect.anything());
  });

  it('Edit seeds the row from the existing split and saves against the same transaction', async () => {
    mockGetTransaction.mockReturnValue(transaction({ amountMinor: 45000 }));
    mockGetSplitForTransaction.mockReturnValue({
      split: { id: 'sp-1' },
      shares: [{ personId: 'p-a', amountMinor: 10_000, person: { displayName: 'Rahul', phoneDisplay: '+919845897555', contactRef: null, source: 'manual' } }],
    });
    useSheetRegistry.setState({ current: 'edit', params: { transactionId: 'txn-1' } });
    const { getByText, getByRole } = await render(<TransactionSheetBody mode="edit" />);
    expect(getByText('Split with 1')).toBeTruthy();
    await fireEvent.press(getByRole('button', { name: 'Save' }));
    expect(mockPersistSplitDraft).toHaveBeenCalledWith('txn-1', expect.objectContaining({ existingSplitId: 'sp-1' }), expect.anything());
  });

  it('a waived share is absorbed by you in the "yours" figure (not owed to you)', async () => {
    mockGetTransaction.mockReturnValue(transaction({ amountMinor: 45000 }));
    mockGetSplitForTransaction.mockReturnValue({
      split: { id: 'sp-1' },
      shares: [
        { personId: 'p-a', amountMinor: 10_000, waivedAt: 5, person: { displayName: 'Rahul', phoneDisplay: '+919845897555', contactRef: null, source: 'manual' } },
        { personId: 'p-b', amountMinor: 10_000, waivedAt: null, person: { displayName: 'Priya', phoneDisplay: '+919742590888', contactRef: null, source: 'manual' } },
      ],
    });
    useSheetRegistry.setState({ current: 'edit', params: { transactionId: 'txn-1' } });
    const { getByText } = await render(<TransactionSheetBody mode="edit" />);
    expect(getByText(/350.*yours/)).toBeTruthy(); // ₹450 − only Priya's ₹100
  });

  it('Cancel after changing only the split asks before discarding (V-6)', async () => {
    useSplitDraft.setState({ committed: twoPeople, dirty: true });
    const { getByText } = await openConfirm();
    await fireEvent.press(getByText('Cancel'));
    expect(getByText('Discard changes?')).toBeTruthy();
    await fireEvent.press(getByText('Discard'));
    expect(useSplitDraft.getState().committed).toBeNull();
  });
});

describe('V2 phase 4 — Suggested settlement in the Confirm sheet (UI-078)', () => {
  const rahulShare = { shareId: 'sh-1', personId: 'p-a', personName: 'Rahul Mehta', remainingMinor: 45_000 };

  function openCredit(over: Partial<Suggestion> = {}) {
    mockGetSuggestion.mockReturnValue(
      suggestion({ direction: 'credit', amountMinor: 45_000, account: 'RAHUL MEHTA', ...over }),
    );
    useSheetRegistry.setState({ current: 'confirm', params: { suggestionId: 'sug-1' } });
    return render(<TransactionSheetBody mode="confirm" />);
  }

  beforeEach(() => {
    mockOpenShares = [rahulShare];
    mockSettleAndAnnounce.mockReset();
  });
  afterEach(() => {
    mockOpenShares = [];
  });

  it('offers the match on a credit that equals one open share and names the payer', async () => {
    const { getByText } = await openCredit();
    expect(getByText('Looks like Rahul Mehta paying ₹450')).toBeTruthy();
  });

  it('offers nothing for a debit, an Add sheet, or a different amount', async () => {
    const debit = await openCredit({ direction: 'debit' });
    expect(debit.queryByText(/Looks like/)).toBeNull();
    await debit.unmount();
    useAddSheetDraft.getState().reset();

    const other = await openCredit({ amountMinor: 30_000 });
    expect(other.queryByText(/Looks like/)).toBeNull();
    await other.unmount();

    useAddSheetDraft.getState().reset();
    useSheetRegistry.setState({ current: 'add', params: {} });
    const add = await render(<TransactionSheetBody mode="add" />);
    expect(add.queryByText(/Looks like/)).toBeNull();
  });

  it('Settle writes nothing yet — the settlement happens after Save, for the saved transaction', async () => {
    const { getByText } = await openCredit();
    await fireEvent.press(getByText('Settle'));
    expect(getByText('Will settle Rahul Mehta’s share')).toBeTruthy();
    expect(mockSettleAndAnnounce).not.toHaveBeenCalled();

    await fireEvent.press(getByText('Add'));
    expect(mockSettleAndAnnounce).toHaveBeenCalledWith(
      { transactionId: 'new-txn-id', picks: [{ shareId: 'sh-1' }] },
      'share',
      new Map([['sh-1', 'Rahul Mehta']]),
    );
  });

  it('saving without pressing Settle never settles (IMP-085), and "Not this" hides the card', async () => {
    const first = await openCredit();
    await fireEvent.press(first.getByText('Add'));
    expect(mockSettleAndAnnounce).not.toHaveBeenCalled();
    await first.unmount();

    useAddSheetDraft.getState().reset();
    const again = await openCredit();
    await fireEvent.press(again.getByText('Not this'));
    expect(again.queryByText(/Looks like/)).toBeNull();
  });

  it('Undo on the pending card cancels the choice, so Save settles nothing', async () => {
    const { getByText } = await openCredit();
    await fireEvent.press(getByText('Settle'));
    await fireEvent.press(getByText('Undo'));
    await fireEvent.press(getByText('Add'));
    expect(mockSettleAndAnnounce).not.toHaveBeenCalled();
  });
});
