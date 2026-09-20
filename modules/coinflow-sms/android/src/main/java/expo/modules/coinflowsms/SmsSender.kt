package expo.modules.coinflowsms

import android.app.Activity
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.telephony.SmsManager
import android.telephony.SubscriptionManager
import android.util.Log
import java.util.UUID

/**
 * FILE PURPOSE
 * ------------
 * Sends one SMS through `SmsManager` on the phone's **default SMS SIM** and reports what the system said
 * (SPEC-implementation.md §42.3, IMP-081). Used for split requests only.
 *
 * WHERE IT FITS
 * -------------
 * Called by `CoinflowSmsModule.sendSmsAsync`; the JS side is `src/services/splits/send-requests.ts`. Nothing here
 * knows what a "split request" is — it sends text to a number and resolves `"sent"` or `"failed"`.
 *
 * IMPORTANT
 * ---------
 * - **Result = the system's sent-intent**, not delivery: `"sent"` means the radio accepted the message.
 * - **30 s timeout** → `"failed"`, so a stuck send never leaves the UI waiting.
 * - The default SMS **subscription id is resolved on every send** and never cached — it is device-specific (the
 *   phase-0 spike saw `1` on one phone and `2` on another) and can change when the user swaps the default SIM.
 * - The message is written to the phone's Sent box by the system (also seen in the spike). CoinFlow's inbound paths
 *   read the **inbox only**, so our own outgoing text is never re-ingested (IMP-079).
 * - No text or number is logged (P-9) — only the outcome class.
 */
object SmsSender {
  private const val TIMEOUT_MS = 30_000L

  /** Sends [text] to [phone]; [onResult] is called exactly once with `"sent"` or `"failed"`. */
  fun send(context: Context, phone: String, text: String, onResult: (String) -> Unit) {
    val handler = Handler(Looper.getMainLooper())
    val action = "expo.modules.coinflowsms.SMS_SENT_" + UUID.randomUUID()
    var finished = false
    var receiver: BroadcastReceiver? = null

    fun finish(result: String) {
      if (finished) return
      finished = true
      handler.removeCallbacksAndMessages(null)
      receiver?.let {
        try {
          context.unregisterReceiver(it)
        } catch (_: Exception) {
          // already gone
        }
      }
      onResult(result)
    }

    try {
      receiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context, intent: Intent) {
          finish(if (resultCode == Activity.RESULT_OK) "sent" else "failed")
        }
      }
      val filter = IntentFilter(action)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
      } else {
        context.registerReceiver(receiver, filter)
      }

      val sentIntent = PendingIntent.getBroadcast(
        context,
        0,
        Intent(action).setPackage(context.packageName),
        PendingIntent.FLAG_ONE_SHOT or PendingIntent.FLAG_IMMUTABLE,
      )
      handler.postDelayed({ finish("failed") }, TIMEOUT_MS)
      smsManager(context).sendTextMessage(phone, null, text, sentIntent, null)
    } catch (e: Exception) {
      // No number / text in the log — class name only.
      Log.w("CoinflowSms", "SMS send failed: ${e.javaClass.simpleName}")
      finish("failed")
    }
  }

  /** The `SmsManager` for the default SMS SIM, resolved now (never cached). */
  private fun smsManager(context: Context): SmsManager {
    val subId = SubscriptionManager.getDefaultSmsSubscriptionId()
    if (subId == SubscriptionManager.INVALID_SUBSCRIPTION_ID) {
      @Suppress("DEPRECATION")
      return SmsManager.getDefault()
    }
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      context.getSystemService(SmsManager::class.java).createForSubscriptionId(subId)
    } else {
      @Suppress("DEPRECATION")
      SmsManager.getSmsManagerForSubscriptionId(subId)
    }
  }
}
