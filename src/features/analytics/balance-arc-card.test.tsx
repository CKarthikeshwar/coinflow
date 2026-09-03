import { render } from '@testing-library/react-native';

import { BalanceArcCard } from './balance-arc-card';

const THIN_SPACE = ' ';

it('shows Balance = Income − Spent, and the signed Income/Spent rows', async () => {
  const { getByText } = await render(<BalanceArcCard incomeMinor={100000} spentMinor={40000} />);
  expect(getByText('₹600')).toBeTruthy(); // balance, no leading sign when positive
  expect(getByText(`+${THIN_SPACE}₹1,000`)).toBeTruthy();
  expect(getByText(`−${THIN_SPACE}₹400`)).toBeTruthy();
});

it('a negative balance shows a leading − (IMP-037)', async () => {
  const { getByText } = await render(<BalanceArcCard incomeMinor={10000} spentMinor={40000} />);
  expect(getByText(`−${THIN_SPACE}₹300`)).toBeTruthy();
});

it('the "% of income left" caption is clamped to [0,100]', async () => {
  const { getByText } = await render(<BalanceArcCard incomeMinor={10000} spentMinor={40000} />);
  expect(getByText('0% of income left')).toBeTruthy();
});

it('zero income does not divide by zero — 0% left, not NaN', async () => {
  const { getByText } = await render(<BalanceArcCard incomeMinor={0} spentMinor={500} />);
  expect(getByText('0% of income left')).toBeTruthy();
});

it('income but zero spend shows a full arc caption and Balance = Income', async () => {
  const { getByText } = await render(<BalanceArcCard incomeMinor={50000} spentMinor={0} />);
  expect(getByText('100% of income left')).toBeTruthy();
  expect(getByText('₹500')).toBeTruthy();
});
