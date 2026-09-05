/**
 * FILE PURPOSE
 * ------------
 * The three ways a user can get their data OFF the device: a full JSON backup, a
 * spreadsheet-friendly CSV of transactions, or (as a last resort) a raw copy of the SQLite file
 * itself. This is export-only — there is no matching "import" in this version of the app.
 *
 * WHERE IT FITS
 * -------------
 * `exportJson`/`exportCsv` are called from `src/app/data.tsx` (Settings › Data). This app never
 * makes network requests on its own (see `src/services/crash/index.ts` for the broader
 * no-network policy) — export is the ONE deliberate way data can leave the device, and even
 * then only through the OS's own native share sheet (`Sharing.shareAsync`), which the user
 * explicitly drives (choosing where to send the file) — nothing is uploaded automatically by
 * this app itself. `exportRawDatabaseCopy` is called from `src/db/migration-gate.tsx`'s error
 * screen — a fallback for the rare case where the database won't even open, so the normal
 * exports (which query through the database) can't run at all.
 *
 * IMPORTANT
 * ---------
 * All three functions read/copy from `Paths.cache`/`Paths.document` using the current
 * `expo-file-system` `File`/`Directory`/`Paths` API — not the older
 * `FileSystem.writeAsStringAsync` style API from earlier Expo SDKs. If you're adding to this
 * file, keep using the same `File`/`Directory` classes rather than mixing API styles.
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
