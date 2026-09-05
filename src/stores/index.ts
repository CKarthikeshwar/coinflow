/**
 * FILE PURPOSE
 * ------------
 * Barrel export for the app's Zustand state stores — small pieces of shared UI state that live
 * in memory only (never saved to disk, and reset to nothing every time the app process
 * restarts). Import from `@/stores` instead of a specific store file when convenient.
 *
 * WHERE IT FITS
 * -------------
 * Every store here is for transient UI state ONLY — draft form values while a sheet is open,
 * which sheet is currently showing, a toast/undo message on screen. Real application data
 * (transactions, categories, settings) never lives in one of these stores; it lives in the
 * SQLite database and is read through the `src/db/repositories/` live-query hooks instead. If
 * you're tempted to put persistent data in a Zustand store, that's the wrong layer — it belongs
 * in a repository/table instead.
 *
 * NOTE
 * ----
 * `src/stores/analytics-period.ts` (remembers which period — month/week, which one — the
 * Analytics tab is currently showing) is NOT re-exported here; it's imported directly by the
 * one screen that uses it (`src/app/(tabs)/analytics.tsx`).
 */

export * from './account-rule-draft';
export * from './add-sheet-draft';
export * from './category-draft';
export * from './keypad';
export * from './filter-draft';
export * from './onboarding';
export * from './sheet-registry';
export * from './toast';
export * from './undo';
