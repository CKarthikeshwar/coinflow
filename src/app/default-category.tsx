/**
 * FILE PURPOSE
 * ------------
 * **Settings › Default expense category / Default income category** (SPEC-UI-UX.md §6.14, CR-12, CR-17): pick the
 * one category the Review Queue's "Save all" applies to expenses (or, with `?kind=income`, to income) that have no
 * learned category. A single-select list plus a *None* row.
 *
 * WHERE IT FITS
 * -------------
 * Pushed from the Settings tab, and from the Review Queue when "Save all" is tapped with no default set.
 * Writes the `defaultCategoryId` setting; `resolveDefaultCategory` (categories repo) is the one place that turns the
 * stored id into a live category, treating a deleted category's dangling id as "not set".
 */

import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Spacing } from '@/constants/theme';
import { resolveDefaultCategory, useCategories } from '@/db/repositories/categories';
import { setSetting, useSetting } from '@/db/repositories/settings';

import { Icon, type IconName } from '@/ui/icon';
import { ThemedText } from '@/ui/themed-text';
import { TopBar } from '@/ui/top-bar';

function OptionRow({
  label,
  icon,
  selected,
  onPress,
}: {
  label: string;
  icon: IconName;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.row}
    >
      <View style={styles.tile}>
        <Icon name={icon} size={18} />
      </View>
      <ThemedText type="body" themeColor="text" style={styles.label}>
        {label}
      </ThemedText>
      {selected ? <Icon name="check" size={18} /> : null}
    </Pressable>
  );
}

export default function DefaultCategoryScreen() {
  const { kind: kindParam } = useLocalSearchParams<{ kind?: string }>();
  const kind = kindParam === 'income' ? 'income' : 'expense'; // CR-28
  const settingKey = kind === 'income' ? 'defaultIncomeCategoryId' : 'defaultCategoryId';
  const { data } = useCategories();
  const stored = useSetting<string | null>(settingKey);
  // "None" already means Uncategorized; only categories of this kind can be its default
  const categories = (data ?? []).filter((c) => c.kind !== 'system' && c.appliesTo === kind);
  const current = resolveDefaultCategory(stored.value, data ?? [], kind);

  const choose = (id: string | null) => {
    setSetting(settingKey, id);
    router.back();
  };

  return (
    <SafeAreaView style={styles.screen}>
      <TopBar title={kind === 'income' ? 'Default income category' : 'Default expense category'} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.body}>
        <ThemedText type="caption" themeColor="text3" style={styles.help}>
          {kind === 'income'
            ? '"Save all" in To review uses this for income whose account has no income category of its own. With none set, income stays uncategorized.'
            : '"Save all" in To review uses this for expenses whose account has no category of its own.'}
        </ThemedText>
        <View style={styles.section}>
          <OptionRow label="None" icon="x" selected={current === null} onPress={() => choose(null)} />
          {categories.map((category) => (
            <OptionRow
              key={category.id}
              label={category.name}
              icon={category.icon as IconName}
              selected={current?.id === category.id}
              onPress={() => choose(category.id)}
            />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.five, gap: Spacing.two },
  help: { paddingVertical: Spacing.two },
  section: { backgroundColor: Colors.dark.surface2, borderRadius: 16, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 56, paddingHorizontal: Spacing.three },
  tile: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.dark.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { flex: 1 },
});
