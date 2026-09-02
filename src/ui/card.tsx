/**
 * `Card` — SPEC-implementation.md §29.4. `surface` + `Radius.card`, optional §3.3 elevation.
 */

import { StyleSheet, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';

import { ThemedView } from './themed-view';

export type CardProps = ViewProps & {
  elevation?: 'card' | 'pop';
  padding?: number;
  style?: StyleProp<ViewStyle>;
};

export function Card({ elevation, padding = Spacing.four, style, ...rest }: CardProps) {
  return (
    <ThemedView
      surface="surface"
      elevation={elevation}
      style={[styles.base, { padding }, style]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: Radius.card },
});
