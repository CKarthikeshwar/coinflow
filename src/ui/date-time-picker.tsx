/**
 * `DateTimePicker` — a compact calendar-grid + stepper picker for choosing a date and time
 * without typing them out. Replaces the two raw `yyyy-mm-dd`/`hh:mm` text fields the Add/Edit/
 * Confirm sheet used to show (`transaction-sheet.tsx`'s "Date & time" row) — those required the
 * user to type an exact, correctly-formatted string by hand, with no feedback until `date-fns`'s
 * `parse()` either silently accepted or silently ignored it.
 *
 * Hand-rolled rather than a native `@react-native-community/datetimepicker`: the app has no
 * native date-picker dependency installed, and adding one means relinking + rebuilding the dev
 * client (this app's custom `modules/coinflow-sms` native module already means Expo Go can't be
 * used at all — see root `CLAUDE.md`). A plain-JS grid fits the app's existing pattern of
 * hand-rolled controls (the numeric keypad, the segmented control, the analytics charts) and
 * needs no rebuild.
 *
 * Month grid uses Monday-first weeks (matches `date-fns`'s ISO-week default used elsewhere in
 * this app, e.g. `src/domain/period.ts`'s week boundaries).
 */

import {
  addDays,
  addMonths,
  eachDayOfInterval,
  format,
  isSameDay,
  isSameMonth,
  setHours,
  setMinutes,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';

import type { TimeField } from '@/domain/time-entry';

import { Icon } from './icon';
import { ThemedText } from './themed-text';

const WEEKDAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
// CR-31: was 5 — exact minutes are now one tap each way (or typed, see `onFieldPress`).
const MINUTE_STEP = 1;

export type DateTimePickerProps = {
  valueMs: number;
  onChange: (ms: number) => void;
  /**
   * CR-31 — which time field the parent's numeric keypad is typing into, if any; it is highlighted. Tapping the
   * hour or minute number calls `onFieldPress` so the parent can point its keypad at it (digits only — never the
   * phone's full keyboard). Without `onFieldPress` the numbers are plain text, as before.
   */
  activeField?: TimeField | null;
  onFieldPress?: (field: TimeField) => void;
};

/**
 * The month grid as 6 Monday-first weeks of 7 days (42 cells, so the height never jumps between months), including
 * the leading / trailing days of the neighbouring months. CR-32: rendered row by row, so a day can't drift under the
 * wrong weekday.
 */
export function monthWeeks(month: Date): Date[][] {
  const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: addDays(gridStart, 41) });
  return Array.from({ length: 6 }, (_, i) => days.slice(i * 7, i * 7 + 7));
}

