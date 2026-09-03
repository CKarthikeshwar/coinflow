/**
 * `OnboardingGraphic` — SPEC-UI-UX.md §6.1: "each step carries an abstract black-and-white
 * graphic composition (simple geometric shapes / line work) — no commissioned illustration."
 * F12. Hand-rolled `react-native-svg` shapes, one composition per step — decoration, not data,
 * so no test coverage beyond "it renders" is warranted (§34.0 — display-only, no branching logic).
 */

import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Rect } from 'react-native-svg';

import { Colors } from '@/constants/theme';

const SIZE = 160;
const STROKE = Colors.dark.text3;

function WelcomeGraphic() {
  // Concentric rings — a simple "signal" motif.
  return (
    <Svg width={SIZE} height={SIZE} viewBox="0 0 160 160">
      <Circle cx={80} cy={80} r={60} stroke={STROKE} strokeWidth={1.5} fill="none" />
      <Circle cx={80} cy={80} r={38} stroke={STROKE} strokeWidth={1.5} fill="none" />
      <Circle cx={80} cy={80} r={16} stroke={Colors.dark.text} strokeWidth={1.5} fill="none" />
    </Svg>
  );
}

function PermissionsGraphic() {
  // Two overlapping outlined shapes — a "two things, side by side" motif.
  return (
    <Svg width={SIZE} height={SIZE} viewBox="0 0 160 160">
      <Circle cx={62} cy={80} r={40} stroke={STROKE} strokeWidth={1.5} fill="none" />
      <Circle cx={98} cy={80} r={40} stroke={Colors.dark.text} strokeWidth={1.5} fill="none" />
    </Svg>
  );
}

function CategoriesGraphic() {
  // A small grid of outlined squares — a "sorting into groups" motif.
  const cells: [number, number][] = [
    [35, 45],
    [90, 45],
    [35, 100],
    [90, 100],
  ];
  return (
    <Svg width={SIZE} height={SIZE} viewBox="0 0 160 160">
      {cells.map(([x, y], i) => (
        <Rect
          key={i}
          x={x}
          y={y}
          width={35}
          height={35}
          rx={4}
          stroke={i === 0 ? Colors.dark.text : STROKE}
          strokeWidth={1.5}
          fill="none"
        />
      ))}
    </Svg>
  );
}

export type OnboardingGraphicVariant = 'welcome' | 'permissions' | 'categories';

export function OnboardingGraphic({ variant }: { variant: OnboardingGraphicVariant }) {
  return (
    <View style={styles.wrap}>
      {variant === 'welcome' ? <WelcomeGraphic /> : null}
      {variant === 'permissions' ? <PermissionsGraphic /> : null}
      {variant === 'categories' ? <CategoriesGraphic /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
});
