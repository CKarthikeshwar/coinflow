import { eraseTimeDigit, TIME_FIELD_MAX, typeTimeDigit } from './time-entry';

const H = TIME_FIELD_MAX.hour;
const M = TIME_FIELD_MAX.minute;

/** Types a string of digits from an empty buffer. */
function type(digits: string, max: number) {
  let entry = { buffer: '', value: 0, complete: false };
  for (const d of digits) entry = typeTimeDigit(entry.buffer, d, max);
  return entry;
}

describe('typeTimeDigit (CR-31)', () => {
  it('builds a two-digit value', () => {
    expect(type('18', H)).toEqual({ buffer: '18', value: 18, complete: true });
    expect(type('07', M)).toEqual({ buffer: '07', value: 7, complete: true });
    expect(type('45', M)).toEqual({ buffer: '45', value: 45, complete: true });
  });

  it('a first digit that can still take a second is not complete yet', () => {
    expect(type('1', H)).toEqual({ buffer: '1', value: 1, complete: false });
    expect(type('2', H).complete).toBe(false); // 20–23 still possible
    expect(type('5', M).complete).toBe(false); // 50–59 still possible
  });

  it('a first digit too big for a second is complete straight away', () => {
    expect(type('3', H)).toEqual({ buffer: '3', value: 3, complete: true });
    expect(type('9', H).complete).toBe(true);
    expect(type('6', M).complete).toBe(true);
  });

  it('starts over when a digit would go past the maximum', () => {
    expect(type('27', H)).toEqual({ buffer: '7', value: 7, complete: true });
    expect(type('24', H).value).toBe(4);
    expect(type('23', H).value).toBe(23);
    expect(type('59', M).value).toBe(59);
  });

  it('a third digit starts a new value', () => {
    expect(type('184', H)).toEqual({ buffer: '4', value: 4, complete: true });
  });
});

describe('eraseTimeDigit (CR-31)', () => {
  it('drops the last digit', () => {
    expect(eraseTimeDigit('18')).toEqual({ buffer: '1', value: 1, complete: false });
  });

  it('an emptied field reads as 0', () => {
    expect(eraseTimeDigit('1')).toEqual({ buffer: '', value: 0, complete: false });
    expect(eraseTimeDigit('')).toEqual({ buffer: '', value: 0, complete: false });
  });
});
