/**
 * Per-path "first catch" counters (CR-16).
 */

import { getSetting, setSetting } from '@/db/repositories/settings';

import { readCatchCounts, recordCatch } from './catch-stats';

jest.mock('@/db/repositories/settings', () => ({ getSetting: jest.fn(), setSetting: jest.fn() }));

const getSettingMock = getSetting as jest.Mock;
const setSettingMock = setSetting as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  getSettingMock.mockImplementation((_key: string, fallback: unknown) => fallback);
});

describe('recordCatch', () => {
  it.each([
    ['broadcast', 'smsCaughtBroadcast'],
    ['storeTrigger', 'smsCaughtStoreTrigger'],
    ['sweepOpen', 'smsCaughtSweepOpen'],
    ['sweepPeriodic', 'smsCaughtSweepPeriodic'],
  ] as const)('%s bumps %s, starting from 0', (source, key) => {
    recordCatch(source);
    expect(setSettingMock).toHaveBeenCalledWith(key, 1);
  });

  it('increments an existing count', () => {
    getSettingMock.mockImplementation((key: string, fallback: unknown) => (key === 'smsCaughtStoreTrigger' ? 4 : fallback));
    recordCatch('storeTrigger');
    expect(setSettingMock).toHaveBeenCalledWith('smsCaughtStoreTrigger', 5);
  });

  it('never throws if the settings write fails', () => {
    setSettingMock.mockImplementationOnce(() => {
      throw new Error('db locked');
    });
    expect(() => recordCatch('broadcast')).not.toThrow();
  });
});

describe('readCatchCounts', () => {
  it('reads all four counters, defaulting to 0', () => {
    expect(readCatchCounts()).toEqual({ broadcast: 0, storeTrigger: 0, sweepOpen: 0, sweepPeriodic: 0 });
  });
});
