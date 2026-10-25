/**
 * Cold-start widget links (SPEC-implementation.md §43.3, IMP-092): `WidgetLinkRouter` reads
 * `Linking.getInitialURL()` itself and drives the same `router`/`useSheetRegistry` actions
 * `src/app/add.tsx` / `src/app/review.tsx` use for a warm tap — see that file's header for why.
 */

import { render } from '@testing-library/react-native';

import { WidgetLinkRouter } from './widget-link-router';

const mockOpen = jest.fn();
jest.mock('@/stores', () => ({ useSheetRegistry: { getState: () => ({ open: mockOpen }) } }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));
let mockSuggestion: { id: string; status: string } | null = null;
jest.mock('@/db/repositories/suggestions', () => ({ getSuggestion: () => mockSuggestion }));

let mockInitialUrl: string | null = null;
jest.mock('expo-linking', () => ({
  getInitialURL: () => Promise.resolve(mockInitialUrl),
  parse: (url: string) => {
    const u = new URL(url);
    const queryParams: Record<string, string> = {};
    u.searchParams.forEach((v, k) => {
      queryParams[k] = v;
    });
    return { hostname: u.hostname || null, path: null, queryParams };
  },
}));

beforeEach(() => {
  mockOpen.mockClear();
  mockPush.mockClear();
  mockSuggestion = null;
  mockInitialUrl = null;
});

describe('WidgetLinkRouter cold start', () => {
  it('no initial URL — does nothing', async () => {
    await render(<WidgetLinkRouter />);
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it('coinflow:// (Summary root) — no extra routing needed', async () => {
    mockInitialUrl = 'coinflow://';
    await render(<WidgetLinkRouter />);
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it('coinflow://add — goes Home and opens the Add sheet', async () => {
    mockInitialUrl = 'coinflow://add';
    await render(<WidgetLinkRouter />);
    expect(mockPush).toHaveBeenCalledWith('/');
    expect(mockOpen).toHaveBeenCalledWith('add', {});
  });

  it('coinflow://review without ?open — lands on the Review Queue', async () => {
    mockInitialUrl = 'coinflow://review';
    await render(<WidgetLinkRouter />);
    expect(mockPush).toHaveBeenCalledWith('/review-queue');
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it('coinflow://review?open=<id> of a pending suggestion — also opens its Confirm sheet', async () => {
    mockInitialUrl = 'coinflow://review?open=s1';
    mockSuggestion = { id: 's1', status: 'pending' };
    await render(<WidgetLinkRouter />);
    expect(mockPush).toHaveBeenCalledWith('/review-queue');
    expect(mockOpen).toHaveBeenCalledWith('confirm', { suggestionId: 's1' });
  });

  it('coinflow://review?open=<id> of a stale (confirmed/gone) suggestion — never a dead sheet', async () => {
    mockInitialUrl = 'coinflow://review?open=s1';
    mockSuggestion = { id: 's1', status: 'confirmed' };
    await render(<WidgetLinkRouter />);
    expect(mockPush).toHaveBeenCalledWith('/review-queue');
    expect(mockOpen).not.toHaveBeenCalled();
  });
});
