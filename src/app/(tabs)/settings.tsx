/**
 * Settings — SPEC-UI-UX.md §6.13, SPEC-implementation.md §30.15 (UI-064). F8.5. A grouped,
 * static list; each row pushes its subpage; app version in the footer.
 *
 * §30.15's own text says the SMS & notifications subtitle reads `useSetting` — but §22.4's
 * architecture principle is that permission status is "read live from the OS, never stored",
 * and every other consumer (Home, Review Queue, this row's own subpage) already reads it live
 * via `usePermissionStatus`. Followed the stronger, repeatedly-stated architecture principle
 * over that one screen-spec line rather than caching a value the rest of the app deliberately
 * never caches.
 */

import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Spacing } from '@/constants/theme';
import { usePermissionStatus } from '@/hooks/use-permission-status';

import { Icon, type IconName } from '@/ui/icon';
import { ThemedText } from '@/ui/themed-text';

type SettingsRow = { label: string; icon: IconName; href: string; subtitle?: string; warn?: boolean };

function Row({ label, icon, href, subtitle, warn }: SettingsRow) {
  // `href` is a plain `string` prop (not a literal per row) so this one component can serve all
  // six rows — every value passed in is one of this file's own hardcoded, already-real routes,
  // just not statically inferable as expo-router's generated `Href` union from here.
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push(href as never)} style={styles.row}>
      <View style={styles.tile}>
        <Icon name={icon} size={18} />
      </View>
      <ThemedText type="body" themeColor="text" style={styles.label}>
        {label}
      </ThemedText>
      {subtitle ? (
        <View style={styles.subtitleGroup}>
          {warn ? <Icon name="triangle-alert" size={14} color="text3" /> : null}
          <ThemedText type="caption" themeColor="text3">
            {subtitle}
          </ThemedText>
        </View>
      ) : null}
      <Icon name="chevron-right" size={16} color="text3" />
    </Pressable>
  );
}

export default function SettingsScreen() {
  const permission = usePermissionStatus();
  const smsOn = permission.sms === 'granted';
  const version = Constants.expoConfig?.version ?? '—';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <ThemedText type="title">Settings</ThemedText>
      </View>
      <View style={styles.body}>
        <View style={styles.section}>
          <Row label="Categories" icon="tag" href="/categories" />
          <Row label="Payment methods" icon="wallet" href="/payment-methods" />
          <Row
            label="SMS & notifications"
            icon="shield-check"
            href="/sms-notifications"
            subtitle={smsOn ? 'On' : 'Off'}
            warn={!smsOn}
          />
          <Row label="Account rules" icon="history" href="/account-rules" />
          <Row label="Data" icon="download" href="/data" />
          <Row label="About" icon="help-circle" href="/about" />
        </View>
        <ThemedText type="caption" themeColor="text3" style={styles.version}>
          Version {version}
        </ThemedText>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.three },
  body: { flex: 1, paddingHorizontal: Spacing.three, paddingTop: Spacing.five },
  section: {
    borderRadius: 14,
    backgroundColor: Colors.dark.surface2,
    paddingHorizontal: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 56,
  },
  tile: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: Colors.dark.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { flex: 1 },
  subtitleGroup: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  version: { textAlign: 'center', paddingVertical: Spacing.four },
});
