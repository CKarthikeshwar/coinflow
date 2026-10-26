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

  /** CR-34 (§46.10) — one row of the Balances widget. */
  data class AccountItem(val nickname: String, val balanceMinor: Long, val asOf: Long)

  /** CR-34 — the Balances widget's block; absent in a snapshot published by an older app build. */
  data class Accounts(val totalMinor: Long, val knownCount: Int, val updatedAt: Long, val items: List<AccountItem>)

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
    val accounts: Accounts?,
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
            accounts = parseAccounts(o),
          )
        }
      } catch (e: Exception) {
        Log.w(TAG, "snapshot did not parse: ${e.javaClass.simpleName}")
        null
      }

      /** Additive key (the snapshot stays `v: 1`): a malformed block only blanks the Balances widget. */
      private fun parseAccounts(o: JSONObject): Accounts? = try {
        o.optJSONObject("accounts")?.let { a ->
          val arr = a.getJSONArray("items")
          Accounts(
            totalMinor = a.getLong("totalMinor"),
            knownCount = a.getInt("knownCount"),
            updatedAt = a.optLong("updatedAt", 0),
            items = (0 until arr.length()).map {
              val r = arr.getJSONObject(it)
              AccountItem(r.optString("nickname", ""), r.getLong("balanceMinor"), r.optLong("asOf", 0))
            },
          )
        }
      } catch (e: Exception) {
        Log.w(TAG, "accounts block did not parse: ${e.javaClass.simpleName}")
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

  /** Redraws every placed instance of the four widgets from the stored snapshot. */
  fun refreshAll(context: Context) {
    val app = context.applicationContext
    val manager = AppWidgetManager.getInstance(app)
    for (provider in listOf(SummaryWidgetProvider(), QueueWidgetProvider(), QuickAddWidgetProvider(), BalancesWidgetProvider())) {
      val ids = manager.getAppWidgetIds(ComponentName(app, provider.javaClass))
      if (ids.isNotEmpty()) provider.onUpdate(app, manager, ids)
    }
  }
}
