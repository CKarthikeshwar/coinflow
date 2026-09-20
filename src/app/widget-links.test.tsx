/**
 * The widget deep links (SPEC-implementation.md §43.3, IMP-092): `coinflow://add` and `coinflow://review[?open=]`
 * are redirect routes, so what matters is the sheet they open and where they send the user.
 */

import { render } from '@testing-library/react-native';

import AddRedirect from './add';
import ReviewRedirect from './review';

const mockOpen = jest.fn();
jest.mock('@/stores', () => ({ useSheetRegistry: { getState: () => ({ open: mockOpen }) } }));
const mockRedirect = jest.fn();
let mockParams: { open?: string } = {};
jest.mock('expo-router', () => ({
  Redirect: (props: { href: string }) => {
    mockRedirect(props.href);
    return null;
  },
  useLocalSearchParams: () => mockParams,
}));
let mockSuggestion: { id: string; status: string } | null = null;
jest.mock('@/db/repositories/suggestions', () => ({ getSuggestion: () => mockSuggestion }));

beforeEach(() => {
  mockOpen.mockClear();
  mockRedirect.mockClear();
  mockParams = {};
  mockSuggestion = null;
});

describe('coinflow://add', () => {
  it('goes Home and opens the Add sheet', async () => {
    await render(<AddRedirect />);
    expect(mockRedirect).toHaveBeenCalledWith('/');
    expect(mockOpen).toHaveBeenCalledWith('add', {});
  });
});

describe('coinflow://review', () => {
  it('without ?open just lands on the Review Queue', async () => {
    await render(<ReviewRedirect />);
    expect(mockRedirect).toHaveBeenCalledWith('/review-queue');
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it('with ?open=<id> of a pending suggestion opens its Confirmation sheet', async () => {
    mockParams = { open: 's1' };
    mockSuggestion = { id: 's1', status: 'pending' };
    await render(<ReviewRedirect />);
    expect(mockOpen).toHaveBeenCalledWith('confirm', { suggestionId: 's1' });
  });

  it('with a stale id (already confirmed, or gone) opens nothing — never a dead sheet', async () => {
    mockParams = { open: 's1' };
    mockSuggestion = { id: 's1', status: 'confirmed' };
    await render(<ReviewRedirect />);
    expect(mockOpen).not.toHaveBeenCalled();
    mockSuggestion = null;
    await render(<ReviewRedirect />);
    expect(mockOpen).not.toHaveBeenCalled();
    expect(mockRedirect).toHaveBeenCalledWith('/review-queue');
  });
});
