/**
 * FILE PURPOSE
 * ------------
 * A card explaining one permission (SMS, notifications, or crash reporting) and offering an
 * action to grant/enable it — icon tile + title (+ "Optional" tag) + plain-language why-copy +
 * either a status pill (already granted) or an action button. Shared between the onboarding
 * flow's permissions step (`src/app/(onboarding)/permissions.tsx`) and
 * `src/app/sms-notifications.tsx` (Settings › SMS & notifications) — the same card, same
 * copy/behavior, used in both places a user is asked about permissions.
 *
 * `canAskAgain` (default `true`, F8.5/IMP-042) is a documented addition to the catalog's literal
 * `kind, state, optional?, onRequest` prop list — it picks the action button's own label:
 * not-yet-asked → "Allow"; denied and still askable → "Enable"; denied and permanently blocked
 * by the OS → "Open system settings". `onRequest` fires the same way regardless — the caller
 * (which already has `canAskAgain` from `usePermissionStatus`) decides whether that means
 * re-requesting or calling `Linking.openSettings()`, since only the caller can make that actual
 * platform call.
 */

import { Pressable, StyleSheet, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';

import { Icon, type IconName } from '@/ui/icon';
import { ThemedText } from '@/ui/themed-text';

export type PermissionCardKind = 'sms' | 'notif' | 'crash';

export type PermissionCardProps = {
  kind: PermissionCardKind;
  state: 'idle' | 'granted' | 'denied';
  optional?: boolean;
  canAskAgain?: boolean;
  onRequest: () => void;
};

const ICON: Record<PermissionCardKind, IconName> = { sms: 'shield-check', notif: 'bell', crash: 'triangle-alert' };
const TITLE: Record<PermissionCardKind, string> = {
  sms: 'Read transaction SMS',
  notif: 'Notifications',
  crash: 'Crash reports',
};
const WHY: Record<PermissionCardKind, string> = {
  sms: 'Reads bank & UPI messages on this device to detect payments. Nothing is uploaded.',
  notif: 'Act on a detection from the lock screen. Without it, detections just wait in the Review Queue.',
  crash: 'Send anonymous crash reports (stack traces only — never your transactions or messages).',
};

export function PermissionCard({
  kind,
  state,
  optional = false,
  canAskAgain = true,
  onRequest,
}: PermissionCardProps) {
  const actionLabel =
    kind === 'crash' ? 'Turn on' : state === 'idle' ? 'Allow' : canAskAgain ? 'Enable' : 'Open system settings';

  return (
    <View style={styles.card}>
      <View style={styles.tile}>
        <Icon name={ICON[kind]} size={18} />
      </View>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <ThemedText type="label" themeColor="text">
            {TITLE[kind]}
          </ThemedText>
          {optional ? (
            <ThemedText type="caption" themeColor="text3">
              Optional
            </ThemedText>
          ) : null}
        </View>
        <ThemedText type="caption" themeColor="text3">
          {WHY[kind]}
        </ThemedText>
      </View>
      {state === 'granted' ? (
        <View style={styles.pill}>
          <Icon name="check" size={14} color="text" />
          <ThemedText type="caption" themeColor="text">
            {kind === 'crash' ? 'Enabled' : 'Granted'}
          </ThemedText>
        </View>
      ) : (
        <Pressable accessibilityRole="button" onPress={onRequest} style={styles.actionButton}>
          <ThemedText type="label" themeColor="primaryInk" style={styles.actionLabel}>
            {actionLabel}
          </ThemedText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    borderRadius: 14,
    backgroundColor: Colors.dark.surface2,
    padding: Spacing.three,
  },
  tile: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: Colors.dark.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: Spacing.one },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    minHeight: 32,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.pill,
    backgroundColor: Colors.dark.surface3,
  },
  actionButton: {
    minHeight: 32,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.pill,
    backgroundColor: Colors.dark.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { fontWeight: '700' },
});
