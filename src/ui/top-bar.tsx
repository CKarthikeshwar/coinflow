/**
 * `TopBar` — SPEC-UI-UX.md §3.6 / SPEC-implementation.md §29.4. Every route sets
 * `headerShown:false` (custom top bars, §28.1), so pushed screens render their own back
 * affordance here rather than relying on the native header.
 *
 * Full spec is `variant:'brand'|'title'|'back'` + a `right?` slot; this pass implements the
 * `'title'` shape (+ optional count + optional back) needed by Review Queue. `'brand'` (Home)
 * lands with Home itself.
 */

import { Pressable, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';

import { Badge } from './badge';
import { Icon } from './icon';
import { ThemedText } from './themed-text';

export type TopBarProps = {
  variant?: 'title';
  title: string;
  count?: number;
  onBack?: () => void;
};

export function TopBar({ title, count, onBack }: TopBarProps) {
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
    </View>
  );
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
});
