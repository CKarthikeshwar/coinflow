import { normalizeAccount } from './normalize';

describe('normalizeAccount', () => {
  it('lower-cases and collapses whitespace', () => {
    expect(normalizeAccount('  SWIGGY   Bangalore ')).toBe('swiggy bangalore');
  });

  it('strips masked-card asterisks', () => {
    expect(normalizeAccount('HDFC ****1234')).toBe('hdfc');
  });

  it('strips long reference / order digit runs but keeps short numbers', () => {
    expect(normalizeAccount('AMAZON 402-7719321')).toBe('amazon 402');
    expect(normalizeAccount('UPI/123456789/payment')).toBe('upi payment');
  });

  it('keeps VPA characters', () => {
    expect(normalizeAccount('john.doe@okhdfc')).toBe('john.doe@okhdfc');
  });

  it('returns empty string for nullish input', () => {
    expect(normalizeAccount(null)).toBe('');
    expect(normalizeAccount(undefined)).toBe('');
    expect(normalizeAccount('')).toBe('');
  });

  it('is idempotent', () => {
    const once = normalizeAccount('Zomato Ltd. #55019');
    expect(normalizeAccount(once)).toBe(once);
  });
});
