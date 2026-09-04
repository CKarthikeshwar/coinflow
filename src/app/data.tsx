/**
 * Data — SPEC-UI-UX.md §6.14, SPEC-implementation.md §20.7/§20.8/§30.16 (IMP-043/044, UI-065).
 * F8.5. Export (JSON + CSV via the OS share sheet) and Clear all data (two-step `CONFIRM`-typed
 * dialog → `clearAllData` → relaunch into onboarding).
 *
 * "Relaunch into onboarding" (§20.7) is a documented simplification: `clearAllData()` already
 * drops every `app_setting` row including `onboardingDone`, so the *next* app launch's
 * `<MigrationGate>`/router redirect naturally lands on onboarding (F12, not built yet) — there's
 * no separate in-session redirect to build. This screen just confirms success and pops back;
 * closing the app is the same relaunch the router-level redirect will already do once F12 exists.
 */

import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Spacing } from '@/constants/theme';
import { clearAllData } from '@/db/maintenance';
import { setSetting, useSetting } from '@/db/repositories/settings';
import { armCrashReporting } from '@/services/crash';

import { exportCsv, exportJson } from '@/features/settings/export';
import { Button } from '@/ui/button';
import { ConfirmDialog } from '@/ui/confirm-dialog';
import { ThemedText } from '@/ui/themed-text';
import { TopBar } from '@/ui/top-bar';

export default function DataScreen() {
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [exportError, setExportError] = useState<'json' | 'csv' | null>(null);
  const [cleared, setCleared] = useState(false);
  const crashReporting = useSetting<boolean>('crashReportingEnabled');
  const crashReportingOn = crashReporting.value ?? false;

  const handleCrashReportingToggle = (next: boolean) => {
    setSetting('crashReportingEnabled', next);
    armCrashReporting(next);
  };

  const handleExport = async (kind: 'json' | 'csv') => {
    setExportError(null);
    try {
      await (kind === 'json' ? exportJson() : exportCsv());
    } catch {
      // E17 — a retry toast with nothing partially shared; the share sheet itself owns any
      // partial-share state, this screen only needs to say it didn't go through.
      setExportError(kind);
    }
  };

  const handleClear = () => {
    setConfirmingClear(false);
    clearAllData();
    setCleared(true);
  };

  return (
    <SafeAreaView style={styles.screen}>
      <TopBar title="Data" onBack={() => router.back()} />
      <View style={styles.body}>
        <ThemedText type="label" themeColor="text3" style={styles.sectionLabel}>
          Export
        </ThemedText>
        <View style={styles.actions}>
          <Button variant="ghost" onPress={() => handleExport('json')} style={styles.exportButton}>
            Export JSON
          </Button>
          <Button variant="ghost" onPress={() => handleExport('csv')} style={styles.exportButton}>
            Export CSV
          </Button>
        </View>
        {exportError ? (
          <ThemedText type="caption" themeColor="text" style={styles.error}>
            Couldn&apos;t export — nothing was shared. Try again.
          </ThemedText>
        ) : null}

        <ThemedText type="label" themeColor="text3" style={styles.sectionLabel}>
          Crash reporting
        </ThemedText>
        <View style={styles.crashRow}>
          <ThemedText type="caption" themeColor="text3" style={styles.crashCopy}>
            Send anonymous crash reports (stack traces only — never your transactions or
            messages).
          </ThemedText>
          <Switch
            value={crashReportingOn}
            onValueChange={handleCrashReportingToggle}
            trackColor={{ false: Colors.dark.surface3, true: Colors.dark.text }}
            thumbColor={Colors.dark.bg}
          />
        </View>

        <ThemedText type="label" themeColor="text3" style={styles.sectionLabel}>
          Danger zone
        </ThemedText>
        {cleared ? (
          <ThemedText type="body" themeColor="text2" style={styles.clearedNote}>
            All data cleared. Restart CoinFlow to set it up again.
          </ThemedText>
        ) : (
          <Button variant="ghost" onPress={() => setConfirmingClear(true)} style={styles.clearButton}>
            Clear all data
          </Button>
        )}
      </View>

      <ConfirmDialog
        visible={confirmingClear}
        glyph="trash-2"
        title="Clear all data?"
        body="Every transaction, category, and learned rule is deleted for good. Type CONFIRM to continue."
        confirmLabel="Clear everything"
        twoStep
        onConfirm={handleClear}
        onCancel={() => setConfirmingClear(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { flex: 1, paddingHorizontal: Spacing.three },
  sectionLabel: { paddingTop: Spacing.three, paddingBottom: Spacing.one },
  actions: { flexDirection: 'row', gap: Spacing.two },
  exportButton: { flex: 1 },
  error: { paddingTop: Spacing.two },
  crashRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  crashCopy: { flex: 1 },
  clearButton: {},
  clearedNote: { paddingTop: Spacing.one },
});
