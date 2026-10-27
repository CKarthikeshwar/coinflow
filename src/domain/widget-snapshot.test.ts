import { buildWidgetAccounts, buildWidgetSnapshot, WIDGET_SNAPSHOT_MAX_ITEMS } from './widget-snapshot';

const PERIOD = { startMs: 1_000, endMsExclusive: 2_000, label: 'September' };

describe('buildWidgetSnapshot (§44.2 schema v1)', () => {
  it('carries the period, the effective figures and hideAmounts straight through', () => {
    const s = buildWidgetSnapshot({
      now: 5_000,
      period: PERIOD,
      incomeMinor: 150_000,
      spentMinor: 200_000,
      balanceMinor: -50_000,
      pendingSuggestions: [],
      hideAmounts: true,
    });
    expect(s).toEqual({
      v: 1,
      updatedAt: 5_000,
      periodStartMs: 1_000,
      periodEndMs: 2_000,
      periodLabel: 'September',
      incomeMinor: 150_000,
      spentMinor: 200_000,
      balanceMinor: -50_000,
      pending: { count: 0, items: [] },
      hideAmounts: true,
      accounts: { totalMinor: 0, knownCount: 0, updatedAt: 0, items: [] },
    });
  });

  it('defaults updatedAt to now when omitted', () => {
    const before = Date.now();
    const s = buildWidgetSnapshot({ period: PERIOD, incomeMinor: 0, spentMinor: 0, balanceMinor: 0, pendingSuggestions: [], hideAmounts: false });
    expect(s.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it('keeps at most 3 items but reports the full count, and never re-sorts (already newest-first in)', () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ id: `s${i}`, amountMinor: 100 * (i + 1), direction: 'debit' as const, account: `Acc${i}` }));
    const s = buildWidgetSnapshot({ period: PERIOD, incomeMinor: 0, spentMinor: 0, balanceMinor: 0, pendingSuggestions: rows, hideAmounts: false });
    expect(s.pending.count).toBe(5);
    expect(s.pending.items).toHaveLength(WIDGET_SNAPSHOT_MAX_ITEMS);
    expect(s.pending.items.map((i) => i.id)).toEqual(['s0', 's1', 's2']);
  });

  it('skips a partial-parse suggestion (no amount/direction) as a row, but still counts it', () => {
    const rows = [
      { id: 's1', amountMinor: null, direction: null, account: 'Unknown sender' },
      { id: 's2', amountMinor: 200, direction: 'credit' as const, account: 'Salary' },
    ];
    const s = buildWidgetSnapshot({ period: PERIOD, incomeMinor: 0, spentMinor: 0, balanceMinor: 0, pendingSuggestions: rows, hideAmounts: false });
    expect(s.pending.count).toBe(2);
    expect(s.pending.items.map((i) => i.id)).toEqual(['s2']);
  });

  it('falls back to "Unknown" when a valid row has no account text', () => {
    const rows = [{ id: 's1', amountMinor: 100, direction: 'debit' as const, account: null }, { id: 's2', amountMinor: 100, direction: 'debit' as const, account: '   ' }];
    const s = buildWidgetSnapshot({ period: PERIOD, incomeMinor: 0, spentMinor: 0, balanceMinor: 0, pendingSuggestions: rows, hideAmounts: false });
    expect(s.pending.items.every((i) => i.label === 'Unknown')).toBe(true);
  });

  it('a partial-parse row further down the list does not consume one of the 3 item slots', () => {
    const rows = [
      { id: 's1', amountMinor: 100, direction: 'debit' as const, account: 'A' },
      { id: 's2', amountMinor: null, direction: null, account: null },
      { id: 's3', amountMinor: 100, direction: 'debit' as const, account: 'C' },
      { id: 's4', amountMinor: 100, direction: 'debit' as const, account: 'D' },
    ];
    const s = buildWidgetSnapshot({ period: PERIOD, incomeMinor: 0, spentMinor: 0, balanceMinor: 0, pendingSuggestions: rows, hideAmounts: false });
    expect(s.pending.items.map((i) => i.id)).toEqual(['s1', 's3', 's4']);
  });
});


describe('buildWidgetAccounts (CR-34, §46.10)', () => {
  const a = (id: string, kind: 'bank' | 'credit_card' | 'wallet' | 'cash', balanceMinor: number, archived = false) => ({
    id, nickname: id, kind, archived, balanceMinor,
  });

  it('total of bank / wallet / cash (archived too); ≤ 3 live rows, largest first; cards left out; no age on anything (CR-41, D51)', () => {
    expect(
      buildWidgetAccounts([
        a('sbi', 'bank', 50_000),
        a('hdfc', 'bank', 120_000),
        a('paytm', 'wallet', 2_000),
        a('cash', 'cash', 9_000),
        a('card', 'credit_card', -1_000_000),
        a('old', 'bank', 7, true),
        a('empty', 'bank', 0),
      ]),
    ).toEqual({
      totalMinor: 181_007, // the archived account's 7 paise are still yours
      knownCount: 5,
      updatedAt: 0,
      items: [
        { id: 'hdfc', nickname: 'hdfc', balanceMinor: 120_000, asOf: 0 },
        { id: 'sbi', nickname: 'sbi', balanceMinor: 50_000, asOf: 0 },
        { id: 'cash', nickname: 'cash', balanceMinor: 9_000, asOf: 0 },
      ],
    });
  });

  it('transactions with no account are part of the total (D51)', () => {
    expect(buildWidgetAccounts([a('hdfc', 'bank', -777_660)], 962_370)).toMatchObject({ totalMinor: 184_710, knownCount: 1 });
    expect(buildWidgetAccounts([], -500)).toMatchObject({ totalMinor: -500, knownCount: 0, items: [] });
  });

  it('an account with nothing recorded counts at ₹0 (it is not "unknown")', () => {
    expect(buildWidgetAccounts([a('new', 'bank', 0)])).toMatchObject({ totalMinor: 0, knownCount: 1 });
  });

  it('keeps v at 1 — the native store rejects any other version', () => {
    const s = buildWidgetSnapshot({ period: PERIOD, incomeMinor: 0, spentMinor: 0, balanceMinor: 0, pendingSuggestions: [], hideAmounts: false, accounts: [a('x', 'bank', 1)] });
    expect(s.v).toBe(1);
    expect(s.accounts.knownCount).toBe(1);
  });
});