export function DateTimePicker({ valueMs, onChange, activeField = null, onFieldPress }: DateTimePickerProps) {
  const selected = useMemo(() => new Date(valueMs), [valueMs]);
  const [viewedMonth, setViewedMonth] = useState(() => startOfMonth(selected));

  const weeks = useMemo(() => monthWeeks(viewedMonth), [viewedMonth]);

  const pickDay = (day: Date) => {
    const next = setMinutes(setHours(day, selected.getHours()), selected.getMinutes());
    onChange(next.getTime());
  };

  const stepHour = (delta: number) => {
    const next = new Date(selected);
    next.setHours((((next.getHours() + delta) % 24) + 24) % 24);
    onChange(next.getTime());
  };

  const stepMinute = (delta: number) => {
    const next = new Date(selected);
    const totalMinutes = next.getHours() * 60 + next.getMinutes() + delta;
    const wrapped = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
    next.setHours(Math.floor(wrapped / 60), wrapped % 60, 0, 0);
    onChange(next.getTime());
  };

  return (
    <View style={styles.root}>
      <View style={styles.monthHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          hitSlop={8}
          onPress={() => setViewedMonth((m) => subMonths(m, 1))}
          style={[styles.monthNav, styles.chevronLeft]}
        >
          <Icon name="chevron-right" size={18} color="text3" />
        </Pressable>
        <ThemedText type="label" style={styles.monthLabel}>
          {format(viewedMonth, 'MMMM yyyy')}
        </ThemedText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next month"
          hitSlop={8}
          onPress={() => setViewedMonth((m) => addMonths(m, 1))}
          style={styles.monthNav}
        >
          <Icon name="chevron-right" size={18} color="text3" />
        </Pressable>
      </View>

      <View style={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((label, i) => (
          <ThemedText key={i} type="caption" themeColor="text3" style={styles.weekdayCell}>
            {label}
          </ThemedText>
        ))}
      </View>

      {/* CR-32: explicit week rows of 7 equal cells — a wrapping grid fitted 8 (fixed px) or 6 (rounded %) on the
          Samsung, putting dates under the wrong weekday */}
      <View style={styles.grid}>
        {weeks.map((week) => (
          <View key={week[0].toISOString()} style={styles.weekRow}>
            {week.map((day) => {
              const inMonth = isSameMonth(day, viewedMonth);
              const isSelected = isSameDay(day, selected);
              return (
                <Pressable
                  key={day.toISOString()}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => pickDay(day)}
                  style={styles.dayCell}
                >
                  <View style={[styles.dayInner, isSelected ? styles.dayInnerSelected : null]}>
                    <ThemedText
                      type="label"
                      themeColor={isSelected ? 'primaryInk' : inMonth ? 'text' : 'text3'}
                    >
                      {format(day, 'd')}
                    </ThemedText>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      <View style={styles.timeRow}>
        <TimeStepper
          label="Hour"
          value={format(selected, 'HH')}
          active={activeField === 'hour'}
          onPressValue={onFieldPress ? () => onFieldPress('hour') : undefined}
          onDecrement={() => stepHour(-1)}
          onIncrement={() => stepHour(1)}
        />
        <ThemedText type="title" themeColor="text3" style={styles.timeColon}>
          :
        </ThemedText>
        <TimeStepper
          label="Minute"
          value={format(selected, 'mm')}
          active={activeField === 'minute'}
          onPressValue={onFieldPress ? () => onFieldPress('minute') : undefined}
          onDecrement={() => stepMinute(-MINUTE_STEP)}
          onIncrement={() => stepMinute(MINUTE_STEP)}
        />
      </View>
    </View>
  );
}

function TimeStepper({
  label,
  value,
  active,
  onPressValue,
  onDecrement,
  onIncrement,
}: {
  label: string;
  value: string;
  active: boolean;
  onPressValue?: () => void;
  onDecrement: () => void;
  onIncrement: () => void;
}) {
  const valueText = (
    <ThemedText type="title" style={styles.stepperValueText}>
      {value}
    </ThemedText>
  );
  return (
    <View style={styles.stepper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Decrease ${label}`}
        hitSlop={8}
        onPress={onDecrement}
        style={styles.stepperButton}
      >
        <ThemedText type="title" themeColor="text2">
          −
        </ThemedText>
      </Pressable>
      {onPressValue ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} ${value}, type a value`}
          accessibilityState={{ selected: active }}
          onPress={onPressValue}
          style={[styles.stepperValue, active ? styles.stepperValueActive : null]}
        >
          {valueText}
        </Pressable>
      ) : (
        <View style={styles.stepperValue}>{valueText}</View>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Increase ${label}`}
        hitSlop={8}
        onPress={onIncrement}
        style={styles.stepperButton}
      >
        <ThemedText type="title" themeColor="text2">
          +
        </ThemedText>
      </Pressable>
    </View>
  );
}

const CELL_SIZE = 40;

const styles = StyleSheet.create({
  root: {
    backgroundColor: Colors.dark.surface2,
    borderRadius: Radius.control,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthNav: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  chevronLeft: { transform: [{ rotate: '180deg' }] },
  monthLabel: { fontWeight: '600' },
  weekdayRow: { flexDirection: 'row' },
  // CR-32: weekday letters and day cells share the same flex: 1 columns, so they always line up
  weekdayCell: { flex: 1, textAlign: 'center' },
  grid: {},
  weekRow: { flexDirection: 'row' },
  dayCell: { flex: 1, height: CELL_SIZE, alignItems: 'center', justifyContent: 'center' },
  dayInner: {
    width: 32,
    height: 32,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayInnerSelected: { backgroundColor: Colors.dark.primary },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    marginTop: Spacing.one,
    paddingTop: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.dark.hairline,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  stepperButton: {
    width: 32,
    height: 32,
    borderRadius: Radius.control,
    backgroundColor: Colors.dark.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: {
    minWidth: 44,
    paddingVertical: Spacing.half,
    borderRadius: Radius.control,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
  },
  // CR-31: the field the keypad is typing into
  stepperValueActive: { borderColor: Colors.dark.primary, backgroundColor: Colors.dark.surface3 },
  stepperValueText: { textAlign: 'center', fontVariant: ['tabular-nums'] },
  timeColon: { marginTop: -4 },
});
