import { fireEvent, render } from '@testing-library/react-native';

import type { Suggestion } from '@/db/schema';

import { SuggestionCard } from './suggestion-card';

function suggestion(overrides: Partial<Suggestion> = {}): Suggestion {
  return {
    id: 'sug-1',
    amountMinor: 45000,
    direction: 'debit',
    occurredAt: 1_700_000_000_000,
    account: 'Swiggy',
    normalizedKey: 'swiggy',
    paymentMethod: 'upi',
    smsSender: 'AD-HDFCBK-S',
    smsReceivedAt: Date.now() - 5 * 60_000,
    dedupeKey: 'dedupe-1',
    status: 'pending',
    confirmedTransactionId: null,
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

describe('SuggestionCard', () => {
  it('shows the signed amount and a payment descriptor', async () => {
    const { getByText } = await render(
      <SuggestionCard suggestion={suggestion()} known={false} onOpen={jest.fn()} onDismiss={jest.fn()} />,
    );
    expect(getByText('+ ₹450')).toBeTruthy();
    expect(getByText(/UPI payment/)).toBeTruthy();
  });

  it('shows an inline Save button only when known', async () => {
    const { getByText } = await render(
      <SuggestionCard suggestion={suggestion()} known onOpen={jest.fn()} onSave={jest.fn()} onDismiss={jest.fn()} />,
    );
    expect(getByText('Save')).toBeTruthy();
  });

  it('has no Save button when not known, even if onSave is provided', async () => {
    const { queryByText } = await render(
      <SuggestionCard suggestion={suggestion()} known={false} onOpen={jest.fn()} onSave={jest.fn()} onDismiss={jest.fn()} />,
    );
    expect(queryByText('Save')).toBeNull();
  });

  it('calls onOpen when the card body is pressed', async () => {
    const onOpen = jest.fn();
    const { getByText } = await render(
      <SuggestionCard suggestion={suggestion()} known={false} onOpen={onOpen} onDismiss={jest.fn()} />,
    );
    fireEvent.press(getByText('+ ₹450'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('calls onSave when Save is pressed, not onOpen', async () => {
    const onOpen = jest.fn();
    const onSave = jest.fn();
    const { getByText } = await render(
      <SuggestionCard suggestion={suggestion()} known onOpen={onOpen} onSave={onSave} onDismiss={jest.fn()} />,
    );
    fireEvent.press(getByText('Save'));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('calls onDismiss when the overflow button is pressed', async () => {
    const onDismiss = jest.fn();
    const { getByLabelText } = await render(
      <SuggestionCard suggestion={suggestion()} known={false} onOpen={jest.fn()} onDismiss={onDismiss} />,
    );
    fireEvent.press(getByLabelText('Dismiss'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('shows a dash when the amount is unparsed', async () => {
    const { getByText } = await render(
      <SuggestionCard suggestion={suggestion({ amountMinor: null })} known={false} onOpen={jest.fn()} onDismiss={jest.fn()} />,
    );
    expect(getByText('—')).toBeTruthy();
  });
});
