/**
 * Ignore gate — SPEC-implementation.md §23.3. Ordered checks on the whitespace-collapsed body;
 * first hit wins. Runs before extraction so a promo mentioning `₹500` never becomes a Suggestion.
 */

import { AMOUNT_SOURCE, CREDIT_KEYWORDS_SOURCE, DEBIT_KEYWORDS_SOURCE } from './extract';
import type { IgnoreReason } from './types';

const OTP_RE = /\botp\b|one[- ]time password|verification code|do not share|\b\d{4,8}\b\s+is your/i;

const PROMO_RE =
  /\boffer\b|cashback up to|apply now|pre-?approved|\bloan\b|emi option|\bsale\b|discount/i;
const URL_RE = /https?:\/\/\S+|www\.\S+/i;

const BALANCE_ONLY_RE = /avl bal|available balance|a\/c balance/i;

const REQUEST_MONEY_RE = /requesting|collect request|has requested|payment request|debited if you approve/i;

const FOREIGN_CURRENCY_RE = /\b(usd|eur|gbp|aed|sgd)\b|[$€£]/i;

const NOT_YET_SETTLED_RE = /will be credited|has been initiated|is pending|on hold/i;

function hasDirectionKeyword(body: string): boolean {
  return new RegExp(DEBIT_KEYWORDS_SOURCE, 'i').test(body) || new RegExp(CREDIT_KEYWORDS_SOURCE, 'i').test(body);
}

function hasInrAmount(body: string): boolean {
  return new RegExp(AMOUNT_SOURCE, 'i').test(body);
}

function isPromo(body: string): boolean {
  if (PROMO_RE.test(body)) return true;
  return URL_RE.test(body) && !hasDirectionKeyword(body);
}

function isBalanceOnly(body: string): boolean {
  return BALANCE_ONLY_RE.test(body) && !hasDirectionKeyword(body);
}

function isForeignCurrency(body: string): boolean {
  return FOREIGN_CURRENCY_RE.test(body) && !hasInrAmount(body);
}

export function checkIgnoreGate(body: string): IgnoreReason | null {
  if (OTP_RE.test(body)) return 'otp';
  if (isPromo(body)) return 'promo';
  if (isBalanceOnly(body)) return 'balance-only';
  if (REQUEST_MONEY_RE.test(body)) return 'request-money';
  if (isForeignCurrency(body)) return 'foreign-currency';
  if (NOT_YET_SETTLED_RE.test(body)) return 'not-yet-settled';
  return null;
}
