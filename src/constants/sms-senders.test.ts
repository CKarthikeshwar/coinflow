import { isKnownSender } from './sms-senders';

describe('isKnownSender', () => {
  it('matches a DLT header id via the telco prefix + trailing suffix strip', () => {
    expect(isKnownSender('AD-HDFCBK-S')).toBe(true);
    expect(isKnownSender('VM-SBIINB-T')).toBe(true);
  });

  it('matches via prefix when the DLT core extends the seed entry', () => {
    expect(isKnownSender('JD-ICICIB-S')).toBe(true); // seed has 'ICICI'
    expect(isKnownSender('BZ-PAYTMB-T')).toBe(true); // seed has 'PAYTM'
  });

  it('matches a bare seed entry with no telco prefix/suffix', () => {
    expect(isKnownSender('GPAY')).toBe(true);
    expect(isKnownSender('CRED')).toBe(true);
  });

  it('rejects an unrecognised sender', () => {
    expect(isKnownSender('AD-DELIVR-S')).toBe(false);
    expect(isKnownSender('RANDOM-CO')).toBe(false);
  });

  it('rejects nullish / empty senders', () => {
    expect(isKnownSender(null)).toBe(false);
    expect(isKnownSender(undefined)).toBe(false);
    expect(isKnownSender('')).toBe(false);
  });
});
