/**
 * categoryRepo — SPEC-implementation.md §21.2. Delete is immediate (no soft-delete):
 * reassign the category's transactions to Uncategorized (`categoryId = NULL`) then delete,
 * in one transaction; the reassigned count feeds the confirm dialog (§6.11 / IMP-018).
 */

import { asc, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';

import { useLiveQuery } from '@/hooks/use-live-query';

import { db } from '../client';
import { categories, transactions, type Category } from '../schema';

export class DuplicateCategoryNameError extends Error {
  constructor(name: string) {
    super(`A category named "${name}" already exists.`);
    this.name = 'DuplicateCategoryNameError';
  }
}

export class ProtectedCategoryError extends Error {
  constructor() {
    super('This category is protected and cannot be deleted.');
    this.name = 'ProtectedCategoryError';
  }
}

export function useCategories() {
  return useLiveQuery(db.select().from(categories).orderBy(asc(categories.order)));
}

export function listCategories(): Category[] {
  return db.select().from(categories).orderBy(asc(categories.order)).all();
}

export function getCategoryMap(): Map<string, Category> {
  return new Map(listCategories().map((c) => [c.id, c]));
}

export const getCategoryMapSync = getCategoryMap;

function nameTaken(name: string, exceptId?: string): boolean {
  const row = db
    .select({ id: categories.id })
    .from(categories)
    .where(sql`lower(${categories.name}) = lower(${name})`)
    .get();
  return !!row && row.id !== exceptId;
}

export function createCategory(input: { name: string; icon: string }): Category {
  const name = input.name.trim();
  if (nameTaken(name)) throw new DuplicateCategoryNameError(name);
  const now = Date.now();
  const maxOrder = db.select({ v: sql<number>`coalesce(max(${categories.order}), 0)` }).from(categories).get();
  const row: Category = {
    id: randomUUID(),
    key: null,
    name,
    icon: input.icon,
    kind: 'custom',
    isProtected: false,
    order: (maxOrder?.v ?? 0) + 1,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(categories).values(row).run();
  return row;
}

export function updateCategory(
  id: string,
  patch: { name?: string; icon?: string; order?: number },
): void {
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (nameTaken(name, id)) throw new DuplicateCategoryNameError(name);
  }
  db.update(categories)
    .set({
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.icon !== undefined ? { icon: patch.icon } : {}),
      ...(patch.order !== undefined ? { order: patch.order } : {}),
      updatedAt: Date.now(),
    })
    .where(eq(categories.id, id))
    .run();
}

/** Powers the delete-confirm dialog's "N transactions become Uncategorized" body (§6.11). */
export function countTransactionsForCategory(id: string): number {
  const row = db
    .select({ n: sql<number>`count(*)` })
    .from(transactions)
    .where(eq(transactions.categoryId, id))
    .get();
  return row?.n ?? 0;
}

/** Reassigns the category's transactions to Uncategorized, then deletes it. */
export function deleteCategory(id: string): { reassigned: number } {
  const target = db.select().from(categories).where(eq(categories.id, id)).get();
  if (!target) return { reassigned: 0 };
  if (target.isProtected) throw new ProtectedCategoryError();

  let reassigned = 0;
  db.transaction((tx) => {
    const res = tx
      .update(transactions)
      .set({ categoryId: null, updatedAt: Date.now() })
      .where(eq(transactions.categoryId, id))
      .run();
    reassigned = res.changes ?? 0;
    tx.delete(categories).where(eq(categories.id, id)).run();
  });
  return { reassigned };
}

export function reorderCategories(idsInOrder: string[]): void {
  const now = Date.now();
  db.transaction((tx) => {
    idsInOrder.forEach((id, i) => {
      tx.update(categories).set({ order: i, updatedAt: now }).where(eq(categories.id, id)).run();
    });
  });
}
