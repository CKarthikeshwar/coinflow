/**
 * Base surface primitive (SPEC-implementation.md §29.3). `surface` paints a §3.1 surface
 * token; `elevation` applies the §3.3 shadow (card surfaces also get a hairline top edge).
 * Controls stay flat — don't pass `elevation` to them.
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
