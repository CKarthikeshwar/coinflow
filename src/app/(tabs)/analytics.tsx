/**
 * Analytics tab — stub. The real screen (SPEC-UI-UX.md §6.10, SPEC-implementation.md §30.12,
 * §26) is F9, not built yet. This pass (F6.5) only needs the tab to exist so the shell has its
 * 4 real destinations.
 */

import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { ThemedText } from '@/ui/themed-text';

export default function AnalyticsScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.center}>
        <ThemedText type="title">Analytics</ThemedText>
        <ThemedText type="body" themeColor="text3">
          Coming soon
        </ThemedText>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
});
