import { useToast } from '@/stores/toast';

import { settleAndAnnounce, settleMessage } from './settle-and-announce';

const mockSettle = jest.fn();
const mockUnsettle = jest.fn();
jest.mock('@/db/repositories/settlements', () => ({
  settle: (...a: unknown[]) => mockSettle(...a),
  unsettle: (...a: unknown[]) => mockUnsettle(...a),
}));

beforeEach(() => {
  mockSettle.mockReset();
  mockUnsettle.mockReset();
  useToast.getState().clear();
});
afterEach(() => useToast.getState().clear());

describe('settleMessage', () => {
  it('names one person, counts several, and words a request payment as "Paid"', () => {
    expect(settleMessage('share', ['Rahul'], 45_000)).toBe('Settled Rahul’s share — ₹450');
    expect(settleMessage('share', ['Rahul', 'Priya'], 90_000)).toBe('Settled 2 shares — ₹900');
    expect(settleMessage('request', ['Priya'], 12_050)).toBe('Paid Priya’s request — ₹120.50');
    expect(settleMessage('request', ['A', 'B', 'C'], 10_000)).toBe('Paid 3 requests — ₹100');
  });
});

describe('settleAndAnnounce', () => {
  const input = { transactionId: 't1', picks: [{ shareId: 'sh-1' }] };

  it('settles, shows the snackbar with Undo, and returns the created ids', () => {
    mockSettle.mockReturnValue([{ id: 'st-1', shareId: 'sh-1', requestId: null, amountMinor: 45_000 }]);
    const ids = settleAndAnnounce(input, 'share', new Map([['sh-1', 'Rahul']]));
    expect(ids).toEqual(['st-1']);
    expect(mockSettle).toHaveBeenCalledWith(input);
    expect(useToast.getState().message).toBe('Settled Rahul’s share — ₹450');
    expect(useToast.getState().action?.label).toBe('Undo');
  });

  it('Undo deletes exactly the settlements it created and clears the snackbar (IMP-083)', () => {
    mockSettle.mockReturnValue([
      { id: 'st-1', shareId: 'sh-1', requestId: null, amountMinor: 100 },
      { id: 'st-2', shareId: 'sh-2', requestId: null, amountMinor: 200 },
    ]);
    settleAndAnnounce(input, 'share', new Map());
    useToast.getState().action?.onPress();
    expect(mockUnsettle).toHaveBeenCalledWith(['st-1', 'st-2']);
    expect(useToast.getState().message).toBeNull();
  });

  it('keeps the Undo snackbar up for 5 s, not the default 3 s (missed on a real phone)', () => {
    jest.useFakeTimers();
    try {
      mockSettle.mockReturnValue([{ id: 'st-1', shareId: 'sh-1', requestId: null, amountMinor: 100 }]);
      settleAndAnnounce(input, 'share', new Map());
      jest.advanceTimersByTime(4000);
      expect(useToast.getState().message).not.toBeNull();
      jest.advanceTimersByTime(1100);
      expect(useToast.getState().message).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('a failed settle says so and returns null', () => {
    mockSettle.mockImplementation(() => {
      throw new RangeError('nothing to settle');
    });
    expect(settleAndAnnounce(input, 'share', new Map())).toBeNull();
    expect(useToast.getState().message).toBe('Could not settle that');
  });
});
