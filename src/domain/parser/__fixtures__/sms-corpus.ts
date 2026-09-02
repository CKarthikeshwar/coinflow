/**
 * SMS parser test corpus — SPEC-implementation.md §23.6. Bodies are synthetic/anonymised
 * (no real names, VPAs, or reference numbers); amounts are realistic. This is the primary
 * unit-test asset and the acceptance bar for F1 — a mismatch here fails the build.
 *
 * Every `expected` value below was produced by running the real parser over the body and
 * hand-reviewing the result (not hand-derived from the regexes) — see IMPLEMENTATION-PROGRESS.md.
 */

import type { Direction, ParsedFields, ParseResult, ParseWarning } from '../types';

export type SmsFixture = {
  id: string;
  sender: string;
  body: string;
  receivedAt: number;
  expected: ParseResult;
};

const T = 1757000000000; // fixed sample timestamp — value itself is not under test

function ignored(reason: Extract<ParseResult, { kind: 'ignored' }>['reason']): ParseResult {
  return { kind: 'ignored', reason };
}

function tx(fields: ParsedFields, warnings: ParseWarning[] = []): ParseResult {
  return {
    kind: 'transaction',
    fields,
    parsedFlags: {
      amount: fields.amountMinor !== null,
      direction: fields.direction !== null,
      account: fields.account !== null,
      method: fields.paymentMethod !== null,
    },
    warnings,
  };
}

function fields(
  amountMinor: number | null,
  direction: Direction | null,
  account: string | null,
  normalizedKey: string | null,
  paymentMethod: ParsedFields['paymentMethod'],
): ParsedFields {
  return { amountMinor, direction, account, normalizedKey, paymentMethod, occurredAt: T };
}

