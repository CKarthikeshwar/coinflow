/**
 * Blocks first paint until migrations resolve, then runs seed + purge once, then renders
 * the app (SPEC-implementation.md §20.4). The native splash stays up while this returns
 * `null`. On migration failure it shows a non-dismissible screen — no raw SQL, no
 * auto-wipe.
 */

import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { DevSettings, StyleSheet, View } from 'react-native';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { Colors, Spacing } from '@/constants/theme';
import { Icon } from '@/ui/icon';
import { ThemedText } from '@/ui/themed-text';

import { db } from './client';
import { isFtsAvailable } from './fts';
import migrationsBundle from './migrations/migrations';
import { purge } from './maintenance';
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
      // TODO(step 5 / §32): report to Sentry (no row data).
      console.warn('[MigrationGate] post-migration maintenance failed', e);
    }
    setPostMigrateDone(true);
  }, [success]);

  if (error) return <MigrationErrorScreen />;
  if (!success || !postMigrateDone) return null; // native splash stays up

  return <>{children}</>;
}

function MigrationErrorScreen() {
  // TODO(step 5 / §32): production Retry via expo-updates `reloadAsync`, plus the
  // "Export a copy" escape hatch once §20.8 export lands. Reported to Sentry with no row data.
  return (
    <View style={styles.error}>
      <Icon name="triangle-alert" size={28} color="text2" />
      <ThemedText type="title">CoinFlow can’t open your data</ThemedText>
      <ThemedText type="body" style={styles.errorBody}>
        Something went wrong reading the database on this device. Your data has not been changed.
      </ThemedText>
      <ThemedText type="label" onPress={() => DevSettings.reload()} style={styles.retry}>
        Try again
      </ThemedText>
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
});
