/**
 * `PermissionBanner` — SPEC-UI-UX.md V-9 / §3.6. Neutral inset, not tinted — no colour anywhere
 * (V-11). Emphasis comes from fill + contrast, not hue: the alert glyph sits in a filled
 * `surface3` circle at full-brightness `text` (the same "quiet glyph in a circle" treatment
 * `ConfirmDialog` already uses for its own warning glyph, §3.6/§29.4), and the banner's own
 * border reads a touch stronger (`text3`) than a plain hairline. Shown under the top bar on Home
 * and Review Queue when SMS or notifications are off (§30 rules).
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
  sms: 'Need SMS permission to detect transactions automatically.',
  notif: "Notifications are off — you'll need to check the Review Queue yourself.",
};

export function PermissionBanner({ kind, onEnable, onDismiss }: PermissionBannerProps) {
  return (
    <View style={styles.row}>
      <View style={styles.iconTile}>
        <Icon name="triangle-alert" size={14} color="text" />
      </View>
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
    borderColor: Colors.dark.text3,
  },
  iconTile: {
    width: 26,
    height: 26,
    borderRadius: Radius.pill,
    backgroundColor: Colors.dark.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: { flex: 1 },
  enable: { fontWeight: '700' },
});
