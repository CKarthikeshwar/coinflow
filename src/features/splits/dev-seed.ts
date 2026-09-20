/**
 * FILE PURPOSE
 * ------------
 * DEV-ONLY fixture: adds an already-accepted incoming split request so the **You owe** side (and the debit
 * Merge path) can be exercised before phase 5 delivers real requests over SMS
 * (SPEC/V2-IMPLEMENTATION-PLAN.md, phase 4 — "seeded through a dev-only fixture path that is not shipped").
 *
 * Only the Splits page's `__DEV__` button calls this; in a release build `__DEV__` is `false`, the button is
 * never rendered and Metro drops the branch.
 */

import { getRandomBytes } from 'expo-crypto';

import { acceptRequest, receiveRequest } from '@/db/repositories/split-requests';
import { makeRef } from '@/domain/split-message';

const SAMPLES = [
  { fromPhone: '9000000001', amountMinor: 45_000, note: 'Dinner' },
  { fromPhone: '9000000002', amountMinor: 30_000, note: 'Cab' },
  { fromPhone: '9000000003', amountMinor: 12_050, note: 'Movie' },
] as const;

let next = 0;

/** Creates one accepted request from a rotating sample sender; returns `false` if the receive rules refused it. */
export function addSampleRequest(): boolean {
  const sample = SAMPLES[next++ % SAMPLES.length];
  const res = receiveRequest({
    fromPhone: sample.fromPhone,
    ref: makeRef(() => getRandomBytes(1)[0]),
    amountMinor: sample.amountMinor,
    note: sample.note,
  });
  if (res.kind !== 'created') return false;
  return acceptRequest(res.request.id);
}
