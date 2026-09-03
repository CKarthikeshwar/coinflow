/**
 * `AccountRuleRow` — SPEC-implementation.md §29.4 component catalog / §30.16 (F8). A lifted
 * card: account · remembered note · category chip · usage count. Tap opens the editor sheet; the
 * trailing delete icon is a direct tap, not a swipe gesture — same "tap not swipe" simplification
 * already used for Categories, Review Queue, and the transaction list.
 */

import { Pressable, StyleSheet, View } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';
import type { AccountRule, Category } from '@/db/schema';

import { Chip } from '@/ui/chip';
import { Icon } from '@/ui/icon';
import { ThemedText } from '@/ui/themed-text';

export function AccountRuleRow({
  rule,
  category,
  onPress,
  onDeletePress,
}: {
  rule: AccountRule;
  category: Category | undefined;
  onPress: () => void;
  onDeletePress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.card}>
      <View style={styles.main}>
        <ThemedText type="body" themeColor="text" numberOfLines={1}>
          {rule.displayAccount}
        </ThemedText>
        <ThemedText type="caption" themeColor="text3" numberOfLines={1}>
          {rule.lastNote ?? 'No note'}
        </ThemedText>
        <View style={styles.meta}>
          <Chip label={category?.name ?? 'Uncategorized'} />
          <ThemedText type="caption" themeColor="text3">
            {rule.hitCount} use{rule.hitCount === 1 ? '' : 's'}
          </ThemedText>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Delete rule for ${rule.displayAccount}`}
        onPress={onDeletePress}
        hitSlop={8}
        style={styles.deleteTap}
      >
        <Icon name="trash-2" size={16} color="text3" />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: 14,
    backgroundColor: Colors.dark.surface2,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  main: { flex: 1, gap: Spacing.one },
  meta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginTop: Spacing.one },
  deleteTap: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
});
