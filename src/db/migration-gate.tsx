/**
 * Blocks first paint until migrations resolve, then runs seed + purge once, then renders
 * the app (SPEC-implementation.md §20.4). The native splash stays up while this returns
 * `null`. On migration failure it shows a non-dismissible screen — no raw SQL, no
 * auto-wipe.
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
