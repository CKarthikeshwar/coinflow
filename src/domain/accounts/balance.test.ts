import { currentBalance, isStale, STALE_BALANCE_MS, totalBalance, type BalanceSnapshot } from './balance';
import { findDiscrepancies, RECONCILE_MAX_GAP_MS } from './reconcile';

const snap = (id: string, balanceMinor: number, asOf: number, acknowledgedAt: number | null = null): BalanceSnapshot => ({
  id,
  balanceMinor,
  asOf,
  acknowledgedAt,
});
const debit = (amountMinor: number, occurredAt: number) => ({ amountMinor, direction: 'debit' as const, occurredAt });
const credit = (amountMinor: number, occurredAt: number) => ({ amountMinor, direction: 'credit' as const, occurredAt });

describe('currentBalance (D44)', () => {
  it('no snapshot ⇒ unknown, never 0', () => {
    expect(currentBalance([], [debit(100, 5)])).toBeNull();
  });

  it('newest snapshot + rows after it; the row the SMS itself reported (same instant) is already in the figure', () => {
    const snaps = [snap('a', 10_000, 10), snap('b', 8_000, 20)];
    const rows = [debit(2_000, 20), debit(500, 30), credit(1_500, 40), debit(9_999, 5)];
    expect(currentBalance(snaps, rows)).toEqual({ balanceMinor: 9_000, asOf: 20 });
  });

  it('an older snapshot arriving late never becomes current', () => {
    expect(currentBalance([snap('new', 5_000, 50), snap('late', 1, 10)], [])).toEqual({ balanceMinor: 5_000, asOf: 50 });
  });

  it('zero and negative (overdraft) are real figures', () => {
    expect(currentBalance([snap('a', 0, 1)], [debit(300, 2)])?.balanceMinor).toBe(-300);
  });
});

describe('totalBalance (UI-103)', () => {
  it('sums bank / wallet / cash with a known figure; cards are credit available, archived is out', () => {
    expect(
      totalBalance([
        { kind: 'bank', archived: false, balance: { balanceMinor: 50_000, asOf: 100 } },
        { kind: 'wallet', archived: false, balance: { balanceMinor: 2_000, asOf: 40 } },
        { kind: 'cash', archived: false, balance: null },
        { kind: 'credit_card', archived: false, balance: { balanceMinor: 120_000, asOf: 90 } },
        { kind: 'bank', archived: true, balance: { balanceMinor: 1, asOf: 1 } },
      ]),
    ).toEqual({ totalMinor: 52_000, knownCount: 2, unknownCount: 1, oldestAsOf: 40, creditAvailableMinor: 120_000 });
  });

  it('nothing known', () => {
    expect(totalBalance([{ kind: 'bank', archived: false, balance: null }])).toEqual({
      totalMinor: 0,
      knownCount: 0,
      unknownCount: 1,
      oldestAsOf: null,
      creditAvailableMinor: null,
    });
  });
});

describe('isStale', () => {
  it('after three days', () => {
    expect(isStale(0, STALE_BALANCE_MS)).toBe(false);
    expect(isStale(0, STALE_BALANCE_MS + 1)).toBe(true);
  });
});

describe('findDiscrepancies (UI-107)', () => {
  const DAY = 86_400_000;

  it('explained by the rows ⇒ nothing', () => {
    expect(findDiscrepancies([snap('a', 10_000, 0), snap('b', 7_000, DAY)], [debit(3_000, DAY)])).toEqual([]);
  });

  it('money left that is not recorded', () => {
    expect(findDiscrepancies([snap('a', 10_000, 0), snap('b', 7_000, DAY)], [debit(1_800, DAY / 2)])).toEqual([
      { snapshotId: 'b', fromAsOf: 0, toAsOf: DAY, diffMinor: -1_200 },
    ]);
  });

  it('money that arrived unrecorded is positive', () => {
    expect(findDiscrepancies([snap('a', 0, 0), snap('b', 5_000, DAY)], [])[0].diffMinor).toBe(5_000);
  });

  it('out-of-order input is ordered by asOf', () => {
    expect(findDiscrepancies([snap('b', 7_000, DAY), snap('a', 10_000, 0)], [debit(3_000, DAY)])).toEqual([]);
  });

  it('a late transaction clears it — derived, nothing stored', () => {
    const snaps = [snap('a', 10_000, 0), snap('b', 7_000, DAY)];
    expect(findDiscrepancies(snaps, [])).toHaveLength(1);
    expect(findDiscrepancies(snaps, [debit(3_000, DAY / 3)])).toEqual([]);
  });

  it('tolerance edge: ₹1 is fine, ₹1.01 is not', () => {
    expect(findDiscrepancies([snap('a', 10_000, 0), snap('b', 9_900, DAY)], [])).toEqual([]);
    expect(findDiscrepancies([snap('a', 10_000, 0), snap('b', 9_899, DAY)], [])).toHaveLength(1);
  });

  it('"It\'s fine" hides it', () => {
    expect(findDiscrepancies([snap('a', 10_000, 0), snap('b', 1, DAY, 123)], [])).toEqual([]);
  });

  it('pairs more than 30 days apart are skipped', () => {
    expect(findDiscrepancies([snap('a', 10_000, 0), snap('b', 1, RECONCILE_MAX_GAP_MS + 1)], [])).toEqual([]);
  });

  it('only the newest 10 pairs are looked at', () => {
    const snaps = Array.from({ length: 13 }, (_v, i) => snap(`s${i}`, i === 1 ? 999_999 : 0, i * DAY));
    // 13 snapshots = 12 pairs; s1 is off, but its two pairs (s0,s1) and (s1,s2) are the oldest two — not looked at
    expect(findDiscrepancies(snaps, [])).toEqual([]);
  });
});
