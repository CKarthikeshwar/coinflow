/**
 * Repository layer — the only sanctioned way the app touches the database
 * (SPEC-implementation.md §21). Read hooks (`use*`) auto-refresh on any write, from the UI
 * or a headless task (§21.7). `analyticsRepo` (§21.5 / §26) started with Home's slice
 * (running balance, period summary, MoM deltas, uncategorized count — F6.5); F9's Analytics
 * screen adds the rest (by-category, largest expenses, daily series, mean/median, week mode).
 * `export` (§20.8) ships with Settings (F8.5).
 */

export * from './transactions';
export * from './categories';
export * from './account-rules';
export * from './suggestions';
export * from './settings';
export * from './analytics';
