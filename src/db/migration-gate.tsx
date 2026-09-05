/**
 * FILE PURPOSE
 * ------------
 * `<MigrationGate>` wraps the entire app and controls what's allowed to render before the
 * database is actually ready. It blocks rendering the real app until SQLite migrations finish,
 * then runs one-time startup housekeeping (seeding default categories, purging old soft-deleted
 * rows), and only then renders its `children` (the real app).
 *
 * WHERE IT FITS
 * -------------
 * This is one of the very first things that runs when the app launches — see
 * `src/app/_layout.tsx` for where it wraps the router. While this component is still waiting
 * (`success` false, or the post-migration effect hasn't finished), it renders `null`, which
 * means the native splash screen (started in `_layout.tsx`) stays visible instead of the user
 * seeing a flash of a broken/empty screen.
 *
 * DATA FLOW
 * ---------
 *   App launches
 *     ↓
 *   MigrationGate mounts, calls Drizzle's `useMigrations` hook
 *     ↓ (while pending: renders null, native splash stays up)
 *   migrations succeed
 *     ↓
 *   one-time effect: seedDatabase() → purge() → isFtsAvailable() → armCrashReporting(...)
 *     ↓
 *   renders `children` — the real app takes over
 *
 * IMPORTANT
 * ---------
 * If migrations fail (a corrupted or unreadable database), this component shows a dedicated,
 * non-dismissible error screen instead of the app — deliberately not auto-wiping the user's
 * data or running raw recovery SQL. The only actions offered are "Try again" (reload) and
 * "Export a copy" (copies the raw `.db` file off-device via the OS share sheet, in case the
 * data is still recoverable another way) — see `src/features/settings/export.ts`.
 */

import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { reloadAppAsync } from 'expo';
import { StyleSheet, View } from 'react-native';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { Colors, Spacing } from '@/constants/theme';
import { exportRawDatabaseCopy } from '@/features/settings/export';
import { log } from '@/lib/log';
import { armCrashReporting } from '@/services/crash';
import { Icon } from '@/ui/icon';
import { ThemedText } from '@/ui/themed-text';

import { db } from './client';
import { isFtsAvailable } from './fts';
import migrationsBundle from './migrations/migrations';
import { purge } from './maintenance';
import { getSetting } from './repositories/settings';
import { seedDatabase } from './seed';

const migrations = migrationsBundle as unknown as Parameters<typeof useMigrations>[1];

export function MigrationGate({ children }: { children: ReactNode }) {
  const { success, error } = useMigrations(db, migrations);
  const [postMigrateDone, setPostMigrateDone] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (!success || ran.current) return;
    ran.current = true;
    try {
      seedDatabase();
      purge();
      isFtsAvailable(); // warm the probe before the first search query
    } catch (e) {
      // Seed / purge are not migrations — a hiccup here must not brick the app.
      log.warn(e, 'migration-gate/post-migrate');
    }
    // §22.4: read once at startup to arm/disarm Sentry; §33.4 default is off.
    armCrashReporting(getSetting('crashReportingEnabled', false));
    setPostMigrateDone(true);
  }, [success]);

  if (error) return <MigrationErrorScreen error={error} />;
  if (!success || !postMigrateDone) return null; // native splash stays up

  return <>{children}</>;
}

function MigrationErrorScreen({ error }: { error: Error }) {
  const [exportState, setExportState] = useState<'idle' | 'exporting' | 'error'>('idle');

  useEffect(() => {
    log.error(error, 'migration-gate/migration');
  }, [error]);

  const handleExport = async () => {
    setExportState('exporting');
    try {
      await exportRawDatabaseCopy();
      setExportState('idle');
    } catch (e) {
      log.warn(e, 'migration-gate/export-raw');
      setExportState('error');
    }
  };

  return (
    <View style={styles.error}>
      <Icon name="triangle-alert" size={28} color="text2" />
      <ThemedText type="title">CoinFlow can’t open your data</ThemedText>
      <ThemedText type="body" style={styles.errorBody}>
        Something went wrong reading the database on this device. Your data has not been changed.
      </ThemedText>
      <ThemedText
        type="label"
        onPress={() => {
          reloadAppAsync('Migration error — user tapped Try again');
        }}
        style={styles.retry}
      >
        Try again
      </ThemedText>
      <ThemedText
        type="label"
        themeColor="text2"
        onPress={exportState === 'exporting' ? undefined : handleExport}
        style={styles.exportLink}
      >
        {exportState === 'exporting' ? 'Exporting…' : 'Export a copy'}
      </ThemedText>
      {exportState === 'error' ? (
        <ThemedText type="caption" themeColor="text3" style={styles.exportError}>
          Couldn’t export a copy — try again.
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  error: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.five,
    gap: Spacing.three,
    backgroundColor: Colors.dark.bg,
  },
  errorBody: { textAlign: 'center' },
  retry: { color: Colors.dark.text, paddingVertical: Spacing.two },
  exportLink: { paddingVertical: Spacing.one },
  exportError: { marginTop: -Spacing.two, textAlign: 'center' },
});
