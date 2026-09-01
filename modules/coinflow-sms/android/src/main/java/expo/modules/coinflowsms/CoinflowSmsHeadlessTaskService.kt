package expo.modules.coinflowsms

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/**
 * Headless-JS host for the SMS ingest task (SPEC-implementation.md §17.6). Boots (or reuses)
 * the JS context with no UI and runs the JS task registered as `CoinflowSmsIngest`
 * (`AppRegistry.registerHeadlessTask` in `src/services/tasks`). ~30 s budget; may run while
 * the app is foregrounded too.
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
