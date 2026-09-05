/**
 * FILE PURPOSE
 * ------------
 * A static, read-only reference screen listing the payment methods the app recognizes (UPI,
 * Card, Cash, Bank transfer, Wallet) with their icons — purely informational, no editing.
 * Reached from Settings' "Payment methods" row.
 *
 * IMPORTANT
 * ---------
 * UPI reuses the `credit-card` icon rather than having a UPI-specific glyph — there's no direct
 * Lucide icon for it, and this is the same choice `src/features/detection/suggestion-card.tsx`'s
 * `METHOD_ICON` map already makes for the same reason.
 */

import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Spacing } from '@/constants/theme';
import type { PaymentMethod } from '@/db/schema';

import { Icon, type IconName } from '@/ui/icon';
import { ThemedText } from '@/ui/themed-text';
import { TopBar } from '@/ui/top-bar';

const METHODS: { value: PaymentMethod; label: string; icon: IconName }[] = [
  { value: 'upi', label: 'UPI', icon: 'credit-card' },
  { value: 'card', label: 'Card', icon: 'credit-card' },
  { value: 'cash', label: 'Cash', icon: 'banknote' },
  { value: 'bank_transfer', label: 'Bank transfer', icon: 'landmark' },
  { value: 'wallet', label: 'Wallet', icon: 'wallet' },
];

export default function PaymentMethodsScreen() {
  return (
    <SafeAreaView style={styles.screen}>
      <TopBar title="Payment methods" onBack={() => router.back()} />
      <View style={styles.body}>
        <View style={styles.section}>
          {METHODS.map((method) => (
            <View key={method.value} style={styles.row}>
              <View style={styles.tile}>
                <Icon name={method.icon} size={18} />
              </View>
              <ThemedText type="body" themeColor="text" style={styles.label}>
                {method.label}
              </ThemedText>
            </View>
          ))}
        </View>
        <ThemedText type="caption" themeColor="text3" style={styles.footer}>
          Custom accounts are coming later.
        </ThemedText>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { flex: 1, paddingHorizontal: Spacing.three },
  section: {
    borderRadius: 14,
    backgroundColor: Colors.dark.surface2,
    paddingHorizontal: Spacing.two,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, minHeight: 56 },
  tile: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: Colors.dark.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { flex: 1 },
  footer: { paddingTop: Spacing.three, textAlign: 'center' },
});
