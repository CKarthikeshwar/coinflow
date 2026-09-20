package expo.modules.coinflowsms

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.util.Log
import org.json.JSONObject

/**
 * FILE PURPOSE
 * ------------
 * Holds the widget snapshot (SPEC-implementation.md §44.2) and tells the three home-screen widgets to redraw
 * (§44.3). JS is the only writer: it computes the snapshot and calls `publish`; the providers only ever *read*
 * it (IMP-091) — nothing here queries the app's database or needs a JS runtime.
 *
 * The snapshot is an opaque JSON string in `SharedPreferences("coinflow_widgets")`. It is parsed lazily by the
 * providers via [Snapshot.parse]; a value that does not parse is treated as "never opened" rather than crashing
 * a launcher-hosted process.
 */
object WidgetStore {
  private const val TAG = "CoinflowWidgets"
  private const val PREFS = "coinflow_widgets"
  private const val KEY = "snapshot"

  /** One row of the queue widget. */
  data class Item(val id: String, val amountMinor: Long, val isDebit: Boolean, val label: String)

  /** Parsed schema v1 (§44.2). */
  data class Snapshot(
    val periodEndMs: Long,
    val periodLabel: String,
    val incomeMinor: Long,
    val spentMinor: Long,
    val balanceMinor: Long,
    val pendingCount: Int,
    val items: List<Item>,
    val hideAmounts: Boolean,
  ) {
    companion object {
      fun parse(json: String): Snapshot? = try {
        val o = JSONObject(json)
        if (o.optInt("v", 0) != 1) {
          null
        } else {
          val pending = o.getJSONObject("pending")
          val arr = pending.getJSONArray("items")
          val items = (0 until arr.length()).map {
            val r = arr.getJSONObject(it)
            Item(r.getString("id"), r.getLong("amountMinor"), r.getString("direction") == "debit", r.optString("label", ""))
          }
          Snapshot(
            periodEndMs = o.getLong("periodEndMs"),
            periodLabel = o.optString("periodLabel", ""),
            incomeMinor = o.getLong("incomeMinor"),
            spentMinor = o.getLong("spentMinor"),
            balanceMinor = o.getLong("balanceMinor"),
            pendingCount = pending.getInt("count"),
            items = items,
            hideAmounts = o.optBoolean("hideAmounts", false),
          )
        }
      } catch (e: Exception) {
        Log.w(TAG, "snapshot did not parse: ${e.javaClass.simpleName}")
        null
      }
    }
  }

  /** Stores the snapshot and redraws every widget. Returns false (never throws) if it is malformed or unwritable. */
  fun publish(context: Context, json: String): Boolean {
    return try {
      if (Snapshot.parse(json) == null) return false
      context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, json).apply()
      refreshAll(context)
      true
    } catch (e: Exception) {
      Log.w(TAG, "publish failed: ${e.javaClass.simpleName}")
      false
    }
  }

  fun read(context: Context): Snapshot? {
    val json = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null)
    return json?.let { Snapshot.parse(it) }
  }

  /** Redraws every placed instance of the three widgets from the stored snapshot. */
  fun refreshAll(context: Context) {
    val app = context.applicationContext
    val manager = AppWidgetManager.getInstance(app)
    for (provider in listOf(SummaryWidgetProvider(), QueueWidgetProvider(), QuickAddWidgetProvider())) {
      val ids = manager.getAppWidgetIds(ComponentName(app, provider.javaClass))
      if (ids.isNotEmpty()) provider.onUpdate(app, manager, ids)
    }
  }
}
