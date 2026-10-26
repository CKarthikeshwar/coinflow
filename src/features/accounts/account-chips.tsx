/**
 * A labelled chip row for picking one of the user's accounts (UI-102 **Paid from** / **Paid into**, UI-105 **From** /
 * **To**). An account whose kind does not fit the chosen payment method can still be shown (an old row being edited)
 * and carries a ⚠ (§46.8). `notSure` adds a trailing *Not sure* chip that means "no account".
 */

import { ScrollView, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import type { MyAccount } from '@/db/schema';

import { Chip } from '@/ui/chip';
import { ThemedText } from '@/ui/themed-text';

export function AccountChips({
  label,
  accounts,
  value,
  onChange,
  notSure = false,
  misfitIds,
}: {
  label: string;
  accounts: readonly MyAccount[];
  value: string | null;
  onChange: (id: string | null) => void;
  notSure?: boolean;
  misfitIds?: ReadonlySet<string>;
}) {
  return (
    <View style={styles.block}>
      <ThemedText type="label" themeColor="text3">
        {label}
      </ThemedText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} keyboardShouldPersistTaps="handled">
        {accounts.map((a) => (
          <Chip
            key={a.id}
            label={misfitIds?.has(a.id) ? `⚠ ${a.nickname}` : a.nickname}
            selected={value === a.id}
            onPress={() => onChange(a.id)}
          />
        ))}
        {notSure ? <Chip label="Not sure" selected={value === null} onPress={() => onChange(null)} /> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: Spacing.one },
  row: { gap: Spacing.two },
});
