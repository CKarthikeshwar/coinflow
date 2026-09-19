import {
  MAX_REQUEST_MINOR,
  MAX_SEPTETS,
  decodeRequest,
  encodeRequest,
  encodeWithdraw,
  formatRs,
  gsm7Length,
  makeRef,
  sanitizeName,
  sanitizeNote,
} from './split-message';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe('formatRs', () => {
  it.each([
    [45_000, 'Rs 450.00'],
    [120_000, 'Rs 1,200.00'],
    [12_000_000, 'Rs 1,20,000.00'],
    [100_000_000, 'Rs 10,00,000.00'],
    [5, 'Rs 0.05'],
    [101, 'Rs 1.01'],
  ])('%i paise → %s', (paise, text) => {
    expect(formatRs(paise)).toBe(text);
  });
});

describe('gsm7Length', () => {
  it('counts basic characters as 1 and { } | as 2 (extension table)', () => {
    expect(gsm7Length('abc')).toBe(3);
    expect(gsm7Length('{a|b}')).toBe(2 + 6); // a, b at one septet; { | } at two each
  });
  it('returns null for anything outside GSM-7 (would force UCS-2)', () => {
    expect(gsm7Length('₹450')).toBeNull();
    expect(gsm7Length('hello 😀')).toBeNull();
    expect(gsm7Length('नमस्ते')).toBeNull();
  });
});

describe('sanitizeNote / sanitizeName', () => {
  it('strips token delimiters, newlines, emoji and ₹, and collapses whitespace', () => {
    expect(sanitizeNote('Momos | {big}\n₹ 😀 dinner')).toBe('Momos big dinner');
  });
  it('truncates to 24 (note) and 20 (name)', () => {
    expect(sanitizeNote('x'.repeat(50))).toHaveLength(24);
    expect(sanitizeName('y'.repeat(50))).toHaveLength(20);
  });
  it('handles null / empty', () => {
    expect(sanitizeNote(null)).toBe('');
    expect(sanitizeNote('   ')).toBe('');
  });
});

describe('makeRef', () => {
  it('produces 6 characters from a-z2-7 and is deterministic for a given byte stream', () => {
    const rand = rng(1);
    const ref = makeRef(() => Math.floor(rand() * 256));
    expect(ref).toMatch(/^[a-z2-7]{6}$/);
    const rand2 = rng(1);
    expect(makeRef(() => Math.floor(rand2() * 256))).toBe(ref);
  });
});

describe('encodeRequest (IMP-078)', () => {
  it('matches the spec example with no name', () => {
    expect(encodeRequest({ ref: 'ab2cd3', amountMinor: 45_000, note: 'Momos' })).toBe(
      'Please pay Rs 450.00 for Momos (CoinFlow split). {cf1|ab2cd3|45000|Momos}',
    );
  });

  it('puts the sender name in the sentence when set', () => {
    expect(encodeRequest({ name: 'Karthik', ref: 'ab2cd3', amountMinor: 45_000, note: 'Momos' })).toBe(
      'Karthik requests Rs 450.00 for Momos (CoinFlow split). {cf1|ab2cd3|45000|Momos}',
    );
  });

  it('omits "for …" when there is no note and keeps an empty note field', () => {
    expect(encodeRequest({ ref: 'ab2cd3', amountMinor: 45_000 })).toBe('Please pay Rs 450.00 (CoinFlow split). {cf1|ab2cd3|45000|}');
  });

  it('never emits a non-GSM character, even if the note/name contain ₹ or emoji', () => {
    const text = encodeRequest({ name: 'Ravi ₹😀', ref: 'ab2cd3', amountMinor: 45_000, note: 'Chai ☕ ₹' });
    expect(gsm7Length(text)).not.toBeNull();
    expect(text).not.toContain('₹');
  });

  it('always fits one segment, even at the worst-case name / note / amount', () => {
    const text = encodeRequest({
      name: 'N'.repeat(40),
      ref: 'zzzzzz',
      amountMinor: MAX_REQUEST_MINOR,
      note: 'W'.repeat(40),
    });
    expect(gsm7Length(text)).toBeLessThanOrEqual(MAX_SEPTETS);
    expect(decodeRequest(text)).toEqual({ ref: 'zzzzzz', amountMinor: MAX_REQUEST_MINOR, note: 'W'.repeat(24) });
  });

  it('rejects a bad ref or an out-of-range amount', () => {
    expect(() => encodeRequest({ ref: 'ABCDEF', amountMinor: 100 })).toThrow(RangeError);
    expect(() => encodeRequest({ ref: 'ab2cd', amountMinor: 100 })).toThrow(RangeError);
    expect(() => encodeRequest({ ref: 'ab2cd3', amountMinor: 0 })).toThrow(RangeError);
    expect(() => encodeRequest({ ref: 'ab2cd3', amountMinor: MAX_REQUEST_MINOR + 1 })).toThrow(RangeError);
    expect(() => encodeRequest({ ref: 'ab2cd3', amountMinor: 10.5 })).toThrow(RangeError);
  });
});

