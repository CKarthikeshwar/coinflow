import { fireEvent, render } from '@testing-library/react-native';

import PaymentMethodsScreen from './payment-methods';

const mockRouterBack = jest.fn();

jest.mock('expo-router', () => ({ router: { back: (...args: unknown[]) => mockRouterBack(...args) } }));

beforeEach(() => {
  mockRouterBack.mockReset();
});

it('lists all five payment methods', async () => {
  const { getByText } = await render(<PaymentMethodsScreen />);
  expect(getByText('UPI')).toBeTruthy();
  expect(getByText('Card')).toBeTruthy();
  expect(getByText('Cash')).toBeTruthy();
  expect(getByText('Bank transfer')).toBeTruthy();
  expect(getByText('Wallet')).toBeTruthy();
});

it('shows the "custom accounts" footer note', async () => {
  const { getByText } = await render(<PaymentMethodsScreen />);
  expect(getByText('Custom accounts are coming later.')).toBeTruthy();
});

it('back button calls router.back', async () => {
  const { getByLabelText } = await render(<PaymentMethodsScreen />);
  await fireEvent.press(getByLabelText('Back'));
  expect(mockRouterBack).toHaveBeenCalled();
});
