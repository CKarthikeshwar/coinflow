/**
 * Config plugin for `coinflow-sms` (SPEC-implementation.md §17.6).
 *
 * Android-only. Injects into the generated `AndroidManifest.xml`:
 *   - `RECEIVE_SMS` + `READ_SMS` (+ `SEND_SMS` for split requests, V2) <uses-permission>
 *   - the <receiver> for `SMS_RECEIVED` (exported, guarded by `BROADCAST_SMS`)
 *   - the <service> for the headless-JS task host
 *   - V2: the three home-screen widget <receiver>s (Summary / Queue / Quick add — §44.4); no new permission
 *
 * `allowBackup="false"` (D21) is handled by `expo-build-properties`, not here.
 * Plain CommonJS so it needs no build step; referenced from app.json as
 * `"./modules/coinflow-sms/app.plugin.js"`.
 */

const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

const RECEIVER = 'expo.modules.coinflowsms.SmsReceiver';
const SERVICE = 'expo.modules.coinflowsms.CoinflowSmsHeadlessTaskService';
const STORE_JOB_SERVICE = 'expo.modules.coinflowsms.SmsStoreJobService';
// SEND_SMS (V2, §42.3 / IMP-098) is optional at runtime — requested only when the user sends a split request.
const PERMISSIONS = ['android.permission.RECEIVE_SMS', 'android.permission.READ_SMS', 'android.permission.SEND_SMS'];
const SMS_RECEIVED_ACTION = 'android.provider.Telephony.SMS_RECEIVED';
// V2 widgets (§44.4): provider class → the `res/xml` info file + picker label shipped by this module.
const WIDGETS = [
  { cls: 'expo.modules.coinflowsms.SummaryWidgetProvider', xml: '@xml/cf_widget_summary_info', label: '@string/cf_widget_summary_label' },
  { cls: 'expo.modules.coinflowsms.QueueWidgetProvider', xml: '@xml/cf_widget_queue_info', label: '@string/cf_widget_queue_label' },
  { cls: 'expo.modules.coinflowsms.QuickAddWidgetProvider', xml: '@xml/cf_widget_quickadd_info', label: '@string/cf_widget_quickadd_label' },
];

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
            // Matches the ceiling other SMS-reading apps (default SMS app, Truecaller, etc.)
            // already use — narrows, but does not close, a same-priority race (§17.8, CR-10).
            $: { 'android:priority': '2147483647' },
            action: [{ $: { 'android:name': SMS_RECEIVED_ACTION } }],
          },
        ],
      });
    }

    app.service = app.service ?? [];
    if (!app.service.some((s) => s.$?.['android:name'] === SERVICE)) {
      app.service.push({ $: { 'android:name': SERVICE, 'android:exported': 'false' } });
    }

    // CR-16: the store-watcher job. BIND_JOB_SERVICE means only the system can bind it.
    if (!app.service.some((s) => s.$?.['android:name'] === STORE_JOB_SERVICE)) {
      app.service.push({
        $: {
          'android:name': STORE_JOB_SERVICE,
          'android:exported': 'true',
          'android:permission': 'android.permission.BIND_JOB_SERVICE',
        },
      });
    }

    // V2 widgets: AppWidgetProvider receivers. Exported (the launcher binds them) but they take no data from the
    // broadcast — they only re-read the stored snapshot.
    for (const w of WIDGETS) {
      if (app.receiver.some((r) => r.$?.['android:name'] === w.cls)) continue;
      app.receiver.push({
        $: { 'android:name': w.cls, 'android:label': w.label, 'android:exported': 'true' },
        'intent-filter': [{ action: [{ $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } }] }],
        'meta-data': [{ $: { 'android:name': 'android.appwidget.provider', 'android:resource': w.xml } }],
      });
    }

    return cfg;
  });
}

module.exports = withCoinflowSms;
