package expo.modules.coinflowsms

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.view.View
import android.widget.RemoteViews
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * FILE PURPOSE
 * ------------
 * The three home-screen widgets (SPEC-implementation.md §44.4, SPEC-UI-UX.md §6.22–§6.24): Money summary, Queue
 * ("To review") and Quick add. Each is a plain `AppWidgetProvider` drawing `RemoteViews` from the snapshot JS
 * published (`WidgetStore`) — providers never compute anything (IMP-091) and need no permission (IMP-097).
 *
 * BEHAVIOUR NOTES
 * ---------------
 * - Sizes: one layout per widget; the resize variant is chosen from the launcher-reported size and shown by
 *   toggling visibility (summary 2×2 drops Income; queue 4×2 shows 2 rows, 4×3 shows 3; quick add 2×1 adds the
 *   label).
 * - Stale month (§44.5): past `periodEndMs` the figures render `—` and the header shows the *current* month,
 *   computed here — the next app run / headless task / 30-min tick republishes.
 * - Hide amounts (§44.6): every ₹ figure becomes `••••`; labels are never masked.
 * - Taps are `ACTION_VIEW` on `coinflow://…` links (`FLAG_IMMUTABLE`); the app's expo-router handles cold start.
 */

private const val TAG = "CoinflowWidgets"
private const val MASK = "••••"
private const val DASH = "—"

private fun linkIntent(ctx: Context, requestCode: Int, uri: String): PendingIntent {
  val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uri)).setPackage(ctx.packageName)
  return PendingIntent.getActivity(ctx, requestCode, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
}

/** `₹1,23,456` (Indian grouping), `−₹842` for negatives; paise only when non-zero — mirrors `formatMoney`. */
internal fun formatRupees(minor: Long): String {
  val neg = minor < 0
  val abs = Math.abs(minor)
  val rupees = (abs / 100).toString()
  val paise = (abs % 100).toInt()
  val grouped = if (rupees.length <= 3) {
    rupees
  } else {
    val last3 = rupees.takeLast(3)
    val rest = rupees.dropLast(3).reversed().chunked(2).joinToString(",").reversed()
    "$rest,$last3"
  }
  val body = "₹$grouped" + if (paise != 0) "." + paise.toString().padStart(2, '0') else ""
  return if (neg) "−$body" else body
}

private fun money(minor: Long, hide: Boolean, stale: Boolean = false): String =
  if (stale) DASH else if (hide) MASK else formatRupees(minor)

private fun currentMonthName(): String = SimpleDateFormat("MMMM", Locale.getDefault()).format(Date())

abstract class BaseWidgetProvider : AppWidgetProvider() {
  protected abstract fun render(ctx: Context, appWidgetId: Int, options: Bundle): RemoteViews

  override fun onUpdate(context: Context, manager: AppWidgetManager, appWidgetIds: IntArray) {
    for (id in appWidgetIds) update(context, manager, id)
  }

  override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, appWidgetId: Int, newOptions: Bundle) {
    update(context, manager, appWidgetId)
  }

  private fun update(context: Context, manager: AppWidgetManager, id: Int) {
    try {
      manager.updateAppWidget(id, render(context, id, manager.getAppWidgetOptions(id)))
    } catch (e: Exception) {
      // A broken widget must never take the launcher's binder call down with it.
      Log.w(TAG, "render failed: ${e.javaClass.simpleName}")
    }
  }
}

/** Money summary — Balance (Income − Spent) large, with Income / Spent under it (§6.22). */
class SummaryWidgetProvider : BaseWidgetProvider() {
  override fun render(ctx: Context, appWidgetId: Int, options: Bundle): RemoteViews {
    val v = RemoteViews(ctx.packageName, R.layout.cf_widget_summary)
    v.setOnClickPendingIntent(R.id.cf_root, linkIntent(ctx, appWidgetId, "coinflow://"))

    // 2×2 (narrow) shows Balance + Spent only; 4×2 adds Income.
    val narrow = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250) < 200
    v.setViewVisibility(R.id.cf_income_col, if (narrow) View.GONE else View.VISIBLE)

    val s = WidgetStore.read(ctx)
    if (s == null) { // never opened / unreadable
      v.setTextViewText(R.id.cf_header, currentMonthName())
      v.setViewVisibility(R.id.cf_content, View.GONE)
      v.setViewVisibility(R.id.cf_message, View.VISIBLE)
      return v
    }
    v.setViewVisibility(R.id.cf_content, View.VISIBLE)
    v.setViewVisibility(R.id.cf_message, View.GONE)

