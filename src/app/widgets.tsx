/**
 * FILE PURPOSE
 * ------------
 * **Settings › Widgets** (SPEC-UI-UX.md §6.24, UI-098): the "Hide amounts on widgets" switch and a short
 * how-to-add card. There is no in-app "pin widget" prompt in V2 — Android's own widget picker is the way in.
 *
 * WHERE IT FITS
 * -------------
 * Pushed from the Settings tab. The switch writes the `widgetHideAmounts` setting; `WidgetSync` watches that
 * setting and republishes the snapshot, whose `hideAmounts` flag the native providers honour (§44.6).
 */

import { router } from 'expo-router';
import { StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Spacing } from '@/constants/theme';
import { setSetting, useSetting } from '@/db/repositories/settings';

import { ThemedText } from '@/ui/themed-text';
import { TopBar } from '@/ui/top-bar';

export default function WidgetsScreen() {
  const hide = useSetting<boolean>('widgetHideAmounts');
  const hideOn = hide.value === true;

  return (
    <SafeAreaView style={styles.screen}>
      <TopBar title="Widgets" onBack={() => router.back()} />
      <View style={styles.body}>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <ThemedText type="body" themeColor="text">
              Hide amounts on widgets
            </ThemedText>
            <ThemedText type="caption" themeColor="text3">
              Amounts show as •••• on the home screen. Labels stay visible.
            </ThemedText>
          </View>
          <Switch
            accessibilityLabel="Hide amounts on widgets"
            value={hideOn}
            onValueChange={(next) => setSetting('widgetHideAmounts', next)}
            trackColor={{ false: Colors.dark.surface3, true: Colors.dark.text }}
            thumbColor={Colors.dark.bg}
          />
        </View>

        <ThemedText type="caption" themeColor="text3" style={styles.sectionLabel}>
          HOW TO ADD A WIDGET
        </ThemedText>
        <View style={styles.card}>
          <ThemedText type="body" themeColor="text2">
            Long-press an empty spot on your home screen, tap Widgets, then pick CoinFlow. Choose Money summary,
            To review or Quick add.
          </ThemedText>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { paddingHorizontal: Spacing.three, gap: Spacing.two },
  sectionLabel: { marginTop: Spacing.four },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 56 },
  rowText: { flex: 1 },
  card: { backgroundColor: Colors.dark.surface2, borderRadius: 16, padding: Spacing.three },
});
