/**
 * FILE PURPOSE
 * ------------
 * Records *which detection path first caught a transaction SMS* (CR-16): the real-time broadcast,
 * the SMS-store watcher, the app-open sweep, or the periodic background sweep. One counter per
 * path in app_setting, bumped only when a message actually produced a NEW suggestion — a message
 * already caught by an earlier path is a dedupe no-op and counts for nothing here.
 *
 * WHY
 * ---
 * Send Diagnostics (§17.10) can then show, from an exported file, whether the extra paths are
 * earning their keep on a given phone (e.g. store-trigger catches > 0 means the broadcast really is
 * being swallowed there). Counts only — no message content (P-9). Best-effort: never throws.
 */

import { getSetting, setSetting, type SettingKey } from '@/db/repositories/settings';

export type SmsCatchSource = 'broadcast' | 'storeTrigger' | 'sweepOpen' | 'sweepPeriodic';

const KEY: Record<SmsCatchSource, SettingKey> = {
  broadcast: 'smsCaughtBroadcast',
  storeTrigger: 'smsCaughtStoreTrigger',
  sweepOpen: 'smsCaughtSweepOpen',
  sweepPeriodic: 'smsCaughtSweepPeriodic',
};

export function recordCatch(source: SmsCatchSource): void {
  try {
    const key = KEY[source];
    setSetting(key, getSetting<number>(key, 0) + 1);
  } catch (e) {
    console.warn('[recordCatch] dropped:', (e as Error)?.name ?? 'unknown');
  }
}

export function readCatchCounts(): Record<SmsCatchSource, number> {
  return {
    broadcast: getSetting<number>(KEY.broadcast, 0),
    storeTrigger: getSetting<number>(KEY.storeTrigger, 0),
    sweepOpen: getSetting<number>(KEY.sweepOpen, 0),
    sweepPeriodic: getSetting<number>(KEY.sweepPeriodic, 0),
  };
}
