/**
 * The app's standard text input field — used for note/description/account fields in the
 * Add/Confirm sheet and similar forms. Its empty/filled/focused visual states (muted vs.
 * bordered vs. highlighted) are computed automatically from whether it currently has a value
 * and whether it's focused, rather than requiring the parent to track and pass a `state` prop
 * — one less thing for every call site to manage.
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
