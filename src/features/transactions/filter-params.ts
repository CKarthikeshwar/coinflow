/**
 * Transactions route filter params ↔ `TransactionListQuery` — SPEC-UI-UX.md §6.7/§6.9. Pure,
 * no RN/expo imports, so it's unit testable without mounting `transactions.tsx`. The applied
 * filter is stored as plain comma-joined strings in the route's own search params (see
 * `filter-draft.ts`'s header comment); this is the one place that (de)serializes them.
 */

import type { PaymentMethod, TransactionType } from '@/db/schema';

export type RawFilterParams = {
  categoryIds?: string | string[];
  type?: string | string[];
  methods?: string | string[];
  from?: string | string[];
  to?: string | string[];
};

export type ParsedFilter = {
  categoryIds: string[];
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
  const methodsRaw = one(p.methods);
  const typeRaw = one(p.type);
  const fromRaw = one(p.from);
  const toRaw = one(p.to);
  return {
    categoryIds: categoryIdsRaw ? categoryIdsRaw.split(',').filter(Boolean) : [],
    type: typeRaw ? (typeRaw as TransactionType) : undefined,
    methods: methodsRaw ? (methodsRaw.split(',').filter(Boolean) as PaymentMethod[]) : [],
    from: fromRaw ? Number(fromRaw) : undefined,
    to: toRaw ? Number(toRaw) : undefined,
  };
}
