/**
 * Config plugin for `coinflow-sms` (SPEC-implementation.md §17.6).
 *
 * Android-only. Injects into the generated `AndroidManifest.xml`:
 *   - `RECEIVE_SMS` + `READ_SMS` <uses-permission>
 *   - the <receiver> for `SMS_RECEIVED` (exported, guarded by `BROADCAST_SMS`)
 *   - the <service> for the headless-JS task host
 *
 * `allowBackup="false"` (D21) is handled by `expo-build-properties`, not here.
 * Plain CommonJS so it needs no build step; referenced from app.json as
 * `"./modules/coinflow-sms/app.plugin.js"`.
 */

const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

const RECEIVER = 'expo.modules.coinflowsms.SmsReceiver';
const SERVICE = 'expo.modules.coinflowsms.CoinflowSmsHeadlessTaskService';
const PERMISSIONS = ['android.permission.RECEIVE_SMS', 'android.permission.READ_SMS'];
const SMS_RECEIVED_ACTION = 'android.provider.Telephony.SMS_RECEIVED';

/** @param {import('@expo/config-plugins').ExportedConfig} config */
function withCoinflowSms(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;

    // --- permissions -------------------------------------------------------
    manifest.manifest['uses-permission'] = manifest.manifest['uses-permission'] ?? [];
    for (const name of PERMISSIONS) {
      const present = manifest.manifest['uses-permission'].some(
        (p) => p.$?.['android:name'] === name,
      );
      if (!present) manifest.manifest['uses-permission'].push({ $: { 'android:name': name } });
    }

    // --- <receiver> + <service> ------------------------------------------
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);

    app.receiver = app.receiver ?? [];
    if (!app.receiver.some((r) => r.$?.['android:name'] === RECEIVER)) {
      app.receiver.push({
        $: {
          'android:name': RECEIVER,
          'android:exported': 'true',
          'android:permission': 'android.permission.BROADCAST_SMS',
        },
        'intent-filter': [
          {
            $: { 'android:priority': '999' },
            action: [{ $: { 'android:name': SMS_RECEIVED_ACTION } }],
          },
        ],
      });
    }

    app.service = app.service ?? [];
    if (!app.service.some((s) => s.$?.['android:name'] === SERVICE)) {
      app.service.push({ $: { 'android:name': SERVICE, 'android:exported': 'false' } });
    }

    return cfg;
  });
}

module.exports = withCoinflowSms;
