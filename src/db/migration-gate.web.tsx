import type { ReactNode } from 'react';

// CoinFlow is Android-only (D3). There's no database on web — render straight through.
export function MigrationGate({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
