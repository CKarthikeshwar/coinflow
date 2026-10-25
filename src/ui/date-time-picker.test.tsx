import { fireEvent, render } from '@testing-library/react-native';

import { DateTimePicker, monthWeeks } from './date-time-picker';

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

it('the minute stepper moves one minute at a time (CR-31 — was 5)', async () => {
  const onChange = jest.fn();
  const { getByLabelText } = await render(<DateTimePicker valueMs={SAMPLE_MS} onChange={onChange} />);

  await fireEvent.press(getByLabelText('Decrease Minute'));

  const picked = new Date(onChange.mock.calls[0][0]);
  expect(picked.getHours()).toBe(10);
  expect(picked.getMinutes()).toBe(29);
});

it('the minute stepper wraps into the next hour on overflow', async () => {
  const onChange = jest.fn();
  const { getByLabelText } = await render(
    <DateTimePicker valueMs={new Date(2026, 0, 15, 10, 59).getTime()} onChange={onChange} />,
  );
  await fireEvent.press(getByLabelText('Increase Minute'));
  const picked = new Date(onChange.mock.calls[0][0]);
  expect(picked.getHours()).toBe(11);
  expect(picked.getMinutes()).toBe(0);
});

it('tapping the hour or minute number asks the parent to type into it, and the active one is marked (CR-31)', async () => {
  const onFieldPress = jest.fn();
  const { getByLabelText } = await render(
    <DateTimePicker valueMs={SAMPLE_MS} onChange={jest.fn()} activeField="minute" onFieldPress={onFieldPress} />,
  );
  await fireEvent.press(getByLabelText('Hour 10, type a value'));
  expect(onFieldPress).toHaveBeenCalledWith('hour');
  expect(getByLabelText('Minute 30, type a value').props.accessibilityState).toEqual(
    expect.objectContaining({ selected: true }),
  );
});

it('without onFieldPress the numbers are plain text (no typing target)', async () => {
  const { queryByLabelText } = await render(<DateTimePicker valueMs={SAMPLE_MS} onChange={jest.fn()} />);
  expect(queryByLabelText('Hour 10, type a value')).toBeNull();
});

describe('monthWeeks (CR-32 — 7 days per row, under the right weekday)', () => {
  it('October 2026 starts on a Thursday: the first row is 28 Sep – 4 Oct', () => {
    const weeks = monthWeeks(new Date(2026, 9, 1));
    expect(weeks).toHaveLength(6);
    for (const w of weeks) expect(w).toHaveLength(7);
    expect(weeks[0].map((d) => d.getDate())).toEqual([28, 29, 30, 1, 2, 3, 4]);
    expect(weeks[0][3].getDay()).toBe(4); // Thursday
  });

  it('every row runs Monday to Sunday', () => {
    for (const w of monthWeeks(new Date(2026, 1, 1))) {
      expect(w[0].getDay()).toBe(1);
      expect(w[6].getDay()).toBe(0);
    }
  });
});
