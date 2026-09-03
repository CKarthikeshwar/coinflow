/**
 * Home — still a stub. The full screen (SPEC-implementation.md §30.4: balance hero, income/
 * spending tiles, recent activity) is F6.5's next pass, not this one.
 *
 * This pass (F6.5 step 1) only adds the tab shell around it — the raised centre **Add** and
 * the **Transactions** tab now live in `CoinFlowTabBar`, so the temporary buttons that used to
 * stand in for them here are gone. The "N to review" action-strip row (§6.2, added for F11)
 * stays — it's real, spec'd content, not a placeholder.
 */

import { router } from 'expo-router';
import { useBottomTabBarHeight } from 'expo-router/js-tabs';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { usePendingCount } from '@/db/repositories/suggestions';

import { ActionStripRow } from '@/features/home/action-strip';
import { ThemedText } from '@/ui/themed-text';

export default function HomeScreen() {
  const { count } = usePendingCount();
  // The tab bar floats over content (F6.5's `CoinFlowTabBar`), so it doesn't reserve its own
  // space in the layout the way a docked bar would — every tab screen adds this itself.
  const tabBarHeight = useBottomTabBarHeight();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.center}>
        <ThemedText type="title">CoinFlow</ThemedText>
        <ThemedText type="body" themeColor="text3">
          Home — coming soon
        </ThemedText>
      </View>
      <View style={{ paddingBottom: tabBarHeight + Spacing.three }}>
        <ActionStripRow kind="review" count={count} onPress={() => router.push('/review-queue')} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
});
