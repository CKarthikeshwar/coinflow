import { looksLikeCardBillPayment } from './card-bill';

describe('looksLikeCardBillPayment (§46.3, UI-108)', () => {
  it('finds a payment towards one of your cards', () => {
    expect(
      looksLikeCardBillPayment('Rs.14,200.00 debited from A/c XX5678 towards HDFC Bank Credit Card XX4321 payment on 25-10-26.', ['4321']),
    ).toBe('4321');
    expect(looksLikeCardBillPayment('Card bill payment of Rs 500 for card ending 4321 received', ['4321'])).toBe('4321');
    expect(looksLikeCardBillPayment('CC payment Rs 900 to card *4321 done', ['4321'])).toBe('4321');
  });

  it('needs the card to be one of yours', () => {
    expect(looksLikeCardBillPayment('debited towards HDFC Credit Card XX9999', ['4321'])).toBeNull();
    expect(looksLikeCardBillPayment('debited towards HDFC Credit Card XX4321', [])).toBeNull();
  });

  it('a card spend is not a bill payment', () => {
    expect(looksLikeCardBillPayment('Rs.2,340.00 spent on HDFC Bank Credit Card XX4321 at BIGBASKET', ['4321'])).toBeNull();
  });
});
