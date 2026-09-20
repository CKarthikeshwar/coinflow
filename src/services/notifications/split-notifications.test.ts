import * as Notifications from 'expo-notifications';

import { getPerson } from '@/db/repositories/persons';
import { acceptRequest, listRequestsByStatus, rejectRequest } from '@/db/repositories/split-requests';
import type { SplitRequestIn } from '@/db/schema';

import { SPLIT_REQUEST_CATEGORY } from './categories';
import { handleAcceptRequest, handleRejectRequest } from './respond-split';
import { buildSplitNotification } from './split-content';
import { cancelForRequest, postForRequest, refreshSplitGroupSummary, SPLIT_GROUP_IDENTIFIER } from './split-post';

jest.mock('@/db/repositories/persons', () => ({ getPerson: jest.fn() }));
jest.mock('@/db/repositories/split-requests', () => ({
  listRequestsByStatus: jest.fn(),
  acceptRequest: jest.fn(),
  rejectRequest: jest.fn(),
}));
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn().mockResolvedValue('id'),
  dismissNotificationAsync: jest.fn().mockResolvedValue(undefined),
  AndroidImportance: { DEFAULT: 3, HIGH: 4 },
  AndroidNotificationVisibility: { PRIVATE: 0 },
}));

const getPermissions = Notifications.getPermissionsAsync as jest.Mock;
const schedule = Notifications.scheduleNotificationAsync as jest.Mock;
const dismiss = Notifications.dismissNotificationAsync as jest.Mock;
const mockGetPerson = getPerson as jest.Mock;
const mockList = listRequestsByStatus as jest.Mock;
const mockAccept = acceptRequest as jest.Mock;
const mockReject = rejectRequest as jest.Mock;

function request(o: Partial<SplitRequestIn> = {}): SplitRequestIn {
  return {
    id: 'rq-1', fromPhoneKey: '9845897555', fromPersonId: 'p-1', fromLabel: 'Rahul', remoteRef: 'ab2cd3',
    amountMinor: 45_000, forNote: 'Momos', receivedAt: 1, status: 'unattended', updatedAt: 1, ...o,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  getPermissions.mockResolvedValue({ status: 'granted' });
  mockGetPerson.mockReturnValue({ id: 'p-1', source: 'manual' });
  mockList.mockReturnValue([request()]);
});

describe('buildSplitNotification (§6.21)', () => {
  it('title "Rahul requested ₹450", body "for Momos · CoinFlow split", Accept/Reject category', () => {
    const c = buildSplitNotification(request(), { knownPerson: true });
    expect(c.title).toBe('Rahul requested ₹450');
    expect(c.body).toBe('for Momos · CoinFlow split');
    expect(c.identifier).toBe('req:rq-1');
    expect(c.categoryIdentifier).toBe(SPLIT_REQUEST_CATEGORY);
    expect(c.data).toMatchObject({ kind: 'split-request', requestId: 'rq-1' });
  });

  it('a number not among the saved people says so; a request with no note still reads naturally', () => {
    expect(buildSplitNotification(request(), { knownPerson: false }).body).toBe('for Momos · CoinFlow split · not in your people');
    expect(buildSplitNotification(request({ forNote: null }), { knownPerson: true }).body).toBe('CoinFlow split');
  });

  it('shows paise, and the requester is named by what we have (a number when unknown)', () => {
    expect(buildSplitNotification(request({ amountMinor: 12_050, fromLabel: '+919845897555' }), { knownPerson: false }).title).toBe(
      '+919845897555 requested ₹120.50',
    );
  });
});

describe('postForRequest', () => {
  it('posts on the Split requests channel with the Accept/Reject category', async () => {
    await postForRequest(request());
    expect(schedule).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: 'req:rq-1',
        content: expect.objectContaining({ categoryIdentifier: SPLIT_REQUEST_CATEGORY, title: 'Rahul requested ₹450' }),
        trigger: { channelId: 'split-requests' },
      }),
    );
  });

  it('marks a sender who was only ever created from an SMS as not in your people', async () => {
    mockGetPerson.mockReturnValue({ id: 'p-1', source: 'sms' });
    await postForRequest(request());
    expect(schedule.mock.calls[0][0].content.body).toContain('not in your people');
  });

  it('is silent when notification permission is off (P-7) — the request is still stored', async () => {
    getPermissions.mockResolvedValue({ status: 'denied' });
    await postForRequest(request());
    expect(schedule).not.toHaveBeenCalled();
  });
});

describe('the "N split requests" summary', () => {
  it('appears from 2 unattended requests, and is removed below that', async () => {
    mockList.mockReturnValue([request(), request({ id: 'rq-2' })]);
    await refreshSplitGroupSummary();
    expect(schedule).toHaveBeenCalledWith(expect.objectContaining({ identifier: SPLIT_GROUP_IDENTIFIER, content: expect.objectContaining({ title: '2 split requests' }) }));

    schedule.mockClear();
    mockList.mockReturnValue([request()]);
    await refreshSplitGroupSummary();
    expect(schedule).not.toHaveBeenCalled();
    expect(dismiss).toHaveBeenCalledWith(SPLIT_GROUP_IDENTIFIER);
  });

  it('cancelForRequest dismisses that notification and recounts', async () => {
    mockList.mockReturnValue([]);
    await cancelForRequest('rq-1');
    expect(dismiss).toHaveBeenCalledWith('req:rq-1');
    expect(dismiss).toHaveBeenCalledWith(SPLIT_GROUP_IDENTIFIER);
  });
});

describe('headless Accept / Reject (IMP-082)', () => {
  it('Accept accepts the request and removes its notification', async () => {
    mockAccept.mockReturnValue(true);
    expect(await handleAcceptRequest('rq-1')).toEqual({ outcome: 'accepted' });
    expect(mockAccept).toHaveBeenCalledWith('rq-1');
    expect(dismiss).toHaveBeenCalledWith('req:rq-1');
  });

  it('Reject discards it and removes its notification', async () => {
    mockReject.mockReturnValue(true);
    expect(await handleRejectRequest('rq-1')).toEqual({ outcome: 'rejected' });
    expect(dismiss).toHaveBeenCalledWith('req:rq-1');
  });

  it('a stale press (already decided / gone) is a no-op that still clears the notification', async () => {
    mockAccept.mockReturnValue(false);
    mockReject.mockReturnValue(false);
    expect(await handleAcceptRequest('rq-1')).toEqual({ outcome: 'noop' });
    expect(await handleRejectRequest('rq-1')).toEqual({ outcome: 'noop' });
    expect(dismiss).toHaveBeenCalledWith('req:rq-1');
  });
});

describe('a request the sender changes after you accepted it (§42.2)', () => {
  it('is announced as a change, with no Accept / Reject to press', async () => {
    const accepted = request({ status: 'accepted', amountMinor: 90_000 });
    await postForRequest(accepted);
    const content = schedule.mock.calls[0][0].content;
    expect(content.title).toBe('Rahul changed the request to ₹900');
    expect(content.categoryIdentifier).toBe(''); // the buttons no longer apply
  });

  it('an unattended one still gets the normal request notification', async () => {
    await postForRequest(request());
    expect(schedule.mock.calls[0][0].content.title).toBe('Rahul requested ₹450');
    expect(schedule.mock.calls[0][0].content.categoryIdentifier).toBe(SPLIT_REQUEST_CATEGORY);
  });
});
