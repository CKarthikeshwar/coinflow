import { render } from '@testing-library/react-native';

import { DailyChart } from './daily-chart';

it('shows the empty state when the series is empty', async () => {
  const { getByText } = await render(<DailyChart series={[]} yMax={1} mean={0} />);
  expect(getByText('Nothing recorded for this period.')).toBeTruthy();
});

it('shows the "avg" label with the formatted mean', async () => {
  const series = [
    { dayStartMs: 1, amountMinor: 10000 },
    { dayStartMs: 2, amountMinor: 20000 },
  ];
  const { getByText } = await render(<DailyChart series={series} yMax={20000} mean={15000} />);
  expect(getByText('avg ₹150')).toBeTruthy();
});

it('renders the "Day by day" title', async () => {
  const series = [{ dayStartMs: 1, amountMinor: 100 }];
  const { getByText } = await render(<DailyChart series={series} yMax={100} mean={100} />);
  expect(getByText('Day by day')).toBeTruthy();
});

it('labels an outlier day (above yMax) with its real amount, not the clipped one', async () => {
  const series = [
    { dayStartMs: 1, amountMinor: 100 }, // ₹1 — within range
    { dayStartMs: 2, amountMinor: 100 }, // ₹1 — within range
    { dayStartMs: 3, amountMinor: 10000 }, // ₹100 — the outlier, well above yMax (₹2)
  ];
  const { getAllByTestId } = await render(<DailyChart series={series} yMax={200} mean={3400} />);
  // Only the one outlier day gets an inline SVG label — the two in-range days get none.
  const labels = getAllByTestId(/^outlier-label-/);
  expect(labels).toHaveLength(1);
  // `<Text>` (react-native-svg) wraps its string child in an internal `<TSpan>` element.
  expect(labels[0].props.children.props.children).toBe('₹100');
});

it('does not render any outlier label when nothing exceeds yMax', async () => {
  const series = [
    { dayStartMs: 1, amountMinor: 50 },
    { dayStartMs: 2, amountMinor: 80 },
  ];
  const { queryAllByTestId } = await render(<DailyChart series={series} yMax={100} mean={65} />);
  expect(queryAllByTestId(/^outlier-label-/)).toHaveLength(0);
});
