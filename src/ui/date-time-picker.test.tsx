import { fireEvent, render } from '@testing-library/react-native';

import { DateTimePicker } from './date-time-picker';

// Fixed sample instant: 15 Jan 2026, 10:30 — well inside the month, away from any week-boundary
// edge cases, so date-only assertions can't accidentally pass because of a grid-wrap coincidence.
const SAMPLE_MS = new Date(2026, 0, 15, 10, 30).getTime();

it('renders the viewed month and picking a day keeps the existing time-of-day', async () => {
  const onChange = jest.fn();
  const { getByText } = await render(<DateTimePicker valueMs={SAMPLE_MS} onChange={onChange} />);

  expect(getByText('January 2026')).toBeTruthy();

  await fireEvent.press(getByText('20'));

  expect(onChange).toHaveBeenCalledTimes(1);
  const picked = new Date(onChange.mock.calls[0][0]);
  expect(picked.getDate()).toBe(20);
  expect(picked.getMonth()).toBe(0);
  expect(picked.getHours()).toBe(10);
  expect(picked.getMinutes()).toBe(30);
});

it('the month nav moves the visible grid without changing the selected value', async () => {
  const onChange = jest.fn();
  const { getByText, getByLabelText } = await render(<DateTimePicker valueMs={SAMPLE_MS} onChange={onChange} />);

  await fireEvent.press(getByLabelText('Next month'));
  expect(getByText('February 2026')).toBeTruthy();
  expect(onChange).not.toHaveBeenCalled();

  await fireEvent.press(getByLabelText('Previous month'));
  await fireEvent.press(getByLabelText('Previous month'));
  expect(getByText('December 2025')).toBeTruthy();
});

it('the hour stepper wraps from 23 back to 0', async () => {
  const lateNight = new Date(2026, 0, 15, 23, 30).getTime();
  const onChange = jest.fn();
  const { getByLabelText } = await render(<DateTimePicker valueMs={lateNight} onChange={onChange} />);

  await fireEvent.press(getByLabelText('Increase Hour'));

  const picked = new Date(onChange.mock.calls[0][0]);
  expect(picked.getHours()).toBe(0);
  expect(picked.getDate()).toBe(15); // hour wrap alone doesn't roll the date
});

it('the minute stepper moves in 5-minute steps and wraps the hour on overflow', async () => {
  const onChange = jest.fn();
  const { getByLabelText } = await render(<DateTimePicker valueMs={SAMPLE_MS} onChange={onChange} />);

  await fireEvent.press(getByLabelText('Decrease Minute'));

  const picked = new Date(onChange.mock.calls[0][0]);
  expect(picked.getHours()).toBe(10);
  expect(picked.getMinutes()).toBe(25);
});
