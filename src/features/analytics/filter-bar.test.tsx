import { fireEvent, render } from '@testing-library/react-native';

import { AnalyticsFilterBar, FilterBanner } from './filter-bar';

it('shows the account label and plain "Categories" when nothing is hidden', async () => {
  const { getByText } = await render(
    <AnalyticsFilterBar accountLabel="All accounts" accountsActive={false} hiddenCount={0} onAccounts={jest.fn()} onCategories={jest.fn()} />,
  );
  expect(getByText('All accounts')).toBeTruthy();
  expect(getByText('Categories')).toBeTruthy();
});

it('says how many categories are hidden', async () => {
  const { getByText } = await render(
    <AnalyticsFilterBar accountLabel="Canara" accountsActive hiddenCount={2} onAccounts={jest.fn()} onCategories={jest.fn()} />,
  );
  expect(getByText('Categories · 2 hidden')).toBeTruthy();
});

it('each chip fires its own handler', async () => {
  const onAccounts = jest.fn();
  const onCategories = jest.fn();
  const { getByLabelText } = await render(
    <AnalyticsFilterBar accountLabel="All accounts" accountsActive={false} hiddenCount={0} onAccounts={onAccounts} onCategories={onCategories} />,
  );
  await fireEvent.press(getByLabelText('Choose accounts'));
  expect(onAccounts).toHaveBeenCalledTimes(1);
  expect(onCategories).not.toHaveBeenCalled();
  await fireEvent.press(getByLabelText('Choose categories'));
  expect(onCategories).toHaveBeenCalledTimes(1);
});

it('the banner shows its text and Reset', async () => {
  const onReset = jest.fn();
  const { getByText } = await render(<FilterBanner text="Canara only. Every figure below follows this." onReset={onReset} />);
  expect(getByText('Canara only. Every figure below follows this.')).toBeTruthy();
  await fireEvent.press(getByText('Reset'));
  expect(onReset).toHaveBeenCalled();
});
