package expo.modules.coinflowsms

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/**
 * FILE PURPOSE (step 2 of the SMS-detection pipeline)
 * -----------------------------------------------------
 * The bridge between native Android and JavaScript for the SMS-detection flow. Boots (or
 * reuses) a React Native JS engine with NO UI, and tells it to run the JS function registered
 * as the `"CoinflowSmsIngest"` headless task — see `src/services/tasks/index.ts`'s
 * `AppRegistry.registerHeadlessTask(SMS_INGEST_TASK, ...)` call, and
 * `src/services/tasks/sms-ingest.ts` for the actual JS logic that runs.
 *
 * WHERE IT FITS
 * -------------
 * `SmsReceiver` (this same folder) starts this service, passing along the sender/body/timestamp
 * it just extracted from the broadcast. This class's only job is `getTaskConfig`, which tells
 * React Native which JS task to run and with what data — it has a 30-second budget, and can run
 * whether or not the app happens to already be in the foreground.
 */
class CoinflowSmsHeadlessTaskService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
    val extras = intent?.extras ?: return null
    return HeadlessJsTaskConfig(
      "CoinflowSmsIngest",
      Arguments.fromBundle(extras),
      30_000L,
      true // allowedInForeground
    )
  }
}
