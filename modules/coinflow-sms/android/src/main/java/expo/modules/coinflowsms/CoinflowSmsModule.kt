package expo.modules.coinflowsms

import android.Manifest
import android.provider.Telephony
import android.util.Log
import expo.modules.interfaces.permissions.Permissions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * FILE PURPOSE
 * ------------
 * The one native module CoinFlow's JS code can call directly. Mostly for
 * checking/requesting the `RECEIVE_SMS`/`READ_SMS` permissions and checking whether SMS capture
 * is supported at all — it deliberately does NOT do any parsing/DB/notification work itself, that
 * entire flow runs through `SmsReceiver` + `CoinflowSmsHeadlessTaskService` (this same folder)
 * instead, triggered by Android itself, not by a JS call into this module.
 *
 * The one exception is `getRecentInboxMessagesAsync` (SPEC-implementation.md §17.8, CR-10) — a
 * read-only query against Android's own shared SMS store, backing the reconciliation sweep that
 * catches a message whose `SMS_RECEIVED` broadcast got swallowed by another app (e.g. Truecaller)
 * before `SmsReceiver` ever ran. Still no parsing/DB/notification work here — it just hands rows
 * back to JS, same in-memory-only handling as the receiver (P-9).
 *
 * WHERE IT FITS
 * -------------
 * `modules/coinflow-sms/src/index.ts` is the JS wrapper that calls into this module's functions;
 * `src/services/sms.ts` is the one place in the app's own `src/` code allowed to import that JS
 * wrapper.
 */
class CoinflowSmsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CoinflowSms")

    Function("isSupported") {
      true
    }

    // Arms the SMS-store watcher job (SmsStoreJobService, CR-16). Idempotent: an already-pending job is
    // left alone. Returns whether a job is scheduled (false, e.g., before READ_SMS is granted).
    Function("armSmsStoreTrigger") {
      val ctx = appContext.reactContext ?: return@Function false
      SmsStoreTrigger.schedule(ctx)
    }

    AsyncFunction("getPermissionsAsync") { promise: Promise ->
      Permissions.getPermissionsWithPermissionsManager(
        appContext.permissions,
        promise,
        Manifest.permission.RECEIVE_SMS,
        Manifest.permission.READ_SMS
      )
    }

    AsyncFunction("requestPermissionsAsync") { promise: Promise ->
      Permissions.askForPermissionsWithPermissionsManager(
        appContext.permissions,
        promise,
        Manifest.permission.RECEIVE_SMS,
        Manifest.permission.READ_SMS
      )
    }

    AsyncFunction("getRecentInboxMessagesAsync") { sinceEpochMs: Double, promise: Promise ->
      val results = mutableListOf<Map<String, Any>>()
      try {
        val resolver = appContext.reactContext?.contentResolver
        val projection = arrayOf(Telephony.Sms.ADDRESS, Telephony.Sms.DATE, Telephony.Sms.BODY)
        val selection = "${Telephony.Sms.DATE} >= ?"
        val selectionArgs = arrayOf(sinceEpochMs.toLong().toString())
        val sortOrder = "${Telephony.Sms.DATE} ASC"

        resolver?.query(
          Telephony.Sms.Inbox.CONTENT_URI,
          projection,
          selection,
          selectionArgs,
          sortOrder
        )?.use { cursor ->
          val addressIdx = cursor.getColumnIndexOrThrow(Telephony.Sms.ADDRESS)
          val dateIdx = cursor.getColumnIndexOrThrow(Telephony.Sms.DATE)
          val bodyIdx = cursor.getColumnIndexOrThrow(Telephony.Sms.BODY)
          while (cursor.moveToNext()) {
            val sender = cursor.getString(addressIdx) ?: continue
            results.add(
              mapOf(
                "sender" to sender,
                "body" to (cursor.getString(bodyIdx) ?: ""),
                "timestampMs" to cursor.getLong(dateIdx).toDouble()
              )
            )
          }
        }
      } catch (e: Exception) {
        // No PII in the log — class name only (§17.2 / P-9).
        Log.w("CoinflowSms", "Inbox query dropped: ${e.javaClass.simpleName}")
      }
      promise.resolve(results)
    }
  }
}
