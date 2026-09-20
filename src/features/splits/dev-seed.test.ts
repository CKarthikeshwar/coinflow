import { listOpenRequests } from '@/db/repositories/split-requests';
import { createMemoryDb } from '@/db/test-support/memory-db';

import { addSampleRequest } from './dev-seed';

let mockMem: ReturnType<typeof createMemoryDb>;
let mockCounter = 0;
jest.mock('@/db/client', () => ({
  get db() {
    return mockMem.db;
  },
}));
jest.mock('expo-crypto', () => ({
  randomUUID: () => `id-${++mockCounter}`,
  getRandomBytes: (n: number) => Uint8Array.from({ length: n }, (_v, i) => (++mockCounter * 37 + i * 11) % 256),
}));

beforeEach(() => {
  mockMem?.close();
  mockMem = createMemoryDb();
  mockCounter = 0;
});

describe('addSampleRequest (dev-only fixture)', () => {
  it('creates an already-accepted request that shows up under "You owe"', () => {
    expect(addSampleRequest()).toBe(true);
    const open = listOpenRequests();
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ status: 'accepted', remainingMinor: open[0].amountMinor });
  });

  it('rotates through different senders', () => {
    addSampleRequest();
    addSampleRequest();
    addSampleRequest();
    expect(new Set(listOpenRequests().map((r) => r.fromPhoneKey)).size).toBe(3);
  });
});
