import { accountBalance, signed, totalBalance } from './balance';

const debit = (amountMinor: number) => ({ amountMinor, direction: 'debit' as const });
const credit = (amountMinor: number) => ({ amountMinor, direction: 'credit' as const });

describe('signed / accountBalance (D50)', () => {
  it('credit is +, debit is −', () => {
    expect(signed(credit(500))).toBe(500);
    expect(signed(debit(500))).toBe(-500);
  });

  it('no rows ⇒ ₹0, not unknown', () => {
    expect(accountBalance([])).toBe(0);
  });

  it('sums everything from zero, in any order', () => {
    expect(accountBalance([credit(10_000), debit(2_500), debit(500), credit(1_000)])).toBe(8_000);
    expect(accountBalance([debit(500), credit(1_000), debit(2_500), credit(10_000)])).toBe(8_000);
  });

  it('can be negative', () => {
    expect(accountBalance([debit(300)])).toBe(-300);
  });
});

describe('totalBalance — the complete total (D51)', () => {
  it('adds bank, wallet and cash accounts and counts them', () => {
    expect(
      totalBalance([
        { kind: 'bank', archived: false, balanceMinor: 10_000 },
        { kind: 'wallet', archived: false, balanceMinor: 500 },
        { kind: 'cash', archived: false, balanceMinor: -200 },
      ]),
    ).toEqual({ totalMinor: 10_300, accountCount: 3, unassignedMinor: 0 });
  });

  it('leaves cards out — they are not your money', () => {
    expect(
      totalBalance([
        { kind: 'bank', archived: false, balanceMinor: 10_000 },
        { kind: 'credit_card', archived: false, balanceMinor: -14_200 },
      ]),
    ).toEqual({ totalMinor: 10_000, accountCount: 1, unassignedMinor: 0 });
  });

  it('transactions with no account count in the total', () => {
    expect(totalBalance([{ kind: 'bank', archived: false, balanceMinor: -777_660 }], 962_370)).toEqual({
      totalMinor: 184_710,
      accountCount: 1,
      unassignedMinor: 962_370,
    });
  });

  it('with no accounts at all the total is just the unassigned rows', () => {
    expect(totalBalance([], -4_500)).toEqual({ totalMinor: -4_500, accountCount: 0, unassignedMinor: -4_500 });
  });

  it('an archived account still counts toward the total, but is not in "across N accounts"', () => {
    expect(
      totalBalance([
        { kind: 'bank', archived: false, balanceMinor: 100 },
        { kind: 'bank', archived: true, balanceMinor: 900 },
      ]),
    ).toEqual({ totalMinor: 1_000, accountCount: 1, unassignedMinor: 0 });
  });

  it('nothing at all ⇒ zero', () => {
    expect(totalBalance([])).toEqual({ totalMinor: 0, accountCount: 0, unassignedMinor: 0 });
  });
});
