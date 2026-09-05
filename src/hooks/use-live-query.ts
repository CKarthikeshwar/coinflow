/**
 * FILE PURPOSE
 * ------------
 * Re-exports Drizzle's `useLiveQuery` — the hook that makes a database query automatically
 * re-run and re-render its component whenever the underlying data changes (relies on
 * `src/db/client.ts`'s `enableChangeListener: true`). Every `use*` hook in
 * `src/db/repositories/*.ts` is built on this.
 *
 * WHERE IT FITS
 * -------------
 * This tiny indirection exists so every repository file imports from `@/hooks/use-live-query`
 * instead of `drizzle-orm/expo-sqlite` directly — which is what lets the `.web.ts` sibling of
 * this exact file (see below) swap in a safe no-op version for the web build, without needing
 * to touch every individual repository file to special-case web.
 */
export { useLiveQuery } from 'drizzle-orm/expo-sqlite';
