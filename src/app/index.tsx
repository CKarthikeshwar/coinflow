/**
 * Home — still a stub. The full screen (SPEC-implementation.md §30.4: balance hero, income/
 * spending tiles, recent activity, quick add) is a separate, larger feature not built yet.
 *
 * This pass adds real, spec'd pieces, not the whole screen: the "N to review" action-strip row
 * (§6.2), because Review Queue (F11) needed a way to be reached; a temporary "Add transaction"
 * button opening the Add sheet (F4) — its real home is the raised centre **Add** in the bottom
 * tab bar (§4), which doesn't exist yet; and a temporary "Transactions" link to the list (F5) —
 * its real home is the Transactions tab, same reason. Everything else here stays placeholder.
 */

import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { usePendingCount } from '@/db/repositories/suggestions';
import { useSheetRegistry } from '@/stores';

import { ActionStripRow } from '@/features/home/action-strip';
import { Button } from '@/ui/button';
import { ThemedText } from '@/ui/themed-text';

export default function HomeScreen() {
  const { count } = usePendingCount();
  const openSheet = useSheetRegistry((s) => s.open);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.center}>
        <ThemedText type="title">CoinFlow</ThemedText>
        <ThemedText type="body" themeColor="text3">
          Home — coming soon
        </ThemedText>
        <Button onPress={() => openSheet('add', {})}>Add transaction</Button>
        <Button variant="ghost" onPress={() => router.push('/transactions')}>
          Transactions
        </Button>
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
