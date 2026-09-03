/**
 * The tab shell — SPEC-implementation.md §28.1 (D25 / D32). 4 destinations behind a custom
 * `CoinFlowTabBar`, not `NativeTabs` (the raised centre Add "FAB notch" isn't expressible
 * with `unstable-native-tabs`, and iOS is Future).
 */

import { Tabs } from 'expo-router/js-tabs';

import { CoinFlowTabBar } from '@/features/app-shell/tab-bar';

export const unstable_settings = {
  initialRouteName: 'index',
};

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <CoinFlowTabBar {...props} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="transactions" />
      <Tabs.Screen name="analytics" />
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}
