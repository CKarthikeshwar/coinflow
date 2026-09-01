import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { ThemedText } from '@/ui/themed-text';

/**
 * Placeholder Home. The real screen (SPEC-implementation.md §30.4) is built in the
 * feature phase; this exists so the app boots on the new design foundation.
 */
export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.center}>
        <ThemedText type="title">CoinFlow</ThemedText>
        <ThemedText type="body" themeColor="text3">
          Home — coming soon
        </ThemedText>
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
