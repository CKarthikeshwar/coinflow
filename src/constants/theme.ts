/**
 * Design tokens — the single source of truth for colour, type, spacing, radius and
 * elevation. Values come from SPEC-UI-UX.md §3 and SPEC-implementation.md §29.1.
 * V1 ships one dark theme (D33); `Colors.light` is a reference to `Colors.dark` so any
 * scheme-indexed lookup keeps working.
 */

import { Platform } from 'react-native';

const dark = {
  bg: '#0d0e14', // settled ground, behind the glow
  bgTop: '#1b2238', // radial glow hot-spot (cool blue-grey); also top-bar fade start
  surface: '#16171d', // raised cards, sheets, the nav pill
  surface2: '#1c1e26', // inset fields, control tracks
  surface3: '#262832', // pressed / selected fill, chip & badge fill, gauge track
  hairline: '#2b2d38', // every 1px divider / border
  text: '#f5f5f6', // primary text, active icons
  text2: '#9a9aa1', // secondary text, quiet labels
  text3: '#85858c', // captions, timestamps, placeholder, disabled, quiet icons
  primary: '#ffffff', // the one filled emphasis
  primaryInk: '#0b0b0c', // ink on top of `primary`
} as const;

export const Colors = { dark, light: dark };
export type ThemeColor = keyof typeof dark;

/**
 * The one colour carve-out (SPEC-UI-UX.md §3.1 / V-11): nine desaturated hues used
 * ONLY in the Analytics "Where it went" breakdown. Never on a card, chip or any other
 * chart. Uncategorized is a hatched grey, never a hue.
 */
export const CategoryPalette = {
  bills: '#7fb2e8',
  food: '#efa98c',
  groceries: '#93ce85',
  transport: '#b69be0',
  shopping: '#e6c36b',
  entertainment: '#e79bc5',
  health: '#e58f8b',
  education: '#6fcec0',
  other: '#9aa0a6',
} as const;

export const Radius = {
  pill: 999,
  card: 24,
  sheet: 28,
  control: 14,
  txnCard: 18,
  iconTile: 13,
  iconTileSm: 11,
} as const;

/**
 * SPEC-UI-UX.md §3.3. `shadow` / `pop` are CSS-shorthand strings for the RN `boxShadow`
 * style prop (supported on the new architecture and on web). `card` also carries a
 * hairline top edge — apply it as an extra `inset` layer, see `ThemedView`.
 */
export const Elevation = {
  card: {
    shadow: '0px 8px 24px rgba(0,0,0,0.5), 0px 1px 4px rgba(0,0,0,0.4)',
    topEdge: 'rgba(255,255,255,0.05)',
  },
  pop: { shadow: '0px 12px 34px rgba(0,0,0,0.6), 0px 3px 10px rgba(0,0,0,0.45)' },
} as const;

/**
 * Manrope on headings + every figure; Geist on all other UI text (SPEC-UI-UX.md §3.2).
 * Both are bundled via `@expo-google-fonts/*` and loaded in the root layout
 * (`src/constants/fonts.ts`). `@expo-google-fonts` registers one family name per weight,
 * so `fontFamily(role, weight)` maps a (family, weight) pair to the loaded name.
 * `Fonts.*` hold the nominal names for reference / the system-stack fallback.
 */
export const Fonts = Platform.select({
  ios: { sans: 'Geist', display: 'Manrope', mono: 'ui-monospace' },
  default: { sans: 'Geist', display: 'Manrope', mono: 'monospace' },
})!;

export type FontFamilyKey = 'sans' | 'display';

const FAMILY_BY_WEIGHT: Record<FontFamilyKey, Record<number, string>> = {
  display: {
    300: 'Manrope_300Light',
    400: 'Manrope_400Regular',
    500: 'Manrope_500Medium',
    600: 'Manrope_600SemiBold',
    700: 'Manrope_700Bold',
  },
  sans: {
    400: 'Geist_400Regular',
    500: 'Geist_500Medium',
    600: 'Geist_600SemiBold',
    700: 'Geist_700Bold',
  },
};

export function fontFamily(family: FontFamilyKey, weight: number): string {
  const table = FAMILY_BY_WEIGHT[family];
  return table[weight] ?? table[400];
}

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
