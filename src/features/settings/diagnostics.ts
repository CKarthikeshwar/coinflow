/**
 * FILE PURPOSE
 * ------------
 * "Send diagnostics" (§17.10 / §33.1, CR-12) — a manual, share-sheet-driven export of operational
 * app state (device info, live permission state, SMS pipeline health, recent scrubbed log
 * activity), for a user to hand to the developer when reporting a bug on a device the developer
 * doesn't have physical access to. This is what CR-10's Truecaller bug needed and didn't have: it
 * was only root-caused because the affected phone could be physically brought in for `adb dumpsys`
 * inspection.
 *
 * WHERE IT FITS
 * -------------
 * `sendDiagnostics()` is called from Settings › Data's **Send diagnostics** row (`src/app/data.tsx`,
 * §30.16), the same screen as `exportJson`/`exportCsv` — and reuses `ensureFile` from
 * `./export.ts` rather than duplicating its `File`/`Directory`/`Paths` boilerplate.
 *
 * IMPORTANT — privacy
 * --------------------
 * This is manual and share-sheet-only, exactly like the other three data exports (§33.1) — never
 * automatic, never a background upload, no change to the app's no-network-by-default guarantee
 * (§33.2). The bundle never contains SMS body, amounts, account/category/note text, or any DB
 * row — only operational metadata plus the already-scrubbed log ring buffer (§32.1).
 */

import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { getSetting } from '@/db/repositories/settings';
import { getRecentLogs } from '@/lib/log';
import { getSmsPermissions, isSmsCaptureSupported } from '@/services/sms';
import * as Sharing from 'expo-sharing';

import { ensureFile } from './export';

/** §33.1 — everything a diagnostics bundle carries; deliberately excludes SMS/transaction content. */
async function buildDiagnosticsPayload() {
  const [smsPermissions, notifPermissions] = await Promise.all([
    getSmsPermissions(),
    Notifications.getPermissionsAsync(),
  ]);

  return {
    exportedAt: Date.now(),
    appVersion: Constants.expoConfig?.version ?? '0.0.0',
    device: {
      platform: Platform.OS,
      osVersion: Device.osVersion,
      manufacturer: Device.manufacturer,
      modelName: Device.modelName,
    },
    permissions: {
      smsCaptureSupported: isSmsCaptureSupported(),
      sms: smsPermissions.granted,
      smsCanAskAgain: smsPermissions.canAskAgain,
      notifications: notifPermissions.granted,
      notificationsCanAskAgain: notifPermissions.canAskAgain,
    },
    pipelineHealth: {
      lastRealtimeInvokedAt: getSetting<number | null>('smsLastRealtimeInvokedAt', null),
      lastReconcileSweepAt: getSetting<number | null>('smsLastReconcileSweepAt', null),
      lastReconcileMatchCount: getSetting<number | null>('smsLastReconcileMatchCount', null),
    },
    crashReportingEnabled: getSetting<boolean>('crashReportingEnabled', false),
    recentLogs: getRecentLogs(),
  };
}

/** §30.16 "Send diagnostics" — builds the bundle above, writes it to cache, hands it to the OS
 * share sheet. Throws on write/share failure (E21) — the caller (`data.tsx`) shows the retry toast. */
export async function sendDiagnostics(): Promise<void> {
  const payload = await buildDiagnosticsPayload();
  const file = ensureFile('coinflow-diagnostics.json');
  file.write(JSON.stringify(payload, null, 2));
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Send CoinFlow diagnostics' });
}
