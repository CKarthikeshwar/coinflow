import { fireEvent, render } from '@testing-library/react-native';

import { isoWeekPeriod, monthPeriod, stepPeriod } from '@/domain/period';

import { PeriodControl } from './period-control';

it('shows the period label and both mode options', async () => {
  const period = monthPeriod(new Date(2026, 8, 15).getTime());
  const { getByText } = await render(<PeriodControl period={period} onModeChange={jest.fn()} onStep={jest.fn()} />);
  expect(getByText(period.label)).toBeTruthy();
  expect(getByText('Month')).toBeTruthy();
  expect(getByText('Week')).toBeTruthy();
});

it('tapping Week calls onModeChange("week")', async () => {
  const period = monthPeriod(new Date(2026, 8, 15).getTime());
  const onModeChange = jest.fn();
  const { getByText } = await render(<PeriodControl period={period} onModeChange={onModeChange} onStep={jest.fn()} />);
  await fireEvent.press(getByText('Week'));
  expect(onModeChange).toHaveBeenCalledWith('week');
});

it('the previous-period button calls onStep(-1)', async () => {
  const period = monthPeriod(new Date(2026, 8, 15).getTime());
  const onStep = jest.fn();
  const { getByLabelText } = await render(<PeriodControl period={period} onModeChange={jest.fn()} onStep={onStep} />);
  await fireEvent.press(getByLabelText('Previous period'));
  expect(onStep).toHaveBeenCalledWith(-1);
});

it('the next-period button calls onStep(1) from a past period', async () => {
  const period = monthPeriod(new Date(2020, 2, 15).getTime());
  const onStep = jest.fn();
  const { getByLabelText } = await render(<PeriodControl period={period} onModeChange={jest.fn()} onStep={onStep} />);
  await fireEvent.press(getByLabelText('Next period'));
  expect(onStep).toHaveBeenCalledWith(1);
});

it('the next-period button is disabled on the current period', async () => {
  const current = monthPeriod(Date.now());
  const { getByLabelText } = await render(<PeriodControl period={current} onModeChange={jest.fn()} onStep={jest.fn()} />);
  expect(getByLabelText('Next period').props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
});

it('also disables next on the current ISO week, in week mode', async () => {
  const current = isoWeekPeriod(Date.now());
  const { getByLabelText } = await render(<PeriodControl period={current} onModeChange={jest.fn()} onStep={jest.fn()} />);
  expect(getByLabelText('Next period').props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
});

it('is not disabled the moment it steps back off the current period', async () => {
  const steppedBack = stepPeriod(monthPeriod(Date.now()), -1);
  const { getByLabelText } = await render(<PeriodControl period={steppedBack} onModeChange={jest.fn()} onStep={jest.fn()} />);
  expect(getByLabelText('Next period').props.accessibilityState).toEqual(expect.objectContaining({ disabled: false }));
});
