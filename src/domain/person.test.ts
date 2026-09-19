import { isPhoneNumberSender, maskPhone, normalizePhone } from './person';

describe('normalizePhone (IMP-077)', () => {
  it.each([
    ['9845897555', '9845897555'],
    ['98458 97555', '9845897555'],
    ['98458-97555', '9845897555'],
    ['+91 98458 97555', '9845897555'],
    ['+919845897555', '9845897555'],
    ['919845897555', '9845897555'],
    ['09845897555', '9845897555'],
    ['(98458) 97555', '9845897555'],
    ['  9742590888  ', '9742590888'],
  ])('accepts %s', (raw, key) => {
    expect(normalizePhone(raw)).toEqual({ phoneKey: key, phoneDisplay: `+91${key}` });
  });

  it('treats different spellings of one number as the same key', () => {
    expect(normalizePhone('+91 98458 97555')?.phoneKey).toBe(normalizePhone('09845897555')?.phoneKey);
  });

  it.each([
    [''],
    ['abc'],
    ['12345'],
    ['98458975'],
    ['98458975555'],
    ['5845897555'], // starts with 5
    ['+1 415 555 2671'],
    ['98458 97555 ext 2'],
    [null],
    [undefined],
  ])('rejects %p', (raw) => {
    expect(normalizePhone(raw as string | null | undefined)).toBeNull();
  });
});

describe('maskPhone', () => {
  it('shows the first two and last four digits', () => {
    expect(maskPhone('9845897555')).toBe('98•••• 7555');
  });
  it('leaves a malformed key untouched', () => {
    expect(maskPhone('123')).toBe('123');
  });
});

describe('isPhoneNumberSender (D40, IMP-079)', () => {
  it.each(['+919742590888', '9742590888', '+91 97425 90888', '919742590888', '09742590888'])(
    'numeric sender %s → true',
    (a) => {
      expect(isPhoneNumberSender(a)).toBe(true);
    },
  );

  it.each(['VA-SBICRD-P', 'VM-HSBCIN-S', 'HDFCBK', 'AX-ICICIB', '56767', '1409', '', null, undefined, '9742590888x', '+91-BANK-1'])(
    'alphanumeric / short / empty sender %p → false',
    (a) => {
      expect(isPhoneNumberSender(a as string | null | undefined)).toBe(false);
    },
  );
});
