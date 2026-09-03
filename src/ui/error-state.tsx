/**
 * `ErrorState` — SPEC-UI-UX.md §3.6 / V-3 baseline / UI-004. Centred alert glyph + a short
 * line + a hairline **Try again** pill. No red — the glyph and the message carry it (V-7).
 */

import { Pressable, StyleSheet, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';

import { Icon } from './icon';
import { ThemedText } from './themed-text';

export type ErrorStateProps = { message: string; onRetry: () => void };

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <View style={styles.wrap}>
      <Icon name="triangle-alert" size={28} color="text3" />
      <ThemedText type="body" themeColor="text3" style={styles.line}>
        {message}
      </ThemedText>
      <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retry}>
        <ThemedText type="label" themeColor="text">
          Try again
        </ThemedText>
      </Pressable>
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
  retry: {
    minHeight: 44,
    paddingHorizontal: Spacing.four,
    justifyContent: 'center',
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.dark.hairline,
  },
});
