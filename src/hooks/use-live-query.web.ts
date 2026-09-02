/**
 * CoinFlow is Android-only (D3). `drizzle-orm/expo-sqlite`'s `useLiveQuery` statically imports
 * the real `expo-sqlite` web implementation — a WASM-backed worker this project doesn't bundle
 * for web (and shouldn't need to: no CoinFlow screen reads live data on web, §18.3). Every
 * repository imports `useLiveQuery` from `./use-live-query` rather than the package directly, so
 * swapping this one file keeps that whole import graph off web instead of stubbing each
 * repository file individually.
 *
 * The query argument itself (built with `@/db/client`'s `db`, already a throwing stub on web)
 * still throws loudly if anything actually calls a repo hook on web — this stub only stops the
 * *bundling* failure; nothing renders a live query on web by design.
 */
export function useLiveQuery<T>(
  _query: unknown,
  _deps?: unknown[],
): { data: T | undefined; error: Error | undefined; updatedAt: Date | undefined } {
  return { data: undefined, error: undefined, updatedAt: undefined };
}
