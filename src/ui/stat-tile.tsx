/**
 * `StatTile` — SPEC-UI-UX.md §3.6 / SPEC-implementation.md §29.4. A small card: label + figure
 * + a quiet delta line with a trend glyph. Display only, never a link (§30.4). Used for Home's
 * Income / Spending (this-month total + MoM %); F9's Analytics Mean/Median tiles reuse it with
 * a different `noDeltaLabel`/`deltaLabel`.
 */

import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { formatMoney, formatPercentDelta } from '@/domain/format/money';

import { Card } from './card';
import { Icon } from './icon';
import { ThemedText } from './themed-text';

export type StatTileProps = {
  label: string;
  valueMinor: number;
  /** `null` when there's no comparison period (e.g. a brand-new account). */
  deltaPct: number | null;
  /** Appended after the formatted delta when `deltaPct` isn't null, e.g. "vs last month". */
  deltaLabel?: string;
  /** Shown instead of a delta line when `deltaPct` is null. */
  noDeltaLabel?: string;
};

export function StatTile({
  label,
  valueMinor,
  deltaPct,
  deltaLabel,
  noDeltaLabel = 'No prior month',
}: StatTileProps) {
  return (
    <Card style={styles.tile} padding={Spacing.three}>
      <ThemedText type="label" themeColor="text2">
        {label}
      </ThemedText>
      <ThemedText type="title" style={styles.value}>
        {formatMoney(valueMinor)}
      </ThemedText>
      <View style={styles.deltaRow}>
        {deltaPct == null ? (
          <ThemedText type="caption" themeColor="text3">
            {noDeltaLabel}
          </ThemedText>
        ) : (
          <>
            <Icon name={deltaPct >= 0 ? 'trending-up' : 'trending-down'} size={13} color="text3" />
            <ThemedText type="caption" themeColor="text3">
              {formatPercentDelta(deltaPct)}
              {deltaLabel ? ` ${deltaLabel}` : ''}
            </ThemedText>
          </>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  tile: { flex: 1, gap: Spacing.half },
  value: { marginTop: Spacing.half },
  deltaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.half, marginTop: Spacing.half },
});
