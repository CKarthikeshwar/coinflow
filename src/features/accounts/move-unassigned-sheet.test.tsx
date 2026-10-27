import { fireEvent, render } from '@testing-library/react-native';

import { MoveUnassignedSheet } from './move-unassigned-sheet';

const mockClose = jest.fn();
const mockMove = jest.fn();
const mockToast = jest.fn();
let mockCount = 14;
jest.mock('@/stores', () => ({ useSheetRegistry: (selector: (s: unknown) => unknown) => selector({ close: mockClose }) }));
jest.mock('@/stores/toast', () => ({ useToast: { getState: () => ({ show: mockToast }) } }));
jest.mock('@/db/repositories/balances', () => ({ useUnassigned: () => ({ balanceMinor: 100, count: mockCount }) }));
jest.mock('@/db/repositories/accounts', () => ({
  moveUnassignedTo: (...a: unknown[]) => mockMove(...a),
  useAccounts: () => ({
    data: [
      { id: 'a-bank', kind: 'bank', nickname: 'Canara ··672', bankName: 'Canara Bank', last4: '672', archivedAt: null },
      { id: 'a-cash', kind: 'cash', nickname: 'Cash in blr', bankName: null, last4: null, archivedAt: null },
      { id: 'a-old', kind: 'bank', nickname: 'Old account', bankName: null, last4: null, archivedAt: 5 },
    ],
  }),
}));

beforeEach(() => {
  mockClose.mockReset();
  mockMove.mockReset();
  mockToast.mockReset();
  mockCount = 14;
});

it('says how many will move and lists the live accounts only', async () => {
  const { getByText, queryByText } = await render(<MoveUnassignedSheet />);
  expect(getByText('Move 14 transactions')).toBeTruthy();
  expect(getByText('Canara ··672')).toBeTruthy();
  expect(getByText('Cash in blr')).toBeTruthy();
  expect(queryByText('Old account')).toBeNull();
});

it('singular wording for one transaction', async () => {
  mockCount = 1;
  const { getByText } = await render(<MoveUnassignedSheet />);
  expect(getByText('Move 1 transaction')).toBeTruthy();
});

it('Move is disabled until an account is picked', async () => {
  const { getByText } = await render(<MoveUnassignedSheet />);
  await fireEvent.press(getByText('Move'));
  expect(mockMove).not.toHaveBeenCalled();
  expect(mockClose).not.toHaveBeenCalled();
});

it('picking an account and pressing Move moves everything there, closes and toasts', async () => {
  mockMove.mockReturnValue(14);
  const { getByLabelText, getByText } = await render(<MoveUnassignedSheet />);
  await fireEvent.press(getByLabelText('Canara ··672'));
  await fireEvent.press(getByText('Move'));
  expect(mockMove).toHaveBeenCalledWith('a-bank');
  expect(mockClose).toHaveBeenCalled();
  expect(mockToast).toHaveBeenCalledWith('Moved 14 transactions to Canara ··672');
});

it('Cancel closes without moving', async () => {
  const { getByText } = await render(<MoveUnassignedSheet />);
  await fireEvent.press(getByText('Cancel'));
  expect(mockClose).toHaveBeenCalled();
  expect(mockMove).not.toHaveBeenCalled();
});
