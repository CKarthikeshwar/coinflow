/**
 * `AnalyticsFilterBar` + `FilterBanner` — SPEC-UI-UX.md §6.10 (CR-27). Two chips under the period control that open
 * the Accounts and Categories sheets, and the banner that says a filter is on (with a Reset) so nobody wonders why
 * the numbers look low. A chip turns white while its filter is active.
 */

import { Pressable, StyleSheet, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';

import { Icon } from '@/ui/icon';
import { ThemedText } from '@/ui/themed-text';

type FilterChipProps = { label: string; active: boolean; onPress: () => void; accessibilityLabel: string };

function FilterChip({ label, active, onPress, accessibilityLabel }: FilterChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={[styles.chip, active ? styles.chipOn : null]}
    >
      <ThemedText type="label" themeColor={active ? 'primaryInk' : 'text2'} numberOfLines={1} style={styles.chipLabel}>
        {label}
      </ThemedText>
      <Icon name="chevron-down" size={14} color={active ? 'primaryInk' : 'text3'} />
    </Pressable>
  );
}

export type AnalyticsFilterBarProps = {
  accountLabel: string;
  accountsActive: boolean;
  /** Hidden categories, spending and income together. */
  hiddenCount: number;
  onAccounts: () => void;
  onCategories: () => void;
};

export function AnalyticsFilterBar({
  accountLabel,
  accountsActive,
  hiddenCount,
  onAccounts,
  onCategories,
}: AnalyticsFilterBarProps) {
  return (
    <View style={styles.row}>
      <FilterChip label={accountLabel} active={accountsActive} onPress={onAccounts} accessibilityLabel="Choose accounts" />
      <FilterChip
        label={hiddenCount > 0 ? `Categories · ${hiddenCount} hidden` : 'Categories'}
        active={hiddenCount > 0}
        onPress={onCategories}
        accessibilityLabel="Choose categories"
      />
    </View>
  );
}

export function FilterBanner({ text, onReset }: { text: string; onReset: () => void }) {
  return (
    <View style={styles.banner}>
      <ThemedText type="caption" themeColor="text2" style={styles.bannerText}>
        {text}
      </ThemedText>
      <Pressable accessibilityRole="button" accessibilityLabel="Reset filters" onPress={onReset} hitSlop={8}>
        <ThemedText type="label" themeColor="text">
          Reset
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.two },
  chip: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    minHeight: 36,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
    backgroundColor: Colors.dark.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.dark.hairline,
  },
  chipLabel: { flexShrink: 1 },
  chipOn: { backgroundColor: Colors.dark.primary, borderColor: Colors.dark.primary },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.control + 2,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.dark.hairline,
    backgroundColor: Colors.dark.surface2,
  },
  bannerText: { flex: 1 },
});
