-- Full-text search for the Transactions list (SPEC-implementation.md §19.6 / IMP-015).
-- Drizzle can't model FTS5, so this ships as a hand-written migration.
--
-- The `transaction.searchText` column (created in 0000) is the D27 fallback: if a device's
-- SQLite lacks FTS5 (probed at startup by src/db/fts.ts), the repo queries
-- `searchText LIKE ?` instead. Repo writes keep `searchText` in sync regardless.
-- SDK 57 ships FTS5 on by default, so the FTS path below is the expected one.

CREATE VIRTUAL TABLE `transaction_fts` USING fts5(
  note, description, account,
  content='transaction', content_rowid='rowid'
);
--> statement-breakpoint
CREATE TRIGGER `transaction_fts_ai` AFTER INSERT ON `transaction` BEGIN
  INSERT INTO transaction_fts(rowid, note, description, account)
  VALUES (new.rowid, new.note, new.description, new.account);
END;
--> statement-breakpoint
CREATE TRIGGER `transaction_fts_ad` AFTER DELETE ON `transaction` BEGIN
  INSERT INTO transaction_fts(transaction_fts, rowid, note, description, account)
  VALUES ('delete', old.rowid, old.note, old.description, old.account);
END;
--> statement-breakpoint
CREATE TRIGGER `transaction_fts_au` AFTER UPDATE ON `transaction` BEGIN
  INSERT INTO transaction_fts(transaction_fts, rowid, note, description, account)
  VALUES ('delete', old.rowid, old.note, old.description, old.account);
  INSERT INTO transaction_fts(rowid, note, description, account)
  VALUES (new.rowid, new.note, new.description, new.account);
END;