export const smsCorpus: SmsFixture[] = [
  // --- Banks: debit + credit x UPI / card / IMPS-NEFT ------------------------------------
  {
    id: 'hdfc-debit-upi',
    sender: 'AD-HDFCBK-S',
    body: 'Rs.450.00 debited from A/c XX1234 to VPA merchant@okhdfcbank on 05-09-26. UPI Ref 402812345678. Not you? Call 18002586161',
    receivedAt: T,
    expected: tx(fields(45000, 'debit', 'merchant@okhdfcbank', 'merchant@okhdfcbank', 'upi')),
  },
  {
    id: 'hdfc-credit-upi',
    sender: 'VM-HDFCBK-T',
    body: 'Rs.1,200.00 credited to A/c XX1234 from friend@okhdfcbank UPI Ref 402899998888.',
    receivedAt: T,
    expected: tx(fields(120000, 'credit', 'friend@okhdfcbank', 'friend@okhdfcbank', 'upi')),
  },
  {
    id: 'sbi-debit-upi',
    sender: 'AD-SBIINB-S',
    body: 'Rs.320.50 debited from A/c XX5678 to VPA vendor@oksbi on 04-09-26. UPI Ref 501234567890.',
    receivedAt: T,
    expected: tx(fields(32050, 'debit', 'vendor@oksbi', 'vendor@oksbi', 'upi')),
  },
  {
    id: 'sbi-credit-imps',
    sender: 'VM-SBIINB-T',
    body: 'Rs.5,000.00 credited to A/c XX5678 via IMPS on 03-09-26. Ref 601122334455.',
    receivedAt: T,
    expected: tx(fields(500000, 'credit', null, null, 'bank_transfer')),
  },
  {
    id: 'icici-debit-card',
    sender: 'JD-ICICIB-S',
    body: 'INR 1,299.00 spent on ICICI Bank Card XX4433 at Store One on 04-09-26 Ref 998877.',
    receivedAt: T,
    expected: tx(fields(129900, 'debit', 'Store One', 'store one', 'card')),
  },
  {
    id: 'icici-credit-card',
    sender: 'JD-ICICIB-T',
    body: 'INR 250.00 refund of order 778899 credited on your ICICI Bank Card XX4433 at Store Two.',
    receivedAt: T,
    expected: tx(fields(25000, 'credit', 'Store Two', 'store two', 'card')),
  },
  {
    id: 'axis-debit-upi',
    sender: 'AD-AXISBK-S',
    body: 'Rs.899.00 debited from A/c XX9911 to VPA store@axisbank UPI Ref 701234567890.',
    receivedAt: T,
    expected: tx(fields(89900, 'debit', 'store@axisbank', 'store@axisbank', 'upi')),
  },
  {
    id: 'axis-credit-neft',
    sender: 'VM-AXISBK-T',
    body: 'Rs.15,000.00 credited to A/c XX9911 via NEFT on 02-09-26. Ref 801122334455.',
    receivedAt: T,
    expected: tx(fields(1500000, 'credit', null, null, 'bank_transfer')),
  },
  {
    id: 'kotak-debit-upi',
    sender: 'AD-KOTAKB-S',
    body: 'Rs.180.00 debited from A/c XX2211 to VPA canteen@okaxis UPI Ref 901234567890.',
    receivedAt: T,
    expected: tx(fields(18000, 'debit', 'canteen@okaxis', 'canteen@okaxis', 'upi')),
  },
  {
    id: 'kotak-credit-upi',
    sender: 'VM-KOTAKB-T',
    body: 'Rs.750.00 credited to A/c XX2211 from roommate@okaxis UPI Ref 911234567890.',
    receivedAt: T,
    expected: tx(fields(75000, 'credit', 'roommate@okaxis', 'roommate@okaxis', 'upi')),
  },
  {
    id: 'pnb-debit-imps',
    sender: 'AD-PNBSMS-S',
    body: 'Rs.2,500.00 debited from A/c XX3344 via IMPS on 01-09-26. Ref 121122334455.',
    receivedAt: T,
    expected: tx(fields(250000, 'debit', null, null, 'bank_transfer')),
  },
  {
    id: 'pnb-credit-upi',
    sender: 'VM-PNBSMS-T',
    body: 'Rs.600.00 credited to A/c XX3344 from client@okpnb UPI Ref 131234567890.',
    receivedAt: T,
    expected: tx(fields(60000, 'credit', 'client@okpnb', 'client@okpnb', 'upi')),
  },
  {
    id: 'bob-debit-upi',
    sender: 'AD-BOBTXN-S',
    body: 'Rs.99.00 debited from A/c XX7788 to VPA chai@okbob UPI Ref 141234567890.',
    receivedAt: T,
    expected: tx(fields(9900, 'debit', 'chai@okbob', 'chai@okbob', 'upi')),
  },
  {
    id: 'bob-credit-upi',
    sender: 'VM-BOBTXN-T',
    body: 'Rs.2,000.00 credited to A/c XX7788 from parent@okbob UPI Ref 151234567890.',
    receivedAt: T,
    expected: tx(fields(200000, 'credit', 'parent@okbob', 'parent@okbob', 'upi')),
  },

  // --- UPI apps ----------------------------------------------------------------------------
  {
    id: 'gpay-debit',
    sender: 'GPAY',
    body: 'Rs.220.00 paid to grocery@okicici via Google Pay UPI Ref 161234567890.',
    receivedAt: T,
    expected: tx(fields(22000, 'debit', 'grocery@okicici', 'grocery@okicici', 'upi')),
  },
  {
    id: 'phonepe-debit',
    sender: 'AX-PHONPE-S',
    body: 'Rs.75.00 paid to auto@ybl via PhonePe UPI Ref 171234567890.',
    receivedAt: T,
    expected: tx(fields(7500, 'debit', 'auto@ybl', 'auto@ybl', 'upi')),
  },
  {
    id: 'paytm-credit',
    sender: 'BZ-PAYTMB-T',
    body: 'Rs.500.00 added to your Paytm Wallet from bank@paytm UPI Ref 181234567890.',
    receivedAt: T,
    expected: tx(fields(50000, 'credit', 'bank@paytm', 'bank@paytm', 'upi')),
  },
  {
    id: 'cred-debit',
    sender: 'CRED',
    body: 'Rs.3,200.00 paid to billpay@cred UPI Ref 191234567890.',
    receivedAt: T,
    expected: tx(fields(320000, 'debit', 'billpay@cred', 'billpay@cred', 'upi')),
  },
  {
    id: 'amazonpay-debit',
    sender: 'AD-AMZNPY-S',
    body: 'Rs.410.00 debited from Amazon Pay Balance to VPA seller@apl UPI Ref 201234567890.',
    receivedAt: T,
    expected: tx(fields(41000, 'debit', 'seller@apl', 'seller@apl', 'upi')),
  },

  // --- Ignore gate x2 each -------------------------------------------------------------------
  {
    id: 'otp-1',
    sender: 'AD-HDFCBK-S',
    body: '453298 is your OTP for the transaction of Rs.4,500.00. Do not share this OTP with anyone.',
    receivedAt: T,
    expected: ignored('otp'),
  },
  {
    id: 'otp-2',
    sender: 'VM-SBIINB-T',
    body: 'Your OTP for login is 118322. Verification code valid for 10 minutes.',
    receivedAt: T,
    expected: ignored('otp'),
  },
  {
    id: 'promo-1',
    sender: 'AD-HDFCBK-S',
    body: 'Special offer! Get cashback up to Rs.500 on your next transaction. Apply now.',
    receivedAt: T,
    expected: ignored('promo'),
  },
  {
    id: 'promo-2',
    sender: 'VM-AXISBK-T',
    body: 'You are pre-approved for a personal loan up to Rs.5,00,000 at low EMI option. Check now: http://axb.in/loan',
    receivedAt: T,
    expected: ignored('promo'),
  },
  {
    id: 'balance-only-1',
    sender: 'AD-SBIINB-S',
    body: 'Your A/c XX5678 Avl Bal is Rs.12,340.00 as of 05-09-26.',
    receivedAt: T,
    expected: ignored('balance-only'),
  },
  {
    id: 'balance-only-2',
    sender: 'VM-KOTAKB-T',
    body: 'Available balance in A/c XX2211 is Rs.7,650.00.',
    receivedAt: T,
    expected: ignored('balance-only'),
  },
  {
    id: 'request-money-1',
    sender: 'AD-PAYTM-S',
    body: 'friend@paytm is requesting Rs.300.00 from you via Paytm. Approve in the app.',
    receivedAt: T,
    expected: ignored('request-money'),
  },
  {
    id: 'request-money-2',
    sender: 'AD-PHONPE-S',
    body: 'You have a collect request for Rs.150.00 from vendor@ybl. Your account will be debited if you approve.',
    receivedAt: T,
    expected: ignored('request-money'),
  },
  {
    id: 'foreign-currency-1',
    sender: 'AD-ICICIB-S',
    body: 'USD 45.00 spent on ICICI Bank Card XX4433 at Overseas Store on 04-09-26.',
    receivedAt: T,
    expected: ignored('foreign-currency'),
  },
  {
    id: 'foreign-currency-2',
    sender: 'AD-AXISBK-S',
    body: '$120.00 charged on Axis Bank Card XX9911 at Foreign Merchant.',
    receivedAt: T,
    expected: ignored('foreign-currency'),
  },
  {
    id: 'not-yet-settled-1',
    sender: 'AD-HDFCBK-S',
    body: 'Rs.900.00 will be credited to your A/c XX1234 within 2 working days.',
    receivedAt: T,
    expected: ignored('not-yet-settled'),
  },
  {
    id: 'not-yet-settled-2',
    sender: 'VM-SBIINB-T',
    body: 'Your refund of Rs.450.00 has been initiated and is pending confirmation.',
    receivedAt: T,
    expected: ignored('not-yet-settled'),
  },
  {
    id: 'sender-1',
    sender: 'AD-DELIVR-S',
    body: 'Rs.450.00 debited from A/c XX1234 to VPA merchant@okhdfcbank UPI Ref 402812345678.',
    receivedAt: T,
    expected: ignored('sender'),
  },
  {
    id: 'sender-2',
    sender: 'TX-RANDOM',
    body: 'Rs.200.00 credited to your wallet.',
    receivedAt: T,
    expected: ignored('sender'),
  },

  // --- Partial parses --------------------------------------------------------------------
  {
    id: 'partial-amount-only',
    sender: 'AD-HDFCBK-S',
    body: 'Transaction of Rs.680.00 processed successfully. Ref 251234567890.',
    receivedAt: T,
    expected: tx(fields(68000, null, null, null, null)),
  },
  {
    id: 'partial-direction-only',
    sender: 'VM-SBIINB-T',
    body: 'Your account was debited. Scheduled payment processed successfully.',
    receivedAt: T,
    expected: tx(fields(null, 'debit', null, null, null)),
  },
  {
    id: 'partial-no-account',
    sender: 'AD-AXISBK-S',
    body: 'Rs.325.00 debited from A/c XX9911 on 05-09-26. UPI Ref 261234567890.',
    receivedAt: T,
    expected: tx(fields(32500, 'debit', null, null, 'upi')),
  },

  // --- Hard shapes -------------------------------------------------------------------------
  {
    id: 'hard-two-amounts',
    sender: 'AD-ICICIB-S',
    body: 'INR 1,500.00 spent on ICICI Bank Card XX4433 at Store Three. Available limit INR 48,500.00.',
    receivedAt: T,
    expected: tx(fields(150000, 'debit', 'Store Three', 'store three', 'card')),
  },
  {
    id: 'hard-rs-vs-inr-vs-symbol',
    sender: 'AD-KOTAKB-S',
    body: '₹540.00 debited from A/c XX2211 to VPA shop@okaxis UPI Ref 271234567890.',
    receivedAt: T,
    expected: tx(fields(54000, 'debit', 'shop@okaxis', 'shop@okaxis', 'upi')),
  },
  {
    id: 'hard-paise-present',
    sender: 'AD-PNBSMS-S',
    body: 'Rs.99.99 debited from A/c XX3344 to VPA snacks@okpnb UPI Ref 281234567890.',
    receivedAt: T,
    expected: tx(fields(9999, 'debit', 'snacks@okpnb', 'snacks@okpnb', 'upi')),
  },
  {
    id: 'hard-lakh-grouping',
    sender: 'VM-AXISBK-T',
    body: 'Rs.1,25,000.00 credited to A/c XX9911 via NEFT on 05-09-26. Ref 291234567890.',
    receivedAt: T,
    expected: tx(fields(12500000, 'credit', null, null, 'bank_transfer')),
  },
  {
    id: 'hard-multiline',
    sender: 'AD-HDFCBK-S',
    body: 'Rs.450.00 debited\nfrom A/c XX1234\nto VPA merchant@okhdfcbank\nUPI Ref 402812345678.',
    receivedAt: T,
    expected: tx(fields(45000, 'debit', 'merchant@okhdfcbank', 'merchant@okhdfcbank', 'upi')),
  },
  {
    id: 'hard-trailing-marketing',
    sender: 'AD-SBIINB-S',
    body: 'Rs.310.00 debited from A/c XX5678 to VPA store@oksbi UPI Ref 301234567890. Download YONO SBI for more offers!',
    receivedAt: T,
    expected: tx(fields(31000, 'debit', 'store@oksbi', 'store@oksbi', 'upi')),
  },

  // --- Warnings (not in the §23.6 required list, but part of the ParseResult contract) -----
  {
    id: 'warning-amount-out-of-range',
    sender: 'AD-HDFCBK-S',
    body: 'Rs.2,00,00,000.00 debited from A/c XX1234 to VPA merchant@okhdfcbank UPI Ref 321234567890.',
    receivedAt: T,
    expected: tx(
      fields(2000000000, 'debit', 'merchant@okhdfcbank', 'merchant@okhdfcbank', 'upi'),
      ['amountOutOfRange'],
    ),
  },
  {
    // Constructed tie, not a realistic message: "dr"/"cr" placed equidistant from the amount
    // so neither wins the nearest-keyword tie-break (§23.4).
    id: 'warning-ambiguous-direction',
    sender: 'AD-HDFCBK-S',
    body: 'dr ₹1 cr on A/c XX1234 Ref 351234567890.',
    receivedAt: T,
    expected: tx(fields(100, null, null, null, 'card'), ['ambiguousDirection']),
  },
];
