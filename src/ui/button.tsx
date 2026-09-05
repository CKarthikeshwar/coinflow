/**
 * The app's one standard pill-shaped button, used anywhere a primary/secondary tappable action
 * is needed (sheet "Save"/"Add" buttons, dialog confirm actions, etc.) — `variant` picks the
 * filled/ghost/disabled look, and `loading` swaps the label for a spinner while also disabling
 * the press, so a slow save can't be double-tapped.
 */

import { ActivityIndicator, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';

import { ThemedText } from './themed-text';

export type ButtonVariant = 'primary' | 'ghost' | 'disabled';

export type ButtonProps = {
  variant?: ButtonVariant;
  loading?: boolean;
  onPress?: () => void;
  children: string;
  style?: StyleProp<ViewStyle>;
};

export function Button({ variant = 'primary', loading = false, onPress, children, style }: ButtonProps) {
  const disabled = variant === 'disabled' || loading;
  const bg = variant === 'primary' ? Colors.dark.primary : Colors.dark.surface2;
  const fg = variant === 'primary' ? Colors.dark.primaryInk : variant === 'ghost' ? Colors.dark.text : Colors.dark.text3;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: bg, opacity: pressed && !disabled ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <ThemedText type="label" style={[styles.label, { color: fg }]}>
          {children}
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 44,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontWeight: '700' },
});
