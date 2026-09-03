import { render } from '@testing-library/react-native';

import { MeanMedianTile } from './mean-median-tile';

it('shows the label and the formatted value', async () => {
  const { getByText } = await render(
    <MeanMedianTile label="Mean" valueMinor={45000} previousValueMinor={30000} previousLabel="Last month" />,
  );
  expect(getByText('Mean')).toBeTruthy();
  expect(getByText('₹450')).toBeTruthy();
});

it('shows the previous period\'s absolute amount, not a percentage', async () => {
  const { getByText } = await render(
    <MeanMedianTile label="Median" valueMinor={45000} previousValueMinor={30000} previousLabel="Last month" />,
  );
  expect(getByText('Last month ₹300')).toBeTruthy();
});

it('tracks the period label — "Last week" in week mode', async () => {
  const { getByText } = await render(
    <MeanMedianTile label="Mean" valueMinor={100} previousValueMinor={200} previousLabel="Last week" />,
  );
  expect(getByText('Last week ₹2')).toBeTruthy();
});

it('shows "No prior data" instead of a comparison when there is none (IMP-032)', async () => {
  const { getByText, queryByText } = await render(
    <MeanMedianTile label="Mean" valueMinor={45000} previousValueMinor={null} previousLabel="Last month" />,
  );
  expect(getByText('No prior data')).toBeTruthy();
  expect(queryByText(/Last month/)).toBeNull();
});
