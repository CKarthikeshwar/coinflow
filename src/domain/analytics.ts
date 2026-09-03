/**
 * Small, pure analytics helpers — the parts of §26's math that don't need a DB query.
 * `analyticsRepo` (`src/db/repositories/analytics.ts`) is the SQL half; F9's Analytics screen
 * grows this file with by-category / daily-series / mean / median (§26.4–§26.8).
 */

/**
 * Percent change vs. a comparison figure (§26.3), `null` when there's nothing meaningful to
 * compare against (`previous === 0` — e.g. no prior-month data). Rendered by
 * `formatPercentDelta` (§27.1).
 */
export function percentDelta(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / previous;
}
