import { parseSms } from './parse-sms';
import { smsCorpus } from './__fixtures__/sms-corpus';

describe('parseSms — corpus (SPEC-implementation.md §23.6)', () => {
  it.each(smsCorpus.map((f) => [f.id, f] as const))('%s', (_id, fixture) => {
    const actual = parseSms({
      sender: fixture.sender,
      body: fixture.body,
      receivedAt: fixture.receivedAt,
    });
    expect(actual).toEqual(fixture.expected);
  });
});

describe('parseSms — pipeline behavior', () => {
  it('never parses a message from an unrecognised sender, regardless of body', () => {
    const result = parseSms({
      sender: 'RANDOM-CO',
      body: 'Rs.500.00 debited from A/c XX1234 to VPA someone@okbank UPI Ref 1.',
      receivedAt: 0,
    });
    expect(result).toEqual({ kind: 'ignored', reason: 'sender' });
  });

  it('uses input.receivedAt as occurredAt — never parses a date out of the body', () => {
    const receivedAt = 1_700_000_000_000;
    const result = parseSms({
      sender: 'AD-HDFCBK-S',
      body: 'Rs.500.00 debited from A/c XX1234 to VPA someone@okbank on 01-01-20 UPI Ref 1.',
      receivedAt,
    });
    expect(result.kind).toBe('transaction');
    if (result.kind === 'transaction') {
      expect(result.fields.occurredAt).toBe(receivedAt);
    }
  });

  it('never throws on garbage input', () => {
    expect(() => parseSms({ sender: '', body: '', receivedAt: 0 })).not.toThrow();
    expect(() =>
      parseSms({ sender: 'AD-HDFCBK-S', body: '', receivedAt: 0 }),
    ).not.toThrow();
  });
});
