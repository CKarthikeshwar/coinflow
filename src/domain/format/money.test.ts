import { formatMoney } from './money';

const THIN_SPACE = ' ';

describe('formatMoney', () => {
  it('shows a plain amount under 1000 with no grouping', () => {
    expect(formatMoney(45000, { sign: 'none' })).toBe('₹450');
  });

  it('groups thousands with the last-3-then-2s Indian pattern', () => {
    expect(formatMoney(120000_00, { sign: 'none' })).toBe('₹1,20,000');
    expect(formatMoney(15000_00, { sign: 'none' })).toBe('₹15,000');
    expect(formatMoney(12500000_00, { sign: 'none' })).toBe('₹1,25,00,000');
  });

  it('shows paise only when non-zero, always 2 digits', () => {
    expect(formatMoney(9999, { sign: 'none' })).toBe('₹99.99');
    expect(formatMoney(32050, { sign: 'none' })).toBe('₹320.50');
    expect(formatMoney(45000, { sign: 'none' })).toBe('₹450');
  });

  it('defaults to a leading "+" sign for a positive amount, with a thin space', () => {
    expect(formatMoney(115000_00)).toBe(`+${THIN_SPACE}₹1,15,000`);
  });

  it('always shows "−" for a negative amount, sign option or not', () => {
    expect(formatMoney(-84200)).toBe(`−${THIN_SPACE}₹842`);
    expect(formatMoney(-84200, { sign: 'always' })).toBe(`−${THIN_SPACE}₹842`);
  });

  it('sign:"none" strips the sign even for a negative amount', () => {
    expect(formatMoney(-45000, { sign: 'none' })).toBe('₹450');
  });

  it('withCurrency:false omits the ₹ prefix', () => {
    expect(formatMoney(45000, { sign: 'none', withCurrency: false })).toBe('450');
  });

  it('handles zero', () => {
    expect(formatMoney(0, { sign: 'none' })).toBe('₹0');
  });
});
