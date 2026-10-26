import { bankFromSms, bankKeyFromSender, bankShortName, defaultNickname, matchKey, senderCore } from './account-key';

describe('senderCore', () => {
  it('strips the telco prefix and a one-letter suffix', () => {
    expect(senderCore('AX-HDFCBK-S')).toBe('HDFCBK');
    expect(senderCore('vm-sbiinb-t')).toBe('SBIINB');
    expect(senderCore('JD-ICICIB-G')).toBe('ICICIB');
    expect(senderCore('GPAY')).toBe('GPAY');
  });
});

describe('bankKeyFromSender (§46.3)', () => {
  it.each([
    ['AD-HDFCBK-S', 'hdfc'],
    ['VM-HDFCBN-T', 'hdfc'],
    ['AD-SBIINB-S', 'sbi'],
    ['AD-SBIPSG-S', 'sbi'],
    ['AD-SBIUPI-S', 'sbi'],
    ['AD-CBSSBI-S', 'sbi'],
    ['JD-ICICIB-S', 'icici'],
    ['AD-AXISBK-S', 'axis'],
    ['VM-KOTAKB-T', 'kotak'],
    ['AX-CANBNK-S', 'canara'],
    ['AD-PNBSMS-S', 'pnb'],
    ['AD-BOBTXN-S', 'bob'],
  ])('%s → %s', (sender, key) => {
    expect(bankKeyFromSender(sender)).toBe(key);
  });

  it('an unknown header becomes its own lower-cased key', () => {
    expect(bankKeyFromSender('AD-ABCBNK-S')).toBe('abcbnk');
    expect(bankFromSms('AD-ABCBNK-S', '')).toEqual({ bankKey: 'abcbnk', bankName: null });
  });
});

describe('bankFromSms — payment apps', () => {
  it('reads the bank from the body for an app sender', () => {
    expect(bankFromSms('GPAY', 'paid from your HDFC Bank A/c XX1234')).toEqual({ bankKey: 'hdfc', bankName: 'HDFC Bank' });
    expect(bankFromSms('AX-PHONPE-S', 'debited from State Bank a/c XX1')).toMatchObject({ bankKey: 'sbi' });
  });

  it('never invents an account named after the app', () => {
    // the payee's VPA ("@okicici") says nothing about YOUR bank
    expect(bankFromSms('GPAY', 'Rs.220.00 paid to grocery@okicici via Google Pay')).toBeNull();
    expect(bankFromSms('CRED', 'Rs.3,200.00 paid to billpay@cred')).toBeNull();
    expect(bankFromSms('BZ-PAYTMB-T', 'added to your Paytm Wallet')).toBeNull();
  });
});

describe('matchKey / labels', () => {
  it('builds bankKey:last4', () => {
    expect(matchKey('hdfc', '672')).toBe('hdfc:672');
  });

  it('names an account "HDFC ··672"', () => {
    expect(defaultNickname('hdfc', '672')).toBe('HDFC ··672');
    expect(defaultNickname('abcbnk', '12')).toBe('ABCBNK ··12');
    expect(defaultNickname(null, '12')).toBe('··12');
    expect(defaultNickname(null, null)).toBe('Account');
    expect(bankShortName('sbi')).toBe('SBI');
  });
});
