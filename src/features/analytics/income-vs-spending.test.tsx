import { render } from '@testing-library/react-native';

import type { MonthlyPoint } from '@/domain/analytics';

import { IncomeVsSpending } from './income-vs-spending';

const series = (vals: [number, number][]): MonthlyPoint[] =>
  vals.map(([incomeMinor, spentMinor], i) => ({ monthStartMs: new Date(2026, 4 + i, 1).getTime(), incomeMinor, spentMinor }));

it('draws nothing when every month is empty', async () => {
  const { toJSON } = await render(<IncomeVsSpending series={series([[0, 0], [0, 0], [0, 0]])} />);
  expect(toJSON()).toBeNull();
});

it('draws nothing for an empty series', async () => {
  const { toJSON } = await render(<IncomeVsSpending series={[]} />);
  expect(toJSON()).toBeNull();
});

it('titles the card, names the months oldest-first and carries a legend', async () => {
  const { getByText, getAllByTestId } = await render(
    <IncomeVsSpending series={series([[900, 1200], [1100, 1800], [700, 900], [1000, 1400], [1100, 430], [8400, 8870]])} />,
  );
  expect(getByText('Income vs spending')).toBeTruthy();
  expect(getByText('6 months')).toBeTruthy();
  // `<Text>` (react-native-svg) wraps its string child in an internal `<TSpan>` element.
  const labels = getAllByTestId(/^month-label-/).map((l) => l.props.children.props.children);
  expect(labels).toEqual(['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct']);
  expect(getByText('Income')).toBeTruthy();
  expect(getByText('Spent')).toBeTruthy();
});
