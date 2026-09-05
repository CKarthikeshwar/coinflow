/**
 * A rounded, raised-surface container — the base building block for most "boxed" content
 * throughout the app (Home's summary tiles, Analytics tiles, list sections). Thin wrapper
 * around `ThemedView` that fixes the corner radius and default padding so every card in the
 * app looks consistent without each screen repeating the same style values.
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
