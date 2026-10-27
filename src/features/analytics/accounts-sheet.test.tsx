import { fireEvent, render } from '@testing-library/react-native';

import { useAnalyticsFilter } from '@/stores/analytics-filter';

import { AnalyticsAccountsSheet } from './accounts-sheet';

const mockClose = jest.fn();
jest.mock('@/stores', () => ({ useSheetRegistry: (selector: (s: unknown) => unknown) => selector({ close: mockClose }) }));
jest.mock('@/db/repositories/accounts', () => ({
  useAccounts: () => ({
    data: [
      { id: 'a-bank', kind: 'bank', nickname: 'Canara ··672', archivedAt: null },
      { id: 'a-card', kind: 'credit_card', nickname: 'HDFC Card', archivedAt: null },
      { id: 'a-old', kind: 'bank', nickname: 'Old account', archivedAt: 5 },
    ],
  }),
}));

beforeEach(() => {
  mockClose.mockReset();
  useAnalyticsFilter.getState().reset();
});

it('lists the live accounts and No account, and leaves out an archived one', async () => {
  const { getByText, queryByText } = await render(<AnalyticsAccountsSheet />);
  expect(getByText('Canara ··672')).toBeTruthy();
  expect(getByText('HDFC Card')).toBeTruthy();
  expect(getByText('No account')).toBeTruthy();
  expect(queryByText('Old account')).toBeNull();
});

it('Apply writes the ticked accounts to the store and closes', async () => {
  const { getByLabelText, getByText } = await render(<AnalyticsAccountsSheet />);
  await fireEvent.press(getByLabelText('HDFC Card'));
  await fireEvent.press(getByText('Apply'));
  expect(useAnalyticsFilter.getState().accountIds).toEqual(['a-card']);
  expect(mockClose).toHaveBeenCalled();
});

it('opens with the current filter ticked', async () => {
  useAnalyticsFilter.getState().setAccounts(['a-bank']);
  const { getByLabelText } = await render(<AnalyticsAccountsSheet />);
  expect(getByLabelText('Canara ··672').props.accessibilityState.checked).toBe(true);
  expect(getByLabelText('HDFC Card').props.accessibilityState.checked).toBe(false);
});

it('ticking everything, or nothing, both mean all accounts', async () => {
  const { getByText } = await render(<AnalyticsAccountsSheet />);
  await fireEvent.press(getByText('Select all'));
  await fireEvent.press(getByText('Apply'));
  expect(useAnalyticsFilter.getState().accountIds).toEqual([]);
});

it('Reset clears the ticks', async () => {
  useAnalyticsFilter.getState().setAccounts(['a-bank']);
  const { getByText, getByLabelText } = await render(<AnalyticsAccountsSheet />);
  await fireEvent.press(getByText('Reset'));
  expect(getByLabelText('Canara ··672').props.accessibilityState.checked).toBe(false);
  await fireEvent.press(getByText('Apply'));
  expect(useAnalyticsFilter.getState().accountIds).toEqual([]);
});

it('the No account option writes the "none" marker', async () => {
  const { getByLabelText, getByText } = await render(<AnalyticsAccountsSheet />);
  await fireEvent.press(getByLabelText('No account'));
  await fireEvent.press(getByText('Apply'));
  expect(useAnalyticsFilter.getState().accountIds).toEqual(['none']);
});

it('leaves the store alone until Apply', async () => {
  const { getByLabelText } = await render(<AnalyticsAccountsSheet />);
  await fireEvent.press(getByLabelText('HDFC Card'));
  expect(useAnalyticsFilter.getState().accountIds).toEqual([]);
});
