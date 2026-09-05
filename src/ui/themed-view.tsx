/**
 * FILE PURPOSE
 * ------------
 * The base container component, the `<View>` equivalent of `themed-text.tsx`. Instead of a raw
 * `backgroundColor`/`boxShadow` style, you pass a named `surface` (which background color tier
 * — `constants/theme.ts`'s `Colors`) and/or `elevation` (which drop-shadow style), keeping
 * every card/sheet/panel's background and shadow consistent across the app.
 *
 * WHERE IT FITS
 * -------------
 * Used throughout `src/ui/` and `src/features/` as the base for cards, sheets, and panels.
 *
 * IMPORTANT
 * ---------
 * `elevation` (the raised-card shadow) is meant for actual card/sheet surfaces, not for smaller
 * interactive controls like buttons or chips — those should stay visually flat. Passing
 * `elevation` to a control-sized element would look inconsistent with the rest of the design.
 */

import { View, type ViewProps } from 'react-native';

import { Colors, Elevation } from '@/constants/theme';

export type ThemedViewProps = ViewProps & {
  surface?: 'bg' | 'surface' | 'surface2' | 'surface3';
  elevation?: 'card' | 'pop';
};

export function ThemedView({ style, surface, elevation, ...rest }: ThemedViewProps) {
  return (
    <View
      style={[
        surface ? { backgroundColor: Colors.dark[surface] } : null,
        elevation === 'card'
          ? { boxShadow: `${Elevation.card.shadow}, inset 0px 1px 0px ${Elevation.card.topEdge}` }
          : null,
        elevation === 'pop' ? { boxShadow: Elevation.pop.shadow } : null,
        style,
      ]}
      {...rest}
    />
  );
}
