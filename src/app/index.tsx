/**
 * Home — still a stub. The full screen (SPEC-implementation.md §30.4: balance hero, income/
 * spending tiles, recent activity, quick add) is a separate, larger feature not built yet.
 *
 * This pass adds exactly one real, spec'd piece: the "N to review" action-strip row (§6.2),
 * because Review Queue (F11) needs a way to be reached. Everything else here stays placeholder.
 */

import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { usePendingCount } from '@/db/repositories/suggestions';

import { ActionStripRow } from '@/features/home/action-strip';
import { ThemedText } from '@/ui/themed-text';

export default function HomeScreen() {
  const { count } = usePendingCount();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.center}>
        <ThemedText type="title">CoinFlow</ThemedText>
        <ThemedText type="body" themeColor="text3">
          Home — coming soon
        </ThemedText>
      </View>
      <View style={styles.strip}>
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
  strip: { paddingBottom: Spacing.four },
});
