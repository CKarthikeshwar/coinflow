/**
 * FILE PURPOSE
 * ------------
 * Converts the Transactions screen's filter state to and from URL/route query-param strings
 * (e.g. `?categoryIds=abc,def&uncategorized=1`) — this is what lets an active filter be part of
 * the route itself rather than living only in memory (see `filter-draft.ts`'s header for why
 * that split exists). Kept pure (no react-native/expo imports) so it's unit-testable without
 * mounting the whole Transactions screen.
 *
 * WHERE IT FITS
 * -------------
 * `src/app/(tabs)/transactions.tsx` calls `parseFilterParams` on its own route params to build
 * the `TransactionListQuery` it passes to `useTransactionList`
 * (`src/db/repositories/transactions.ts`); `filter-sheet.tsx`'s Apply button writes the reverse
 * direction back into the route via `router.setParams`.
 */

import type { PaymentMethod, TransactionType } from '@/db/schema';

export type RawFilterParams = {
  categoryIds?: string | string[];
  /** F7 — "1" when set; not a real `category.id` (§25.3), so it's its own param. */
  uncategorized?: string | string[];
  type?: string | string[];
  methods?: string | string[];
  from?: string | string[];
  to?: string | string[];
};

export type ParsedFilter = {
  categoryIds: string[];
  uncategorized: boolean;
  type: TransactionType | undefined;
  methods: PaymentMethod[];
  from: number | undefined;
  to: number | undefined;
};

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function parseFilterParams(p: RawFilterParams): ParsedFilter {
  const categoryIdsRaw = one(p.categoryIds);
  const uncategorizedRaw = one(p.uncategorized);
  const methodsRaw = one(p.methods);
  const typeRaw = one(p.type);
  const fromRaw = one(p.from);
  const toRaw = one(p.to);
  return {
    categoryIds: categoryIdsRaw ? categoryIdsRaw.split(',').filter(Boolean) : [],
    uncategorized: uncategorizedRaw === '1',
    type: typeRaw ? (typeRaw as TransactionType) : undefined,
    methods: methodsRaw ? (methodsRaw.split(',').filter(Boolean) as PaymentMethod[]) : [],
    from: fromRaw ? Number(fromRaw) : undefined,
    to: toRaw ? Number(toRaw) : undefined,
  };
}
