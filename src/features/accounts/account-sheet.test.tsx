import { fireEvent, render } from '@testing-library/react-native';

import type { MyAccount } from '@/db/schema';
import { useSheetRegistry } from '@/stores';
import { useAccountDraft } from '@/stores/account-draft';

import { AccountSheet } from './account-sheet';

function account(id: string, extra: Partial<MyAccount> = {}): MyAccount {
  return {
    id, kind: 'bank', nickname: 'HDFC ··672', bankName: 'HDFC Bank', bankKey: 'hdfc', last4: '672', matchKey: 'hdfc:672',
    autoCreated: false, archivedAt: null, creditLimitMinor: null, dueAt: null, dueAmountMinor: null, createdAt: 0, updatedAt: 0, ...extra,
  };
}

let mockAccounts: MyAccount[] = [];
const mockCreate = jest.fn((..._a: unknown[]) => ({ id: 'new-1' }));
const mockUpdate = jest.fn();
const mockMarkSeen = jest.fn();
const mockArchive = jest.fn();
const mockMerge = jest.fn();
jest.mock('@/db/repositories/accounts', () => {
  class DuplicateAccountError extends Error {
    existingId: string;
    constructor(mockId: string) {
      super('dup');
      this.existingId = mockId;
    }
  }
  return {
    DuplicateAccountError,
    useAccounts: () => ({ data: mockAccounts }),
    getAccount: (id: string) => mockAccounts.find((a) => a.id === id) ?? null,
    createAccount: (...a: unknown[]) => mockCreate(...a),
    updateAccount: (...a: unknown[]) => mockUpdate(...a),
    markAccountSeen: (...a: unknown[]) => mockMarkSeen(...a),
    archiveAccount: (...a: unknown[]) => mockArchive(...a),
    unarchiveAccount: jest.fn(),
    mergeAccounts: (...a: unknown[]) => mockMerge(...a),
    countAccountTransactions: () => 3,
  };
});
jest.mock('@/services/notifications/card-bill-reminder', () => ({ scheduleCardBillReminders: jest.fn(async () => {}) }));
jest.mock('@gorhom/bottom-sheet', () => {
  const { ScrollView } = jest.requireActual('react-native');
  return { BottomSheetScrollView: ScrollView };
});

beforeEach(() => {
  jest.clearAllMocks();
  mockAccounts = [];
  useAccountDraft.getState().reset();
});

const openAdd = (params: Record<string, unknown> = {}) => useSheetRegistry.setState({ current: 'createAccount', params, onRequestClose: null });
const openEdit = (id: string) => useSheetRegistry.setState({ current: 'editAccount', params: { accountId: id }, onRequestClose: null });

describe('Add account (UI-103a)', () => {
  it('Save needs a nickname; saves kind, bank and digits', async () => {
    openAdd({ kind: 'bank' });
    const { getByText, getByPlaceholderText, getByRole } = await render(<AccountSheet />);
    expect(getByRole('button', { name: 'Save' }).props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    await fireEvent.changeText(getByPlaceholderText('e.g. Salary – HDFC'), 'Salary');
    await fireEvent.changeText(getByPlaceholderText('e.g. HDFC Bank'), 'HDFC Bank');
    await fireEvent.changeText(getByPlaceholderText('Optional — used to match bank texts'), 'XX672');
    await fireEvent.press(getByText('Save'));
    expect(mockCreate).toHaveBeenCalledWith({ kind: 'bank', nickname: 'Salary', bankName: 'HDFC Bank', last4: '672' });
  });

  it('cash has no bank or digits', async () => {
    openAdd({ kind: 'cash' });
    const { queryByPlaceholderText } = await render(<AccountSheet />);
    expect(queryByPlaceholderText('e.g. HDFC Bank')).toBeNull();
    expect(queryByPlaceholderText('Optional — used to match bank texts')).toBeNull();
  });

  it('there is no balance field for any kind — the balance is derived from the transactions (D50)', async () => {
    openAdd({ kind: 'bank' });
    const { queryByText, queryByPlaceholderText, getByText } = await render(<AccountSheet />);
    expect(queryByText('Current balance')).toBeNull();
    expect(queryByPlaceholderText('Optional — what your bank app shows today')).toBeNull();
    await fireEvent.press(getByText('Card'));
    expect(queryByText('Available credit')).toBeNull();
    expect(queryByText('Current balance')).toBeNull();
  });

  it('duplicate digits: says which account already has them', async () => {
    mockAccounts = [account('a1', { nickname: 'Salary' })];
    const { DuplicateAccountError } = jest.requireMock('@/db/repositories/accounts') as { DuplicateAccountError: new (id: string) => Error };
    mockCreate.mockImplementationOnce(() => {
      throw new DuplicateAccountError('a1');
    });
    openAdd();
    const { getByText, getByPlaceholderText } = await render(<AccountSheet />);
    await fireEvent.changeText(getByPlaceholderText('e.g. Salary – HDFC'), 'Again');
    await fireEvent.press(getByText('Save'));
    expect(getByText('Salary already has these digits.')).toBeTruthy();
  });
});

describe('Edit account', () => {
  it('opening a New account clears its pill, and Save updates it', async () => {
    mockAccounts = [account('h', { autoCreated: true })];
    openEdit('h');
    const { getByText } = await render(<AccountSheet />);
    expect(mockMarkSeen).toHaveBeenCalledWith('h');
    await fireEvent.press(getByText('Save'));
    expect(mockUpdate).toHaveBeenCalledWith('h', expect.objectContaining({ nickname: 'HDFC ··672' }));
  });

  it('Archive', async () => {
    mockAccounts = [account('h')];
    openEdit('h');
    const { getByText } = await render(<AccountSheet />);
    await fireEvent.press(getByText('Archive'));
    expect(mockArchive).toHaveBeenCalledWith('h');
  });

  it('Merge into… confirms what moves, then merges', async () => {
    mockAccounts = [account('h'), account('k', { nickname: 'Salary', matchKey: 'hdfc:9672' })];
    openEdit('h');
    const { getByText, getByLabelText } = await render(<AccountSheet />);
    await fireEvent.press(getByText('Merge into…'));
    await fireEvent.press(getByLabelText('Merge into Salary'));
    expect(getByText('3 transactions move to Salary, and the balance with them. This account is removed.')).toBeTruthy();
    await fireEvent.press(getByText('Merge'));
    expect(mockMerge).toHaveBeenCalledWith('h', 'k');
  });
});
