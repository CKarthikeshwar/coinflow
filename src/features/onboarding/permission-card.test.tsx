import { fireEvent, render } from '@testing-library/react-native';

import { PermissionCard } from './permission-card';

it('idle state shows Allow', async () => {
  const { getByText } = await render(<PermissionCard kind="sms" state="idle" onRequest={jest.fn()} />);
  expect(getByText('Allow')).toBeTruthy();
});

it('denied + canAskAgain shows Enable', async () => {
  const { getByText } = await render(
    <PermissionCard kind="sms" state="denied" canAskAgain onRequest={jest.fn()} />,
  );
  expect(getByText('Enable')).toBeTruthy();
});

it('denied + not canAskAgain (permanently denied) shows Open system settings (IMP-042)', async () => {
  const { getByText } = await render(
    <PermissionCard kind="sms" state="denied" canAskAgain={false} onRequest={jest.fn()} />,
  );
  expect(getByText('Open system settings')).toBeTruthy();
});

it('granted shows a Granted pill and no action button', async () => {
  const { getByText, queryByText } = await render(
    <PermissionCard kind="sms" state="granted" onRequest={jest.fn()} />,
  );
  expect(getByText('Granted')).toBeTruthy();
  expect(queryByText('Enable')).toBeNull();
  expect(queryByText('Allow')).toBeNull();
});

it('pressing the action button calls onRequest', async () => {
  const onRequest = jest.fn();
  const { getByText } = await render(<PermissionCard kind="notif" state="denied" onRequest={onRequest} />);
  await fireEvent.press(getByText('Enable'));
  expect(onRequest).toHaveBeenCalled();
});

it('optional shows an "Optional" tag', async () => {
  const { getByText } = await render(<PermissionCard kind="notif" state="idle" optional onRequest={jest.fn()} />);
  expect(getByText('Optional')).toBeTruthy();
});

it('not optional shows no "Optional" tag', async () => {
  const { queryByText } = await render(<PermissionCard kind="notif" state="idle" onRequest={jest.fn()} />);
  expect(queryByText('Optional')).toBeNull();
});
