import { fireEvent, render } from '@testing-library/react-native';

import { RecoveryScreen } from './recovery-screen';

const mockSetStringAsync = jest.fn().mockResolvedValue(true);

jest.mock('expo-clipboard', () => ({ setStringAsync: (...args: unknown[]) => mockSetStringAsync(...args) }));

beforeEach(() => {
  mockSetStringAsync.mockClear();
});

it('shows the reassurance headline and calls onReload from Reload app', async () => {
  const onReload = jest.fn();
  const { getByText } = await render(<RecoveryScreen name="TypeError" eventId={null} onReload={onReload} />);
  expect(getByText('Your data is safe.')).toBeTruthy();
  await fireEvent.press(getByText('Reload app'));
  expect(onReload).toHaveBeenCalledTimes(1);
});

it('technical details starts collapsed, no Ref line rendered until expanded', async () => {
  const { getByText, queryByText } = await render(
    <RecoveryScreen name="TypeError" eventId="event-abc123" onReload={jest.fn()} />,
  );
  expect(queryByText(/event-abc123/)).toBeNull();
  await fireEvent.press(getByText('Technical details'));
  expect(getByText('TypeError')).toBeTruthy();
  expect(getByText(/event-abc123/)).toBeTruthy();
});

it('shows no Ref line when reporting is off (eventId null) — never a placeholder', async () => {
  const { getByText, queryByText } = await render(
    <RecoveryScreen name="TypeError" eventId={null} onReload={jest.fn()} />,
  );
  await fireEvent.press(getByText('Technical details'));
  expect(getByText('TypeError')).toBeTruthy();
  expect(queryByText(/Ref /)).toBeNull();
});

it('Copy details copies the exception name and ref to the clipboard', async () => {
  const { getByText } = await render(
    <RecoveryScreen name="RangeError" eventId="event-xyz789" onReload={jest.fn()} />,
  );
  await fireEvent.press(getByText('Technical details'));
  await fireEvent.press(getByText('Copy details'));
  expect(mockSetStringAsync).toHaveBeenCalledWith('RangeError · boundary\nRef event-xyz789');
});

it('Copy details omits the Ref line when there is none to copy', async () => {
  const { getByText } = await render(<RecoveryScreen name="RangeError" eventId={null} onReload={jest.fn()} />);
  await fireEvent.press(getByText('Technical details'));
  await fireEvent.press(getByText('Copy details'));
  expect(mockSetStringAsync).toHaveBeenCalledWith('RangeError · boundary');
});
