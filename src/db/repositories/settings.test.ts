import { createMemoryDb } from '../test-support/memory-db';
import { ensureInstallMarker, getSetting, setSetting } from './settings';

let mockMem: ReturnType<typeof createMemoryDb>;
jest.mock('../client', () => ({
  get db() {
    return mockMem.db;
  },
}));

beforeEach(() => {
  mockMem = createMemoryDb();
});

describe('setSetting / getSetting', () => {
  it('round-trips a value and falls back when the key is missing', () => {
    expect(getSetting('onboardingDone', false)).toBe(false);
    setSetting('onboardingDone', true);
    expect(getSetting('onboardingDone', false)).toBe(true);
  });
});

describe('ensureInstallMarker', () => {
  it('writes installFirstOpenAt on a fresh database', () => {
    ensureInstallMarker(1_000);
    expect(getSetting('installFirstOpenAt', 0)).toBe(1_000);
  });

  it('never overwrites it on a later call (a plain app update, not a reinstall)', () => {
    ensureInstallMarker(1_000);
    ensureInstallMarker(2_000);
    expect(getSetting('installFirstOpenAt', 0)).toBe(1_000);
  });
});
