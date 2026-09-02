/**
 * `EmptyState` — SPEC-UI-UX.md §3.6 / V-3 baseline. Centred glyph + line + exactly one
 * primary action (UI-003) when a `cta` is given — Review Queue's "caught up" empty state
 * omits it (it's the calm resting state, not an error, §6.3).
 */

import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';

import { Button } from './button';
import { Icon, type IconName } from './icon';
import { ThemedText } from './themed-text';

export type EmptyStateProps = {
  glyph: IconName;
  line: string;
  cta?: { label: string; onPress: () => void };
};

export function EmptyState({ glyph, line, cta }: EmptyStateProps) {
  return (
    <View style={styles.wrap}>
      <Icon name={glyph} size={28} color="text3" />
      <ThemedText type="body" themeColor="text3" style={styles.line}>
        {line}
      </ThemedText>
      {cta ? <Button onPress={cta.onPress}>{cta.label}</Button> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.five,
  },
  line: { textAlign: 'center' },
});
