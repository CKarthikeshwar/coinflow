/**
 * Web stub. CoinFlow is Android-only (D3); the database never loads on web
 * (SPEC-implementation.md §18.3). Nothing in the web bundle imports this — the stub
 * exists so the platform-file split is complete and any accidental web use fails loudly.
 */

const androidOnly = (): never => {
  throw new Error('coinflow.db is Android-only (D3) — not available on web.');
};

export const sqlite = new Proxy({} as never, { get: androidOnly });
export const db = new Proxy({} as never, { get: androidOnly });
