/**
 * `PermissionBanner` — SPEC-UI-UX.md V-9 / §3.6. Neutral inset (surface fill + hairline
 * border), not tinted — the alert glyph and position do the signalling. Shown under the top
 * bar on Home and Review Queue when SMS or notifications are off (§30 rules).
 */

import { Pressable, StyleSheet, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';

import { Icon } from './icon';
import { ThemedText } from './themed-text';

export type PermissionBannerProps = {
  kind: 'sms' | 'notif';
  onEnable: () => void;
  onDismiss: () => void;
};

const MESSAGE: Record<PermissionBannerProps['kind'], string> = {
  sms: "SMS permission is off — transactions won't be detected automatically.",
  notif: "Notifications are off — you'll need to check the Review Queue yourself.",
};

export function PermissionBanner({ kind, onEnable, onDismiss }: PermissionBannerProps) {
  return (
    <View style={styles.row}>
      <Icon name="triangle-alert" size={18} color="text3" />
      <ThemedText type="label" style={styles.message}>
        {MESSAGE[kind]}
      </ThemedText>
      <Pressable accessibilityRole="button" onPress={onEnable} hitSlop={8}>
        <ThemedText type="label" themeColor="text" style={styles.enable}>
          Enable
        </ThemedText>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={onDismiss} hitSlop={8}>
        <Icon name="x" size={16} color="text3" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.control,
    backgroundColor: Colors.dark.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.dark.hairline,
  },
  message: { flex: 1 },
  enable: { fontWeight: '700' },
});
