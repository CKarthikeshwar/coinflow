/**
 * `Toast` — SPEC-implementation.md §30.6/§30.7. Translucent bar above the nav, message + an
 * optional single action (e.g. "View"). Same visual shape as `UndoSnackbar`; kept separate since
 * `UndoSnackbar`'s action is hardcoded to "Undo" and this one's label/handler are caller-supplied.
 */

import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Radius, Spacing } from '@/constants/theme';

import { ThemedText } from './themed-text';

export type ToastProps = {
  visible: boolean;
  message: string;
  action?: { label: string; onPress: () => void } | null;
};

/**
 * CR-31 — clears the floating tab bar: its 64 px pill sits `insets.bottom + 8` up, and the centre Add button rises
 * about 24 px above the pill. The toast used to sit 32 px from the bottom, over the tab labels and the Add button.
 */
const TAB_BAR_CLEARANCE = Spacing.two + 64 + Spacing.four + Spacing.three;

/** CR-33 — soft entrance / exit: a gentle fade + short rise (no pop), the exit a touch quicker than the entrance. */
const ENTER_MS = 340;
const EXIT_MS = 280;
const RISE_PX = 14;

export function Toast({ visible, message, action }: ToastProps) {
  const insets = useSafeAreaInsets();
  const [progress] = useState(() => new Animated.Value(0));
  // Stays mounted through the exit animation, and keeps the last content so the text doesn't blank while fading out.
  const [mounted, setMounted] = useState(visible);
  const [content, setContent] = useState({ message, action });
  if (visible && !mounted) setMounted(true);
  if (visible && (content.message !== message || content.action !== action)) setContent({ message, action });

  useEffect(() => {
    const anim = Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? ENTER_MS : EXIT_MS,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.quad),
      useNativeDriver: true,
    });
    anim.start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
    return () => anim.stop();
  }, [visible, progress]);

  if (!mounted) return null;

  return (
    <Animated.View
      style={[
        styles.wrap,
        {
          bottom: insets.bottom + TAB_BAR_CLEARANCE,
          opacity: progress,
          transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [RISE_PX, 0] }) }],
        },
      ]}
      pointerEvents="box-none">
      <View style={styles.bar}>
        <ThemedText type="body" themeColor="text" style={styles.message}>
          {content.message}
        </ThemedText>
        {content.action ? (
          <Pressable accessibilityRole="button" onPress={content.action.onPress} hitSlop={8}>
            <ThemedText type="label" themeColor="text" style={styles.action}>
              {content.action.label}
            </ThemedText>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    alignItems: 'stretch',
  },
  // CR-31: opaque (the old 90%-alpha fill let the tab labels show through) with a hairline edge, like the other
  // raised surfaces.
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.control,
    backgroundColor: Colors.dark.surface3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.dark.hairline,
  },
  message: { flex: 1 },
  action: { fontWeight: '700' },
});
