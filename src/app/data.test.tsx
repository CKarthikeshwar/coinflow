import { fireEvent, render } from '@testing-library/react-native';

import DataScreen from './data';

const mockRouterBack = jest.fn();
const mockClearAllData = jest.fn();
const mockExportJson = jest.fn();
const mockExportCsv = jest.fn();

jest.mock('expo-router', () => ({ router: { back: (...args: unknown[]) => mockRouterBack(...args) } }));
jest.mock('@/db/maintenance', () => ({ clearAllData: (...args: unknown[]) => mockClearAllData(...args) }));
jest.mock('@/features/settings/export', () => ({
  exportJson: (...args: unknown[]) => mockExportJson(...args),
  exportCsv: (...args: unknown[]) => mockExportCsv(...args),
}));

beforeEach(() => {
  mockRouterBack.mockReset();
  mockClearAllData.mockReset();
  mockExportJson.mockReset().mockResolvedValue(undefined);
  mockExportCsv.mockReset().mockResolvedValue(undefined);
});

it('Export JSON calls exportJson', async () => {
  const { getByText } = await render(<DataScreen />);
  await fireEvent.press(getByText('Export JSON'));
  expect(mockExportJson).toHaveBeenCalled();
});

it('Export CSV calls exportCsv', async () => {
  const { getByText } = await render(<DataScreen />);
  await fireEvent.press(getByText('Export CSV'));
  expect(mockExportCsv).toHaveBeenCalled();
});

it('a failed export shows a retry message, not a partial-success claim (E17)', async () => {
  mockExportJson.mockRejectedValue(new Error('share failed'));
  const { getByText } = await render(<DataScreen />);
  await fireEvent.press(getByText('Export JSON'));
  expect(getByText(/Couldn't export/)).toBeTruthy();
});

it('Clear all data opens the two-step confirm, disabled until "CONFIRM" is typed', async () => {
  const { getByText, getByRole } = await render(<DataScreen />);
  await fireEvent.press(getByText('Clear all data'));
  expect(getByText('Clear all data?')).toBeTruthy();
  expect(getByRole('button', { name: 'Clear everything' }).props.accessibilityState).toEqual(
    expect.objectContaining({ disabled: true }),
  );
  expect(mockClearAllData).not.toHaveBeenCalled();
});

it('typing CONFIRM and confirming calls clearAllData and shows the cleared state', async () => {
  const { getByText, getByPlaceholderText } = await render(<DataScreen />);
  await fireEvent.press(getByText('Clear all data'));
  await fireEvent.changeText(getByPlaceholderText('CONFIRM'), 'CONFIRM');
  await fireEvent.press(getByText('Clear everything'));
  expect(mockClearAllData).toHaveBeenCalled();
  expect(getByText(/All data cleared/)).toBeTruthy();
});

it('back button calls router.back', async () => {
  const { getByLabelText } = await render(<DataScreen />);
  await fireEvent.press(getByLabelText('Back'));
  expect(mockRouterBack).toHaveBeenCalled();
});
