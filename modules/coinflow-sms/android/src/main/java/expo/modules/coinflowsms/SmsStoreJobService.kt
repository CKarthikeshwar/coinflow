package expo.modules.coinflowsms

import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.util.Log
import com.facebook.react.HeadlessJsTaskService

/**
 * FILE PURPOSE
 * ------------
 * The "store watcher" (SPEC-implementation.md §17.11, CR-16): a `JobScheduler` job whose trigger is
 * a *change to Android's shared SMS store* (`content://sms`), not a broadcast. Another app (e.g.
 * Truecaller) can call `abortBroadcast()` on `SMS_RECEIVED` before `SmsReceiver` ever runs, but it
 * cannot stop the message being written to the SMS store — so this still fires. Android's own
 * system service holds the content observer; nothing of ours has to be running to be woken by it.
 *
 * WHAT IT DOES
 * ------------
 * `onStartJob` (1) re-arms the trigger straight away — a content-trigger job fires ONCE and must be
 * scheduled again to catch the next change — then (2) hands off to the same headless JS host the
 * broadcast path uses, with `task=store`, which runs the reconciliation sweep. No parsing / DB /
 * notification work happens in Kotlin (D18/D24) and no message text passes through here.
 *
 * LIMITS
 * ------
 * A trigger job cannot be persisted across reboots (`JobInfo` rejects `setPersisted` together with
 * a trigger URI), so after a reboot it is gone until JS re-arms it — on any app launch/foreground,
 * on every headless JS start, and from the periodic background reconcile task (§17.9). It is also
 * subject to Doze / App Standby, so on an idle phone it can run late rather than instantly.
 */
class SmsStoreJobService : JobService() {
  override fun onStartJob(params: JobParameters?): Boolean {
    try {
      // Re-arm FIRST, before any work, so a message arriving while we run is not missed.
      SmsStoreTrigger.schedule(applicationContext, force = true)

      val appContext = applicationContext
      val serviceIntent = Intent(appContext, CoinflowSmsHeadlessTaskService::class.java)
        .putExtra(CoinflowSmsHeadlessTaskService.EXTRA_TASK, CoinflowSmsHeadlessTaskService.TASK_STORE)
      appContext.startService(serviceIntent)
      HeadlessJsTaskService.acquireWakeLockNow(appContext)
    } catch (e: Exception) {
      // No PII in the log — class name only (§17.2).
      Log.w("CoinflowSms", "Store trigger dropped: ${e.javaClass.simpleName}")
    }
    return false // the JS work runs in the headless service; nothing left for this job to do
  }

  override fun onStopJob(params: JobParameters?): Boolean = false
}

object SmsStoreTrigger {
  private const val JOB_ID = 7301

  /**
   * Arms the SMS-store trigger. Returns true if a job is (now) scheduled. With `force = false`
   * an already-pending job is left alone — replacing it would throw away a change it had already
   * recorded — so routine "make sure it's armed" calls from JS are cheap and safe.
   */
  fun schedule(context: Context, force: Boolean = false): Boolean {
    return try {
      val scheduler = context.getSystemService(Context.JOB_SCHEDULER_SERVICE) as JobScheduler
      if (!force && scheduler.getPendingJob(JOB_ID) != null) return true

      val job = JobInfo.Builder(JOB_ID, ComponentName(context, SmsStoreJobService::class.java))
        .addTriggerContentUri(
          JobInfo.TriggerContentUri(
            Telephony.Sms.CONTENT_URI,
            JobInfo.TriggerContentUri.FLAG_NOTIFY_FOR_DESCENDANTS
          )
        )
        // Wait briefly after a change so a burst of messages becomes one run, but never sit on
        // one for long.
        .setTriggerContentUpdateDelay(5_000L)
        .setTriggerContentMaxDelay(30_000L)
        .build()
      scheduler.schedule(job) == JobScheduler.RESULT_SUCCESS
    } catch (e: Exception) {
      // e.g. SecurityException before READ_SMS is granted. Retried on the next arm point.
      Log.w("CoinflowSms", "Store trigger not armed: ${e.javaClass.simpleName}")
      false
    }
  }
}
