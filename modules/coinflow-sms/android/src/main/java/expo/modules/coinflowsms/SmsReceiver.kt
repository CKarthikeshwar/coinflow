package expo.modules.coinflowsms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.provider.Telephony
import android.util.Log
import com.facebook.react.HeadlessJsTaskService

/**
 * Manifest-registered receiver for `SMS_RECEIVED` (SPEC-implementation.md §17.1). Android
 * delivers this even when the app process is dead. `onReceive` has ~10 s: coalesce the
 * multipart PDUs, pull sender / body / timestamp, hand them to a bounded headless-JS task.
 *
 * It never touches SQLite, `expo-notifications`, or the network, and never writes the body
 * to disk (P-9). A malformed broadcast must never crash the host app (§17.2 / §32 E1).
 */
class SmsReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

    try {
      val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
      if (messages.isNullOrEmpty()) return

      val sender = messages[0].displayOriginatingAddress
        ?: messages[0].originatingAddress
        ?: return
      val body = buildString { messages.forEach { append(it.messageBody ?: "") } }
      val timestampMs = messages[0].timestampMillis

      val extras = Bundle().apply {
        putString("sender", sender)
        putString("body", body)
        // JS bridges numbers as Double; the task floors it back to a Long epoch-ms.
        putDouble("timestampMs", timestampMs.toDouble())
      }

      val appContext = context.applicationContext
      val serviceIntent = Intent(appContext, CoinflowSmsHeadlessTaskService::class.java)
        .putExtras(extras)
      appContext.startService(serviceIntent)
      HeadlessJsTaskService.acquireWakeLockNow(appContext)
    } catch (e: Exception) {
      // No PII in the log — class name only (§17.2).
      Log.w("CoinflowSms", "SMS receive dropped: ${e.javaClass.simpleName}")
    }
  }
}
