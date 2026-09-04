/**
 * `exportJson`/`exportCsv` — SPEC-implementation.md §20.8 (D17 / §12 / IMP-043). Read-only, no
 * import in V1. Live rows only (soft-deleted transactions excluded); writes to
 * `Paths.cache` then hands off to `Sharing.shareAsync` — nothing leaves the device except
 * through that user-initiated share sheet (P-9 / IMP-045).
 *
 * Uses the SDK 57 `File`/`Paths` API (not the legacy `FileSystem.writeAsStringAsync`), per
 * `AGENTS.md`'s "read the versioned docs, don't rely on memory of older SDKs" — v57's
 * `expo-file-system` ships `File`/`Directory`/`Paths` as the current API.
 */

import Constants from 'expo-constants';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { getCategoryMap } from '@/db/repositories/categories';
import { format } from 'date-fns';
import { isNull } from 'drizzle-orm';

import { db } from '@/db/client';
import { accountRules, categories, transactions } from '@/db/schema';

function ensureFile(name: string): File {
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  return file;
}

function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** §20.8 — `{ version, exportedAt, transactions[], customCategories[], accountRules[] }`. */
export async function exportJson(): Promise<void> {
  const liveTransactions = db.select().from(transactions).where(isNull(transactions.deletedAt)).all();
  const customCategories = db.select().from(categories).where(isNull(categories.key)).all();
  const rules = db.select().from(accountRules).all();

  const payload = {
    version: Constants.expoConfig?.version ?? '0.0.0',
    exportedAt: Date.now(),
    transactions: liveTransactions,
    customCategories,
    accountRules: rules,
  };

  const file = ensureFile('coinflow-export.json');
  file.write(JSON.stringify(payload, null, 2));
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Export CoinFlow data' });
}

const CSV_HEADER = [
  'date',
  'direction',
  'type',
  'amount',
  'category',
  'paymentMethod',
  'account',
  'note',
  'description',
  'source',
];

/** §20.8 — transactions only; amounts as signed rupees (2dp), `occurredAt` as ISO-8601 local. */
export async function exportCsv(): Promise<void> {
  const liveTransactions = db.select().from(transactions).where(isNull(transactions.deletedAt)).all();
  const categoryById = getCategoryMap();

  const rows = liveTransactions.map((t) => {
    const signedMinor = t.direction === 'debit' ? -t.amountMinor : t.amountMinor;
    // Plain decimal rupees for a spreadsheet — not the UI's Indian-grouped, paise-when-nonzero
    // `formatMoney` (§27.1); §20.8 asks for "two decimals", not that display formatting.
    const amount = (signedMinor / 100).toFixed(2);
    return [
      format(t.occurredAt, "yyyy-MM-dd'T'HH:mm:ssxxx"),
      t.direction,
      t.type,
      amount,
      t.categoryId ? (categoryById.get(t.categoryId)?.name ?? '') : '',
      t.paymentMethod ?? '',
      t.account ?? '',
      t.note ?? '',
      t.description ?? '',
      t.source,
    ].map((v) => csvField(String(v)));
  });

  const csv = [CSV_HEADER, ...rows].map((row) => row.join(',')).join('\n');

  const file = ensureFile('coinflow-transactions.csv');
  file.write(csv);
  await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'Export CoinFlow transactions' });
}

/**
 * §32.3's "Export a copy" escape hatch (`migration-gate.tsx`'s error screen, E7/E8) — a raw copy
 * of the SQLite file itself, for when the database won't even open and the row-level exports
 * above can't run at all (they both read through the repository layer, which needs a working
 * DB connection). `db/client.ts` opens `coinflow.db` at the `expo-sqlite` default location —
 * `<document dir>/SQLite/coinflow.db`.
 */
export async function exportRawDatabaseCopy(): Promise<void> {
  const source = new File(new Directory(Paths.document, 'SQLite'), 'coinflow.db');
  if (!source.exists) throw new Error('no database file found to export');
  const dest = new File(Paths.cache, 'coinflow-raw-backup.db');
  await source.copy(dest, { overwrite: true });
  await Sharing.shareAsync(dest.uri, {
    mimeType: 'application/octet-stream',
    dialogTitle: 'Export a raw copy of your database',
  });
}
