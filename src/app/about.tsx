/**
 * About — SPEC-UI-UX.md §6.14, SPEC-implementation.md §30.16. F8.5.
 *
 * Deferral (documented, not silent): the spec also calls for "licenses / help links", but no
 * real URL for either exists anywhere in the repo's specs, and URLs aren't something to invent —
 * only version + the on-device privacy line ship this pass. Bounded trigger: add the links once
 * the project actually has a repo/help URL to point them at.
 */

import { router } from 'expo-router';
import Constants from 'expo-constants';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { ThemedText } from '@/ui/themed-text';
import { TopBar } from '@/ui/top-bar';

export default function AboutScreen() {
  const version = Constants.expoConfig?.version ?? '—';

  return (
    <SafeAreaView style={styles.screen}>
      <TopBar title="About" onBack={() => router.back()} />
      <View style={styles.body}>
        <ThemedText type="title">CoinFlow</ThemedText>
        <ThemedText type="body" themeColor="text3">
          Version {version}
        </ThemedText>
        <ThemedText type="body" themeColor="text2" style={styles.privacy}>
          All your data stays on this device.
        </ThemedText>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { flex: 1, alignItems: 'center', paddingTop: Spacing.five, gap: Spacing.one, paddingHorizontal: Spacing.three },
  privacy: { paddingTop: Spacing.three, textAlign: 'center' },
});