    val stale = System.currentTimeMillis() >= s.periodEndMs
    v.setTextViewText(R.id.cf_header, if (stale) currentMonthName() else s.periodLabel)
    v.setTextViewText(R.id.cf_balance, money(s.balanceMinor, s.hideAmounts, stale))
    v.setTextViewText(R.id.cf_income, money(s.incomeMinor, s.hideAmounts, stale))
    v.setTextViewText(R.id.cf_spent, money(s.spentMinor, s.hideAmounts, stale))
    return v
  }
}

/** Queue — count pill + up to 3 pending rows, newest first (§6.23). */
class QueueWidgetProvider : BaseWidgetProvider() {
  private val rows = arrayOf(
    Triple(R.id.cf_row1, R.id.cf_row1_arrow, Pair(R.id.cf_row1_label, R.id.cf_row1_amount)),
    Triple(R.id.cf_row2, R.id.cf_row2_arrow, Pair(R.id.cf_row2_label, R.id.cf_row2_amount)),
    Triple(R.id.cf_row3, R.id.cf_row3_arrow, Pair(R.id.cf_row3_label, R.id.cf_row3_amount)),
  )

  override fun render(ctx: Context, appWidgetId: Int, options: Bundle): RemoteViews {
    val v = RemoteViews(ctx.packageName, R.layout.cf_widget_queue)
    v.setOnClickPendingIntent(R.id.cf_root, linkIntent(ctx, appWidgetId * 10, "coinflow://review"))

    // 4×2 fits count + 2 rows; 4×3 fits 3 (no 2×2 variant — dropped by the user, 2026-09-19).
    val maxRows = if (options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 110) >= 150) 3 else 2

    val s = WidgetStore.read(ctx)
    val items = s?.items ?: emptyList()

    if (s == null || s.pendingCount == 0) {
      v.setViewVisibility(R.id.cf_count, View.GONE)
      for (r in rows) v.setViewVisibility(r.first, View.GONE)
      v.setViewVisibility(R.id.cf_more, View.GONE)
      v.setViewVisibility(R.id.cf_empty, View.VISIBLE)
      v.setTextViewText(R.id.cf_empty, if (s == null) "Open CoinFlow to set up" else "✓  All caught up")
      return v
    }

    v.setViewVisibility(R.id.cf_empty, View.GONE)
    v.setViewVisibility(R.id.cf_count, View.VISIBLE)
    v.setTextViewText(R.id.cf_count, if (s.pendingCount > 99) "99+" else s.pendingCount.toString())

    val shown = minOf(maxRows, items.size)
    for ((i, r) in rows.withIndex()) {
      if (i < shown) {
        val item = items[i]
        v.setViewVisibility(r.first, View.VISIBLE)
        v.setTextViewText(r.second, if (item.isDebit) "↗" else "↙")
        v.setTextViewText(r.third.first, item.label)
        v.setTextViewText(r.third.second, money(item.amountMinor, s.hideAmounts))
        v.setOnClickPendingIntent(r.first, linkIntent(ctx, appWidgetId * 10 + i + 1, "coinflow://review?open=${Uri.encode(item.id)}"))
      } else {
        v.setViewVisibility(r.first, View.GONE)
      }
    }

    val more = s.pendingCount - shown
    if (more > 0) {
      v.setViewVisibility(R.id.cf_more, View.VISIBLE)
      v.setTextViewText(R.id.cf_more, "+$more more")
    } else {
      v.setViewVisibility(R.id.cf_more, View.GONE)
    }
    return v
  }
}

/** Quick add — a "+" tile (1×1); at 2×1 it also shows the label. Shows no data (§6.24). */
class QuickAddWidgetProvider : BaseWidgetProvider() {
  override fun render(ctx: Context, appWidgetId: Int, options: Bundle): RemoteViews {
    val v = RemoteViews(ctx.packageName, R.layout.cf_widget_quickadd)
    v.setOnClickPendingIntent(R.id.cf_root, linkIntent(ctx, appWidgetId * 10 + 5, "coinflow://add"))
    val wide = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 40) >= 110
    v.setViewVisibility(R.id.cf_label, if (wide) View.VISIBLE else View.GONE)
    return v
  }
}
