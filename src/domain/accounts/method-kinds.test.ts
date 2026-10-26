import { accountFitsMethod, ACCOUNT_KINDS_FOR_METHOD, preselectAccount } from './method-kinds';

describe('ACCOUNT_KINDS_FOR_METHOD (§46.8)', () => {
  it('maps the five methods', () => {
    expect(ACCOUNT_KINDS_FOR_METHOD).toEqual({
      upi: ['bank'],
      bank_transfer: ['bank'],
      card: ['credit_card', 'bank'],
      wallet: ['wallet'],
      cash: ['cash'],
    });
  });

  it.each([
    ['bank', 'upi', true],
    ['bank', 'card', true],
    ['credit_card', 'card', true],
    ['credit_card', 'upi', false],
    ['wallet', 'cash', false],
    ['cash', 'cash', true],
    ['wallet', null, true],
  ] as const)('%s with %s → %s', (kind, method, fits) => {
    expect(accountFitsMethod(kind, method)).toBe(fits);
  });
});

describe('preselectAccount (UI-102)', () => {
  const accounts = [
    { id: 'sbi', kind: 'bank' as const },
    { id: 'hdfc', kind: 'bank' as const },
    { id: 'card', kind: 'credit_card' as const },
    { id: 'cash', kind: 'cash' as const },
  ];

  it('one fitting account is preselected', () => {
    expect(preselectAccount(accounts, 'cash', null)).toBe('cash');
  });

  it('several: the one last used with that method', () => {
    expect(preselectAccount(accounts, 'upi', 'hdfc')).toBe('hdfc');
    expect(preselectAccount(accounts, 'upi', null)).toBeNull();
  });

  it('a last-used account that no longer fits is ignored', () => {
    expect(preselectAccount(accounts, 'upi', 'card')).toBeNull();
  });

  it('none fitting', () => {
    expect(preselectAccount(accounts, 'wallet', null)).toBeNull();
  });
});