describe('encodeWithdraw', () => {
  it('uses amount 0 with the same ref, and decodes as a withdrawal', () => {
    const text = encodeWithdraw({ ref: 'ab2cd3' });
    expect(text).toBe('Please ignore my earlier request (CoinFlow split withdrawn). {cf1|ab2cd3|0|}');
    expect(decodeRequest(text)).toEqual({ ref: 'ab2cd3', amountMinor: 0, note: '' });
    expect(gsm7Length(encodeWithdraw({ name: 'Karthik', ref: 'ab2cd3' }))).not.toBeNull();
  });
});

describe('decodeRequest (IMP-079)', () => {
  it('round-trips an encoded request', () => {
    const text = encodeRequest({ name: 'Karthik', ref: 'ab2cd3', amountMinor: 45_000, note: 'Momos' });
    expect(decodeRequest(text)).toEqual({ ref: 'ab2cd3', amountMinor: 45_000, note: 'Momos' });
  });

  it('round-trips the exact texts used in the phase-0 on-device test', () => {
    expect(decodeRequest('Please pay Rs 450.00 for Momos (CoinFlow split). {cf1|ab2cd3|45000|Momos}')).toEqual({
      ref: 'ab2cd3',
      amountMinor: 45_000,
      note: 'Momos',
    });
  });

  it('ignores the surrounding sentence — only the token is trusted', () => {
    expect(decodeRequest('lol {cf1|ab2cd3|100|x} whatever')).toEqual({ ref: 'ab2cd3', amountMinor: 100, note: 'x' });
  });

  it.each([
    ['plain text', 'Your A/c XX1234 is debited by Rs 450.00'],
    ['empty', ''],
    ['wrong version', '{cf2|ab2cd3|100|x}'],
    ['uppercase ref', '{cf1|AB2CD3|100|x}'],
    ['ref with digit 1', '{cf1|ab1cd3|100|x}'],
    ['ref too short', '{cf1|ab2cd|100|x}'],
    ['ref too long', '{cf1|ab2cd34|100|x}'],
    ['negative amount', '{cf1|ab2cd3|-5|x}'],
    ['decimal amount', '{cf1|ab2cd3|4.5|x}'],
    ['ten-digit amount', '{cf1|ab2cd3|1000000000|x}'],
    ['non-numeric amount', '{cf1|ab2cd3|abc|x}'],
    ['amount over ₹10 lakh', `{cf1|ab2cd3|${MAX_REQUEST_MINOR + 1}|x}`],
    ['note too long', `{cf1|ab2cd3|100|${'n'.repeat(25)}}`],
    ['nested braces', '{cf1|ab2cd3|100|{x}}'],
    ['pipe in note', '{cf1|ab2cd3|100|a|b}'],
    ['missing closing brace', '{cf1|ab2cd3|100|x'],
    ['two tokens (ambiguous)', '{cf1|ab2cd3|100|x} {cf1|ab2cd4|200|y}'],
    ['too long overall', `${'a'.repeat(500)} {cf1|ab2cd3|100|x}`],
    ['null', null],
    ['undefined', undefined],
  ])('rejects %s', (_label, body) => {
    expect(decodeRequest(body as string | null | undefined)).toBeNull();
  });

  it('accepts an amount of exactly ₹10 lakh and exactly 0', () => {
    expect(decodeRequest(`{cf1|ab2cd3|${MAX_REQUEST_MINOR}|}`)?.amountMinor).toBe(MAX_REQUEST_MINOR);
    expect(decodeRequest('{cf1|ab2cd3|0|}')?.amountMinor).toBe(0);
  });

  it('never throws on adversarial random input (fuzz)', () => {
    const rand = rng(2026);
    const alphabet = '{}|cf1ab2cd3 0123456789\n₹😀xyz';
    for (let i = 0; i < 2000; i++) {
      const len = Math.floor(rand() * 90);
      let s = '';
      for (let k = 0; k < len; k++) s += alphabet[Math.floor(rand() * alphabet.length)];
      expect(() => decodeRequest(s)).not.toThrow();
    }
  });

  it('every request we can encode decodes back to itself (property)', () => {
    const rand = rng(11);
    for (let i = 0; i < 300; i++) {
      const ref = makeRef(() => Math.floor(rand() * 256));
      const amountMinor = 1 + Math.floor(rand() * MAX_REQUEST_MINOR);
      const note = ['', 'Momos', 'Cab to airport', 'Dinner @ Toscana', 'Chai & snacks'][Math.floor(rand() * 5)];
      const text = encodeRequest({ name: i % 2 ? 'Karthik' : null, ref, amountMinor, note });
      expect(gsm7Length(text)).toBeLessThanOrEqual(MAX_SEPTETS);
      expect(decodeRequest(text)).toEqual({ ref, amountMinor, note: sanitizeNote(note) });
    }
  });
});
