/**
 * Web build's replacement for `client.ts`. CoinFlow is an Android-only app — the web build
 * exists only so `expo start --web` can preview UI, not for real use — so there is no real
 * SQLite database on web at all. Nothing in the web bundle actually imports `sqlite`/`db` (every
 * screen that touches the database has its own `.web.tsx` sibling that skips database access
 * entirely), so these Proxy stubs should never fire in practice. They exist as a safety net: if
 * some future code accidentally imported real database access on web, it would throw a clear
 * error immediately instead of silently doing nothing or crashing with a confusing native error.
 */

const androidOnly = (): never => {
  throw new Error('coinflow.db is Android-only (D3) — not available on web.');
};

export const sqlite = new Proxy({} as never, { get: androidOnly });
export const db = new Proxy({} as never, { get: androidOnly });
