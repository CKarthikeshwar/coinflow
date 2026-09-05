/**
 * FILE PURPOSE
 * ------------
 * The base text component every screen in the app should use instead of React Native's plain
 * `<Text>`. Instead of setting font/size/weight/color by hand at every call site, you pick a
 * named `type` (a design "role" like `'title'`, `'body'`, `'caption'`) and this component looks
 * up the exact font family, size, weight, letter-spacing, and default color for that role from
 * the `ROLES` table below — which is what keeps typography consistent across the whole app.
 *
 * WHERE IT FITS
 * -------------
 * Used throughout `src/ui/`, `src/features/`, and `src/app/` — this and `themed-view.tsx` are
 * the two most widely-used building blocks in the entire UI layer. `themeColor` is an escape
 * hatch to override just the color for one specific case, without losing the role's
 * type/size/weight — e.g. reusing the `'body'` role's sizing but in a warning color.
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
