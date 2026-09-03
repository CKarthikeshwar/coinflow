/**
 * Settings tab — stub since F6.5 (the real grouped-list screen, SPEC-UI-UX.md §6.13 /
 * SPEC-implementation.md §30.15, is F8.5, not built yet).
 *
 * F8 adds one temporary link straight to Account rules — F8's own subpage
 * (SPEC-implementation.md §30.16, D16), already fully built — so it doesn't have to wait on
 * F8.5's full grouped list. F8.5 will replace this stub wholesale; its own "Account rules" row
 * will point at the same already-built screen this row does.
 */

import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Spacing } from '@/constants/theme';
import { Icon } from '@/ui/icon';
import { ThemedText } from '@/ui/themed-text';

export default function SettingsScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.center}>
        <ThemedText type="title">Settings</ThemedText>
        <Pressable accessibilityRole="button" onPress={() => router.push('/account-rules')} style={styles.row}>
          <ThemedText type="body" themeColor="text" style={styles.rowLabel}>
            Account rules
          </ThemedText>
          <Icon name="chevron-right" size={16} color="text3" />
        </Pressable>
        <ThemedText type="body" themeColor="text3">
          More settings coming soon
        </ThemedText>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    minWidth: 220,
    borderRadius: 14,
    backgroundColor: Colors.dark.surface2,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  rowLabel: { flex: 1 },
});
