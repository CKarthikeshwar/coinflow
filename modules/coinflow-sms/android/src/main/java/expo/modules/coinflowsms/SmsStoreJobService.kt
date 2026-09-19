package expo.modules.coinflowsms

import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import android.provider.Telephony
import android.util.Log
import com.facebook.react.ReactApplication
import com.facebook.react.ReactInstanceEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.jstasks.HeadlessJsTaskContext
import com.facebook.react.jstasks.HeadlessJsTaskEventListener
import java.util.concurrent.CopyOnWriteArraySet

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
 * scheduled again to catch the next change — then (2) runs the `CoinflowSmsStoreChanged` headless JS
 * task ITSELF (CR-20) and keeps the job alive until that task reports it has finished. It must not
 * `startService`: on Android 12+ an app idle in the background is refused with
 * `BackgroundServiceStartNotAllowedException` (seen on an Android 16 Samsung, where the original
 * hand-off to `CoinflowSmsHeadlessTaskService` was dropped). The steps below mirror what
 * React Native's own `HeadlessJsTaskService` does. No parsing / DB / notification work happens in
 * Kotlin (D18/D24) and no message text passes through here.
 *
 * LIMITS
 * ------
 * A trigger job cannot be persisted across reboots (`JobInfo` rejects `setPersisted` together with
 * a trigger URI), so after a reboot it is gone until JS re-arms it — on any app launch/foreground,
 * on every headless JS start, and from the periodic background reconcile task (§17.9). It is also
 * subject to Doze / App Standby, so on an idle phone it can run late rather than instantly.
 */
class SmsStoreJobService : JobService(), HeadlessJsTaskEventListener {
  private val activeTasks = CopyOnWriteArraySet<Int>()
  @Volatile private var jobParams: JobParameters? = null
  @Volatile private var jsContext: HeadlessJsTaskContext? = null

  override fun onStartJob(params: JobParameters?): Boolean {
    // Re-arm FIRST, before any work, so a message arriving while we run is not missed. Uses the OTHER
    // job id: re-scheduling the id that is currently running would make Android cancel this very run.
    SmsStoreTrigger.rearmFrom(applicationContext, params?.jobId ?: -1)
    jobParams = params
    return try {
      val host = (application as ReactApplication).reactHost
        ?: throw IllegalStateException("no ReactHost")
      val config = HeadlessJsTaskConfig(
        "CoinflowSmsStoreChanged",
        Arguments.createMap(),
        60_000L,
        true // allowedInForeground
      )
      UiThreadUtil.runOnUiThread {
        try {
          val existing = host.currentReactContext
          if (existing != null) {
            startTask(existing, config)
          } else {
            host.addReactInstanceEventListener(object : ReactInstanceEventListener {
              override fun onReactContextInitialized(context: ReactContext) {
                host.removeReactInstanceEventListener(this)
                startTask(context, config)
              }
            })
            host.start()
          }
        } catch (e: Exception) {
          Log.w("CoinflowSms", "Store trigger dropped: ${e.javaClass.simpleName}")
          finish(false)
        }
      }
      true // work continues on the JS side; ended by finish() when the task reports back
    } catch (e: Exception) {
      // No PII in the log — class name only (§17.2).
      Log.w("CoinflowSms", "Store trigger dropped: ${e.javaClass.simpleName}")
      false
    }
  }

  private fun startTask(context: ReactContext, config: HeadlessJsTaskConfig) {
    val taskContext = HeadlessJsTaskContext.getInstance(context)
    jsContext = taskContext
    taskContext.addTaskEventListener(this)
    activeTasks.add(taskContext.startTask(config))
  }

  override fun onHeadlessJsTaskStart(taskId: Int) = Unit

  override fun onHeadlessJsTaskFinish(taskId: Int) {
    activeTasks.remove(taskId)
    if (activeTasks.isEmpty()) finish(false)
  }

  private fun finish(reschedule: Boolean) {
    jsContext?.removeTaskEventListener(this)
    jsContext = null
    val p = jobParams ?: return
    jobParams = null
    jobFinished(p, reschedule)
  }

  override fun onStopJob(params: JobParameters?): Boolean {
    // System is ending the job early (constraint change / timeout). The trigger was already re-armed.
    jsContext?.removeTaskEventListener(this)
    jsContext = null
    jobParams = null
    return false
  }
}

object SmsStoreTrigger {
  // Two alternating ids (CR-20): a trigger job fires once, and re-scheduling the id of the job that is
  // running cancels that run — so the running job arms the other id instead.
  private const val JOB_ID_A = 7301
  private const val JOB_ID_B = 7302

  /**
   * Makes sure a trigger job is pending. Returns true if one is (now) scheduled. An already-pending
   * job is left alone — replacing it would throw away a change it had already recorded — so routine
   * "make sure it's armed" calls from JS are cheap and safe.
   */
  fun schedule(context: Context): Boolean {
    return try {
      val scheduler = context.getSystemService(Context.JOB_SCHEDULER_SERVICE) as JobScheduler
      if (scheduler.getPendingJob(JOB_ID_A) != null || scheduler.getPendingJob(JOB_ID_B) != null) return true
      arm(context, scheduler, JOB_ID_A)
    } catch (e: Exception) {
      // e.g. SecurityException before READ_SMS is granted. Retried on the next arm point.
      Log.w("CoinflowSms", "Store trigger not armed: ${e.javaClass.simpleName}")
      false
    }
  }

  /** Called by the running job: arm the id that is NOT running (unless it is already pending). */
  fun rearmFrom(context: Context, runningJobId: Int): Boolean {
    return try {
      val scheduler = context.getSystemService(Context.JOB_SCHEDULER_SERVICE) as JobScheduler
      val target = if (runningJobId == JOB_ID_A) JOB_ID_B else JOB_ID_A
      if (scheduler.getPendingJob(target) != null) return true
      arm(context, scheduler, target)
    } catch (e: Exception) {
      Log.w("CoinflowSms", "Store trigger not re-armed: ${e.javaClass.simpleName}")
      false
    }
  }

  private fun arm(context: Context, scheduler: JobScheduler, id: Int): Boolean {
    val job = JobInfo.Builder(id, ComponentName(context, SmsStoreJobService::class.java))
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
    return scheduler.schedule(job) == JobScheduler.RESULT_SUCCESS
  }
}
