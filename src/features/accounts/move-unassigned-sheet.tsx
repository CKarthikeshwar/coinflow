/**
 * `MoveUnassignedSheet` — SPEC-UI-UX.md §6.25 (CR-29), SPEC-implementation.md D51 / CR-42. Opened from the "No account" row
 * of My accounts. Picks one live account; **Move** puts every transaction that has no account onto it, in one step. Only
 * the account changes — amounts, dates, categories, splits and notes stay.
 */

import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { moveUnassignedTo, useAccounts } from '@/db/repositories/accounts';
import { useUnassigned } from '@/db/repositories/balances';
import { ACCOUNT_KIND_ICON, accountSubtitle } from '@/features/accounts/account-label';
import { useSheetRegistry } from '@/stores';
import { useToast } from '@/stores/toast';

import { Button } from '@/ui/button';
import { Icon } from '@/ui/icon';
import { ThemedText } from '@/ui/themed-text';

export function MoveUnassignedSheet() {
  const close = useSheetRegistry((s) => s.close);
  const { data: accounts } = useAccounts();
  const { count } = useUnassigned();
  const [picked, setPicked] = useState<string | null>(null);

  const options = (accounts ?? []).filter((a) => !a.archivedAt);
  const noun = `transaction${count === 1 ? '' : 's'}`;

  const move = () => {
    const target = options.find((a) => a.id === picked);
    if (!target) return;
    const moved = moveUnassignedTo(target.id);
    close();
    if (moved > 0) useToast.getState().show(`Moved ${moved} transaction${moved === 1 ? '' : 's'} to ${target.nickname}`);
  };

  return (
    <BottomSheetScrollView contentContainerStyle={styles.root}>
      <ThemedText type="title" style={styles.title}>
        Move {count} {noun}
      </ThemedText>
      <ThemedText type="caption" themeColor="text3" style={styles.lede}>
        They have no account yet. Pick the account they belong to.
      </ThemedText>

      {options.map((a) => {
        const on = picked === a.id;
        return (
          <Pressable
            key={a.id}
            accessibilityRole="radio"
            accessibilityLabel={a.nickname}
            accessibilityState={{ selected: on }}
            onPress={() => setPicked(a.id)}
            style={styles.row}
          >
            <View style={styles.tile}>
              <Icon name={ACCOUNT_KIND_ICON[a.kind]} size={18} color="text" />
            </View>
            <View style={styles.name}>
              <ThemedText type="body" themeColor="text" numberOfLines={1}>
                {a.nickname}
              </ThemedText>
              <ThemedText type="caption" themeColor="text3" numberOfLines={1}>
                {accountSubtitle(a)}
              </ThemedText>
            </View>
            <View style={[styles.dot, on ? styles.dotOn : null]}>{on ? <Icon name="check" size={14} color="primaryInk" /> : null}</View>
          </Pressable>
        );
      })}

      {options.length === 0 ? (
        <ThemedText type="caption" themeColor="text3" style={styles.lede}>
          Add an account first, then come back here.
        </ThemedText>
      ) : null}

      <View style={styles.footer}>
        <Button variant="ghost" onPress={close} style={styles.cancel}>
          Cancel
        </Button>
        <Button variant={picked ? 'primary' : 'disabled'} onPress={move} style={styles.move}>
          Move
        </Button>
      </View>
    </BottomSheetScrollView>
  );
}

const styles = StyleSheet.create({
  root: { paddingBottom: Spacing.three },
  title: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.one },
  lede: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.two },
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
  dot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.dark.text3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotOn: { backgroundColor: Colors.dark.primary, borderColor: Colors.dark.primary },
  footer: { flexDirection: 'row', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingTop: Spacing.three },
  cancel: { flexBasis: 100, flexGrow: 0 },
  move: { flex: 1 },
});
