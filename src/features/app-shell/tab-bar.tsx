/**
 * FILE PURPOSE
 * ------------
 * The app's bottom tab bar — a floating pill with 4 destinations (Home, Transactions, Analytics,
 * Settings) plus a raised "+" button in the middle that opens the Add-transaction sheet directly
 * (it's not a 5th tab/route — tapping it calls `useSheetRegistry`'s `open('add')` instead of
 * navigating anywhere).
 *
 * WHERE IT FITS
 * -------------
 * Passed as the custom `tabBar` render prop to `(tabs)/_layout.tsx`'s tab navigator, instead of
 * using `NativeTabs` — a fully custom component was necessary because `NativeTabs` has no way to
 * express the raised centre "Add" FAB notch the design calls for.
 *
 * Simplification (documented, not silent): the design calls the pill "blurred" — `expo-blur`
 * isn't installed yet, so this uses a solid `surface` fill instead. Same shape and elevation,
 * one native dependency deferred; swap in a `BlurView` later without touching the layout.
 */

import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, StyleSheet, View } from 'react-native';

import { Colors, Elevation, Radius, Spacing } from '@/constants/theme';
import { useSheetRegistry } from '@/stores';

import { Icon, type IconName } from '@/ui/icon';
import { ThemedText } from '@/ui/themed-text';
import { ThemedView } from '@/ui/themed-view';

const TAB_META: Record<string, { label: string; icon: IconName }> = {
  index: { label: 'Home', icon: 'home' },
  transactions: { label: 'Transactions', icon: 'history' },
  analytics: { label: 'Analytics', icon: 'bar-chart-3' },
  settings: { label: 'Settings', icon: 'sliders-horizontal' },
};

export function CoinFlowTabBar({ state, navigation, insets }: BottomTabBarProps) {
  const openSheet = useSheetRegistry((s) => s.open);
  const routes = state.routes.filter((r) => r.name in TAB_META);
  const leftRoutes = routes.slice(0, 2); // Home, Transactions
  const rightRoutes = routes.slice(2); // Analytics, Settings

  const renderTab = (route: (typeof routes)[number]) => {
    const meta = TAB_META[route.name];
    const index = state.routes.findIndex((r) => r.key === route.key);
    const isFocused = state.index === index;

    const onPress = () => {
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!isFocused && !event.defaultPrevented) {
        navigation.navigate(route.name);
      }
    };

    return (
      <Pressable
        key={route.key}
        accessibilityRole="tab"
        accessibilityState={{ selected: isFocused }}
        accessibilityLabel={meta.label}
        onPress={onPress}
        style={styles.tab}
      >
        <Icon name={meta.icon} size={22} color={isFocused ? 'text' : 'text3'} />
        <ThemedText type="micro" themeColor={isFocused ? 'text' : 'text3'}>
          {meta.label}
        </ThemedText>
      </Pressable>
    );
  };

  return (
    <View pointerEvents="box-none" style={[styles.floatWrap, { paddingBottom: insets.bottom + Spacing.two }]}>
      <ThemedView surface="surface" elevation="pop" style={styles.pill}>
        {leftRoutes.map(renderTab)}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add transaction"
          onPress={() => openSheet('add', {})}
          style={styles.addButton}
        >
          <Icon name="plus" size={26} color="primaryInk" />
        </Pressable>
        {rightRoutes.map(renderTab)}
      </ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  floatWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    width: '100%',
    maxWidth: 420,
    height: 64,
    borderRadius: Radius.pill,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    height: '100%',
  },
  addButton: {
    width: 52,
    height: 52,
    borderRadius: Radius.pill,
    backgroundColor: Colors.dark.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -20,
    boxShadow: Elevation.pop.shadow,
  },
});
