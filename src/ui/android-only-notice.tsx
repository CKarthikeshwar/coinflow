/**
 * SPEC-implementation.md §18.3 — web ships as static output with no CoinFlow features in V1
 * (Android-only, D3). Every route's `.web.tsx` twin renders this instead of touching the
 * database or any Android-only service.
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
