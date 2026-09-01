/**
 * The ambient radial ground (SPEC-UI-UX.md §3.1 / §29.1): a cool blue-grey glow behind
 * the top of every screen that settles to near-black lower down. Ambient only — never a
 * foreground element, never encodes meaning. Sits behind the navigator; screens render
 * over it with transparent backgrounds.
 *
 * `radial-gradient(135% 54% at 50% -8%, bgTop 0%, #0e0f18 42%, #090a0d 100%)`
 */

import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { Colors } from '@/constants/theme';

export function AppBackground({ children }: { children?: ReactNode }) {
  return (
    <View style={styles.root}>
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <RadialGradient id="ground" cx="50%" cy="-8%" rx="135%" ry="54%">
            <Stop offset="0" stopColor={Colors.dark.bgTop} />
            <Stop offset="0.42" stopColor="#0e0f18" />
            <Stop offset="1" stopColor="#090a0d" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#ground)" />
      </Svg>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.dark.bg,
  },
});
