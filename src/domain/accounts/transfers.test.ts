import { matchTransfer, pairKey, TRANSFER_WINDOW_MS, type TransferRow } from './transfers';

const T = 1_790_000_000_000;

function row(overrides: Partial<TransferRow>): TransferRow {
  return {
    id: 'r',
    amountMinor: 1_000_000,
    direction: 'debit',
    type: 'expense',
    accountId: 'sbi',
    occurredAt: T,
    source: 'sms',
    transferPeerId: null,
    deletedAt: null,
    ...overrides,
  };
}

const out = row({ id: 'out' });
const into = row({ id: 'in', direction: 'credit', type: 'income', accountId: 'hdfc', occurredAt: T + 60_000 });

describe('matchTransfer (§46.3, D47)', () => {
  it('links exactly one candidate when at least one side is an SMS', () => {
    expect(matchTransfer(out, [into])).toEqual({ kind: 'link', peer: into });
    expect(matchTransfer(out, [{ ...into, source: 'manual' }])).toMatchObject({ kind: 'link' });
  });

  it('asks when two rows could be the other half', () => {
    const into2 = { ...into, id: 'in2', accountId: 'axis' };
    expect(matchTransfer(out, [into, into2])).toEqual({ kind: 'ask', peers: [into, into2] });
  });

  it('asks when the one candidate itself has another possible twin (one debit, two credits)', () => {
    const into2 = { ...into, id: 'in2', accountId: 'axis' };
    expect(matchTransfer(into, [out, into2])).toEqual({ kind: 'ask', peers: [out] });
  });

  it('asks (never links) when neither side came from an SMS', () => {
    expect(matchTransfer({ ...out, source: 'manual' }, [{ ...into, source: 'manual' }])).toMatchObject({ kind: 'ask' });
  });

  it('the 15-minute edge is inclusive', () => {
    expect(matchTransfer(out, [{ ...into, occurredAt: T + TRANSFER_WINDOW_MS }]).kind).toBe('link');
    expect(matchTransfer(out, [{ ...into, occurredAt: T - TRANSFER_WINDOW_MS - 1 }]).kind).toBe('none');
  });

  it.each([
    ['same account', { accountId: 'sbi' }],
    ['no account', { accountId: null }],
    ['amount differs by a paisa', { amountMinor: 999_999 }],
    ['same direction', { direction: 'debit' as const }],
    ['already linked', { transferPeerId: 'x' }],
    ['deleted', { deletedAt: 1 }],
    ['already a transfer', { type: 'transfer' }],
  ])('no match: %s', (_label, change) => {
    expect(matchTransfer(out, [{ ...into, ...change }])).toEqual({ kind: 'none' });
  });

  it('a row without an account never matches anything', () => {
    expect(matchTransfer({ ...out, accountId: null }, [into])).toEqual({ kind: 'none' });
  });

  it('never matches itself', () => {
    expect(matchTransfer(out, [out])).toEqual({ kind: 'none' });
  });
});

describe('pairKey', () => {
  it('is order-independent', () => {
    expect(pairKey('b', 'a')).toBe(pairKey('a', 'b'));
  });
});
