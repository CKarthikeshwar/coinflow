/**
 * The screen shown on the web build instead of any real feature — CoinFlow only actually works
 * on Android (it needs SMS access), so every `.web.tsx` version of a screen (e.g.
 * `src/app/(tabs)/index.web.tsx`) renders this component instead of the real screen, rather
 * than trying to render a database-backed UI that has no database to read on web.
 */

import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';

import { Icon } from './icon';
import { ThemedText } from './themed-text';

export function AndroidOnlyNotice() {
  return (
    <View style={styles.wrap}>
      <Icon name="shield-check" size={28} color="text3" />
      <ThemedText type="title" style={styles.line}>
        CoinFlow is an Android app
      </ThemedText>
      <ThemedText type="body" themeColor="text3" style={styles.line}>
        It reads transaction SMS on-device, so it only runs on Android. Open it on your phone.
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.five,
  },
  line: { textAlign: 'center' },
});
