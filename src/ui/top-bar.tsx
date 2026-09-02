/**
 * `TopBar` — SPEC-UI-UX.md §3.6 / SPEC-implementation.md §29.4. Every route sets
 * `headerShown:false` (custom top bars, §28.1), so pushed screens render their own back
 * affordance here rather than relying on the native header.
 *
 * Full spec is `variant:'brand'|'title'|'back'` + a `right?` slot; this pass implements the
 * `'title'` shape (+ optional count, back, and right action) needed by Review Queue and
 * Categories (§6.11's "＋ Add"). `'brand'` (Home) lands with Home itself.
 */

import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';

import { Badge } from './badge';
import { Icon, type IconName } from './icon';
import { ThemedText } from './themed-text';

export type TopBarProps = {
  variant?: 'title';
  title: string;
  count?: number;
  onBack?: () => void;
  right?: { icon: IconName; label: string; onPress: () => void } | ReactNode;
};

export function TopBar({ title, count, onBack, right }: TopBarProps) {
  return (
    <View style={styles.row}>
      {onBack ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} style={styles.backTap}>
          <Icon name="arrow-left" />
        </Pressable>
      ) : (
        <View style={styles.backSpacer} />
      )}
      <ThemedText type="title" style={styles.title}>
        {title}
      </ThemedText>
      {count !== undefined && count > 0 ? <Badge count={count} /> : null}
      {right && isRightAction(right) ? (
        <Pressable accessibilityRole="button" accessibilityLabel={right.label} onPress={right.onPress} style={styles.rightTap}>
          <Icon name={right.icon} size={18} />
        </Pressable>
      ) : (
        right
      )}
    </View>
  );
}

function isRightAction(
  right: NonNullable<TopBarProps['right']>,
): right is { icon: IconName; label: string; onPress: () => void } {
  return typeof right === 'object' && right !== null && 'onPress' in right;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  title: { flex: 1 },
  backTap: {
    width: 44,
    height: 44,
    marginLeft: -Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backSpacer: { width: 0 },
  rightTap: {
    width: 44,
    height: 44,
    marginRight: -Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
