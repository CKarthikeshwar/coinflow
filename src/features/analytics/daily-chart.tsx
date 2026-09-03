/**
 * `DailyChart` — SPEC-UI-UX.md §6.10 item 5, SPEC-implementation.md §26.6/§29.4. F9. "Day by
 * day" — a greyscale area+line chart of daily spend, a dashed mean line, and inline "₹X" labels
 * for any day that clips past the p95-based y-axis max (`dailyChartYMax`, `domain/analytics.ts`)
 * rather than letting one rent-day spike flatten every other bar (§26.6's outlier scaling).
 *
 * The chart is plotted against `Math.min(amountMinor, yMax)` — a clipped day is drawn at the
 * axis ceiling, then its real value is written above the point as text, not silently truncated.
 */

import { area, line } from 'd3-shape';
import { scaleLinear } from 'd3-scale';
import { StyleSheet, View } from 'react-native';
import Svg, { Line as SvgLine, Path, Text as SvgText } from 'react-native-svg';

import { Colors, Spacing } from '@/constants/theme';
import type { DailyPoint } from '@/domain/analytics';
import { formatMoney } from '@/domain/format/money';

import { Card } from '@/ui/card';
import { ThemedText } from '@/ui/themed-text';

const WIDTH = 320;
const HEIGHT = 110;
const LABEL_GUTTER = 18;

export type DailyChartProps = { series: DailyPoint[]; yMax: number; mean: number };

export function DailyChart({ series, yMax, mean }: DailyChartProps) {
  if (series.length === 0) {
    return (
      <Card style={styles.card}>
        <ThemedText type="label" themeColor="text3">
          Day by day
        </ThemedText>
        <ThemedText type="body" themeColor="text3" style={styles.empty}>
          Nothing recorded for this period.
        </ThemedText>
      </Card>
    );
  }

  const xScale = scaleLinear([0, Math.max(series.length - 1, 1)], [0, WIDTH]);
  const yScale = scaleLinear([0, yMax], [HEIGHT, 0]);
  const clampedY = (v: number) => yScale(Math.min(v, yMax));

  const areaGen = area<DailyPoint>(
    (_d, i) => xScale(i),
    () => HEIGHT,
    (d) => clampedY(d.amountMinor),
  );
  const lineGen = line<DailyPoint>(
    (_d, i) => xScale(i),
    (d) => clampedY(d.amountMinor),
  );

  const areaD = areaGen(series);
  const lineD = lineGen(series);
  const meanY = clampedY(mean);
  const outliers = series.map((d, i) => ({ ...d, i })).filter((d) => d.amountMinor > yMax);

  return (
    <Card style={styles.card}>
      <ThemedText type="label" themeColor="text3">
        Day by day
      </ThemedText>
      <View style={styles.chartWrap}>
        <Svg
          width={WIDTH}
          height={HEIGHT + LABEL_GUTTER}
          viewBox={`0 ${-LABEL_GUTTER} ${WIDTH} ${HEIGHT + LABEL_GUTTER}`}
        >
          {areaD ? <Path d={areaD} fill={Colors.dark.surface3} /> : null}
          {lineD ? <Path d={lineD} stroke={Colors.dark.text} strokeWidth={1.5} fill="none" /> : null}
          <SvgLine
            x1={0}
            x2={WIDTH}
            y1={meanY}
            y2={meanY}
            stroke={Colors.dark.text3}
            strokeWidth={1}
            strokeDasharray="4,4"
          />
          {outliers.map((o) => (
            <SvgText
              key={o.i}
              testID={`outlier-label-${o.i}`}
              x={xScale(o.i)}
              y={clampedY(o.amountMinor) - 6}
              fontSize={10}
              fill={Colors.dark.text3}
              textAnchor="middle"
            >
              {formatMoney(o.amountMinor, { sign: 'none' })}
            </SvgText>
          ))}
        </Svg>
      </View>
      <ThemedText type="caption" themeColor="text3" style={styles.avgLabel}>
        avg {formatMoney(mean, { sign: 'none' })}
      </ThemedText>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.two },
  empty: { paddingVertical: Spacing.three, textAlign: 'center' },
  chartWrap: { alignItems: 'center' },
  avgLabel: { textAlign: 'right' },
});
