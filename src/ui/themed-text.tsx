/**
 * Base text primitive (SPEC-implementation.md §29.3). `type` picks a §3.2 role that
 * fixes family + size + weight + tracking + tabular figures. Build every screen from
 * this, not bare `<Text>`. `themeColor` overrides the role's default colour.
 *
 * Tracking in §3.2 is given in `em`; RN `letterSpacing` is px, so each role stores the
 * px value computed at its own size.
 */

import { StyleSheet, Text, type TextProps } from 'react-native';

import { Colors, fontFamily, type FontFamilyKey, type ThemeColor } from '@/constants/theme';

export type TextRole =
  | 'amountHero'
  | 'balanceHero'
  | 'analyticsNet'
  | 'title'
  | 'body'
  | 'label'
  | 'caption'
  | 'micro';

type RoleSpec = {
  family: FontFamilyKey;
  weight: number;
  size: number;
  lineHeight: number;
  letterSpacing: number;
  tabular: boolean;
  color: ThemeColor;
};

const ROLES: Record<TextRole, RoleSpec> = {
  amountHero: { family: 'display', weight: 700, size: 48, lineHeight: 52, letterSpacing: -0.96, tabular: true, color: 'text' },
  balanceHero: { family: 'display', weight: 700, size: 46, lineHeight: 50, letterSpacing: -1.01, tabular: true, color: 'text' },
  analyticsNet: { family: 'display', weight: 700, size: 27, lineHeight: 32, letterSpacing: -0.41, tabular: true, color: 'text' },
  title: { family: 'display', weight: 600, size: 18, lineHeight: 24, letterSpacing: -0.18, tabular: false, color: 'text' },
  body: { family: 'sans', weight: 400, size: 15, lineHeight: 22, letterSpacing: 0, tabular: false, color: 'text2' },
  label: { family: 'sans', weight: 500, size: 13, lineHeight: 18, letterSpacing: 0, tabular: false, color: 'text2' },
  caption: { family: 'sans', weight: 500, size: 12.5, lineHeight: 16, letterSpacing: 0, tabular: true, color: 'text3' },
  micro: { family: 'sans', weight: 600, size: 11.5, lineHeight: 14, letterSpacing: 0, tabular: true, color: 'text3' },
};

export type ThemedTextProps = TextProps & {
  type?: TextRole;
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'body', themeColor, ...rest }: ThemedTextProps) {
  const role = ROLES[type];
  return (
    <Text
      style={[
        {
          fontFamily: fontFamily(role.family, role.weight),
          fontSize: role.size,
          lineHeight: role.lineHeight,
          letterSpacing: role.letterSpacing,
          color: Colors.dark[themeColor ?? role.color],
        },
        role.tabular && styles.tabular,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  tabular: { fontVariant: ['tabular-nums'] },
});
