/**
 * `TextField` — SPEC-UI-UX.md §3.6 / SPEC-implementation.md §29.4. Inset `surface2`;
 * `empty` (muted) / `filled` (hairline border) / `focus` (`primary` border) states are
 * derived from local focus + value, not passed in — simpler call site than the spec'd
 * explicit `state` prop, same visual outcome.
 */

import { useState } from 'react';
import { StyleSheet, TextInput, type TextInputProps } from 'react-native';

import { Colors, fontFamily, Radius, Spacing } from '@/constants/theme';

export type TextFieldProps = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  multiline?: boolean;
  maxLength?: number;
} & Pick<TextInputProps, 'keyboardType' | 'autoCapitalize'>;

export function TextField({ value, onChangeText, placeholder, multiline, maxLength, ...rest }: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const borderColor = focused ? Colors.dark.primary : value ? Colors.dark.hairline : 'transparent';

  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={Colors.dark.text3}
      multiline={multiline}
      maxLength={maxLength}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[styles.field, multiline ? styles.multiline : null, { borderColor }]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  field: {
    minHeight: 48,
    borderRadius: Radius.control,
    backgroundColor: Colors.dark.surface2,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    color: Colors.dark.text,
    fontFamily: fontFamily('sans', 400),
    fontSize: 15,
  },
  multiline: { minHeight: 80, paddingTop: Spacing.two, textAlignVertical: 'top' },
});
