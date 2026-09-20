/**
 * FILE PURPOSE
 * ------------
 * The quiet **Suggested settlement** card (SPEC-UI-UX.md §6.20, UI-078): `Looks like Rahul paying ₹450` ·
 * **Settle** · **Not this**. Shown on a credit (Confirmation sheet and Details) when exactly one open share
 * matches it (`suggest-settlement.ts`, IMP-085). Purely advisory — nothing is written until **Settle** is pressed.
 *
 * `useSettlementSuggestion` is the shared "is there a confident match?" rule for both places.
 */

import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { formatRupees } from '@/domain/format/money';
import { suggestSettlement } from '@/domain/suggest-settlement';
import type { OwedItem } from '@/db/repositories/splits';

import { Icon } from '@/ui/icon';
import { ThemedText } from '@/ui/themed-text';

/** The open share a credit of `availableMinor` (with `account`) most plausibly settles, or `null`. */
export function useSettlementSuggestion(
  open: readonly OwedItem[],
  txn: { availableMinor: number; account: string | null | undefined; isCredit: boolean },
): OwedItem | null {
  return useMemo(() => {
    if (!txn.isCredit || txn.availableMinor <= 0 || open.length === 0) return null;
    const { bestId } = suggestSettlement(
      { amountMinor: txn.availableMinor, account: txn.account },
      open.map((i) => ({ id: i.shareId, personName: i.personName, remainingMinor: i.remainingMinor })),
    );
    return open.find((i) => i.shareId === bestId) ?? null;
  }, [open, txn.availableMinor, txn.account, txn.isCredit]);
}

export type SuggestedSettlementBannerProps = {
  personName: string;
  amountMinor: number;
  onSettle: () => void;
  onDismiss: () => void;
  /** Confirm sheet: the settlement is written on Save, so the card says so. */
  pending?: boolean;
};

export function SuggestedSettlementBanner({ personName, amountMinor, onSettle, onDismiss, pending = false }: SuggestedSettlementBannerProps) {
  return (
    <View style={styles.card}>
      <Icon name="users" size={16} color="text3" />
      <View style={styles.text}>
        <ThemedText type="body" themeColor="text">
          {pending ? `Will settle ${personName}’s share` : `Looks like ${personName} paying ${formatRupees(amountMinor)}`}
        </ThemedText>
        {pending ? (
          <ThemedText type="caption" themeColor="text3">
            {formatRupees(amountMinor)} · when you save
          </ThemedText>
        ) : null}
      </View>
      {pending ? (
        <Pressable accessibilityRole="button" onPress={onDismiss} style={styles.action}>
          <ThemedText type="label" themeColor="text2">
            Undo
          </ThemedText>
        </Pressable>
      ) : (
        <>
          <Pressable accessibilityRole="button" onPress={onSettle} style={styles.action}>
            <ThemedText type="label" themeColor="text">
              Settle
            </ThemedText>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onDismiss} style={styles.action}>
            <ThemedText type="label" themeColor="text3">
              Not this
            </ThemedText>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.card,
    backgroundColor: Colors.dark.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.dark.hairline,
  },
  text: { flex: 1 },
  action: { minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing.one },
});
