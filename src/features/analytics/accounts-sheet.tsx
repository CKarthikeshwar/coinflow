/**
 * `AnalyticsAccountsSheet` — SPEC-UI-UX.md §6.10 (CR-27). Multi-select list of the user's accounts plus "No account",
 * opened from the Accounts chip. Keeps a local draft and writes the Analytics filter store on Apply; none ticked (or
 * all ticked) means all accounts. Transfers between own accounts are never income or spending, so no choice shows them.
 */

import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { useAccounts } from '@/db/repositories/accounts';
import { NO_ACCOUNT_ID } from '@/domain/analytics-filter';
import { useSheetRegistry } from '@/stores';
import { useAnalyticsFilter } from '@/stores/analytics-filter';

import { Button } from '@/ui/button';
import { Icon, type IconName } from '@/ui/icon';
import { ThemedText } from '@/ui/themed-text';

const KIND_ICON: Record<string, IconName> = {
  bank: 'landmark',
  credit_card: 'credit-card',
  wallet: 'wallet',
  cash: 'banknote',
};

const KIND_LABEL: Record<string, string> = {
  bank: 'Bank account',
  credit_card: 'Credit card',
  wallet: 'Wallet',
  cash: 'Cash',
};

export function AnalyticsAccountsSheet() {
  const close = useSheetRegistry((s) => s.close);
  const { data: accounts } = useAccounts();
  // The sheet mounts fresh each time it opens, so seeding once from the store is "seed per open".
  const [picked, setPicked] = useState<string[]>(() => useAnalyticsFilter.getState().accountIds);

  const options = [
    ...(accounts ?? [])
      .filter((a) => !a.archivedAt || picked.includes(a.id))
      .map((a) => ({ id: a.id, name: a.nickname, sub: KIND_LABEL[a.kind] ?? 'Account', icon: (KIND_ICON[a.kind] ?? 'landmark') as IconName })),
    { id: NO_ACCOUNT_ID, name: 'No account', sub: 'Cash and entries not linked to an account', icon: 'wallet' as IconName },
  ];

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const apply = () => {
    // Everything ticked is the same as nothing ticked: all accounts.
    useAnalyticsFilter.getState().setAccounts(picked.length === options.length ? [] : picked);
    close();
  };

  return (
    <BottomSheetScrollView contentContainerStyle={styles.root}>
      <ThemedText type="title" style={styles.title}>
        Accounts
      </ThemedText>
      <View style={styles.headRow}>
        <ThemedText type="caption" themeColor="text3">
          Choose accounts
        </ThemedText>
        <Pressable accessibilityRole="button" onPress={() => setPicked(options.map((o) => o.id))} hitSlop={8}>
          <ThemedText type="label" themeColor="text">
            Select all
          </ThemedText>
        </Pressable>
      </View>

      {options.map((o) => {
        const on = picked.includes(o.id);
        return (
          <Pressable
            key={o.id}
            accessibilityRole="checkbox"
            accessibilityLabel={o.name}
            accessibilityState={{ checked: on }}
            onPress={() => toggle(o.id)}
            style={styles.row}
          >
            <View style={styles.tile}>
              <Icon name={o.icon} size={18} color="text" />
            </View>
            <View style={styles.name}>
              <ThemedText type="body" themeColor="text" numberOfLines={1}>
                {o.name}
              </ThemedText>
              <ThemedText type="caption" themeColor="text3" numberOfLines={1}>
                {o.sub}
              </ThemedText>
            </View>
            <View style={[styles.tick, on ? styles.tickOn : null]}>{on ? <Icon name="check" size={14} color="primaryInk" /> : null}</View>
          </Pressable>
        );
      })}

      <ThemedText type="caption" themeColor="text3" style={styles.hint}>
        Transfers between your own accounts are never counted as income or spending, so picking one account does not show them either. Card bill
        payments are transfers too.
      </ThemedText>

      <View style={styles.footer}>
        <Button variant={picked.length > 0 ? 'ghost' : 'disabled'} onPress={() => setPicked([])} style={styles.resetButton}>
          Reset
        </Button>
        <Button onPress={apply} style={styles.applyButton}>
          Apply
        </Button>
      </View>
    </BottomSheetScrollView>
  );
}

const styles = StyleSheet.create({
  root: { paddingBottom: Spacing.three },
  title: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.two },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: Spacing.three, paddingBottom: Spacing.one },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.dark.hairline,
  },
  tile: {
    width: 34,
    height: 34,
    borderRadius: Radius.iconTile - 1,
    backgroundColor: Colors.dark.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { flex: 1, gap: 1 },
  tick: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: Colors.dark.text3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickOn: { backgroundColor: Colors.dark.primary, borderColor: Colors.dark.primary },
  hint: { paddingHorizontal: Spacing.three, paddingTop: Spacing.two },
  footer: { flexDirection: 'row', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingTop: Spacing.three },
  resetButton: { flexBasis: 100, flexGrow: 0 },
  applyButton: { flex: 1 },
});
