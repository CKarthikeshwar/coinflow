package expo.modules.coinflowsms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.provider.Telephony
import android.util.Log
import com.facebook.react.HeadlessJsTaskService

/**
 * FILE PURPOSE (step 1 of the SMS-detection pipeline)
 * -----------------------------------------------------
 * This is the very first code that runs when an SMS arrives on the device — a manifest-
 * registered Android `BroadcastReceiver` for `SMS_RECEIVED`. Android delivers this broadcast
 * even when the app process is completely dead (not just backgrounded), which is what makes
 * "detect a transaction even when CoinFlow isn't open" possible at all.
 *
 * WHERE IT FITS
 * -------------
 * `onReceive` has roughly 10 seconds of guaranteed run time: it coalesces the (possibly
 * multipart) SMS PDUs into one message, pulls out the sender/body/timestamp, and hands them off
 * to `CoinflowSmsHeadlessTaskService` (this same folder) to actually start the JS engine and
 * run the real parsing logic. This class itself does none of the real work — no database, no
 * notifications, no parsing — it's purely "catch the SMS and pass it along."
 *
 * IMPORTANT
 * ---------
 * It never touches SQLite, `expo-notifications`, or the network, and never writes the SMS body
 * to disk — only in-memory, passed forward as an Android `Bundle`. A malformed or unexpected
 * broadcast must never crash the host app, hence the broad try/catch that only logs the
 * exception's class name (never its message, which could contain SMS content).
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
