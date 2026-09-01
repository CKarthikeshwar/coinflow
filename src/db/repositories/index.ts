/**
 * Repository layer — the only sanctioned way the app touches the database
 * (SPEC-implementation.md §21). Read hooks (`use*`) auto-refresh on any write, from the UI
 * or a headless task (§21.7). `analyticsRepo` (§21.5 / §26) ships with the Analytics
 * feature; `export` (§20.8) ships with Settings.
 */

export * from './transactions';
export * from './categories';
export * from './account-rules';
export * from './suggestions';
export * from './settings';
