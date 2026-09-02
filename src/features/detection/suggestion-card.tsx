/**
 * `SuggestionCard` — SPEC-UI-UX.md §3.6 / §6.3, SPEC-implementation.md §29.4. One lifted card
 * per pending Suggestion: payment-method icon tile + signed amount + neutral descriptor
 * (detected items have no note yet) + relative time + overflow → Dismiss; inline **Save**
 * only when `known`.
 *
 * Simplification vs. spec: the overflow interaction is a direct tap-to-dismiss icon button
 * rather than a swipe gesture — same functional outcome (removes the row), simpler to build
 * correctly right now. Noted in `SPEC/traceability.md`.
 */

import { Pressable, StyleSheet, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';
import type { PaymentMethod, Suggestion } from '@/db/schema';
import { formatMoney } from '@/domain/format/money';
import { formatWhen } from '@/domain/format/when';

import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Icon, type IconName } from '@/ui/icon';
import { ThemedText } from '@/ui/themed-text';

const METHOD_ICON: Record<PaymentMethod, IconName> = {
  upi: 'credit-card',
  card: 'credit-card',
  cash: 'banknote',
  bank_transfer: 'landmark',
  wallet: 'wallet',
};

const METHOD_DESCRIPTOR: Record<PaymentMethod, (direction: Suggestion['direction']) => string> = {
  upi: () => 'UPI payment',
  card: () => 'Card payment',
  cash: () => 'Cash payment',
  bank_transfer: (d) => (d === 'credit' ? 'Bank credit' : 'Bank transfer'),
  wallet: () => 'Wallet payment',
};

function descriptorFor(suggestion: Suggestion): string {
  if (!suggestion.paymentMethod) return 'Transaction';
  return METHOD_DESCRIPTOR[suggestion.paymentMethod](suggestion.direction);
}

export type SuggestionCardProps = {
  suggestion: Suggestion;
  known: boolean;
  onOpen: () => void;
  onSave?: () => void;
  onDismiss: () => void;
};

export function SuggestionCard({ suggestion, known, onOpen, onSave, onDismiss }: SuggestionCardProps) {
  const iconName: IconName = suggestion.paymentMethod ? METHOD_ICON[suggestion.paymentMethod] : 'credit-card';

  return (
    <Card elevation="card" padding={Spacing.three} style={styles.card}>
      <Pressable style={styles.body} onPress={onOpen} accessibilityRole="button">
        <View style={styles.tile}>
          <Icon name={iconName} size={20} />
        </View>
        <View style={styles.textCol}>
          <ThemedText type="title">
            {suggestion.amountMinor !== null ? formatMoney(suggestion.amountMinor) : '—'}
          </ThemedText>
          <ThemedText type="label" themeColor="text3">
            {descriptorFor(suggestion)} · {formatWhen(suggestion.smsReceivedAt)}
          </ThemedText>
        </View>
      </Pressable>
      <View style={styles.actions}>
        {known && onSave ? (
          <Button variant="ghost" onPress={onSave} style={styles.saveButton}>
            Save
          </Button>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          onPress={onDismiss}
          hitSlop={8}
          style={styles.overflow}
        >
          <Icon name="more-vertical" size={18} color="text3" />
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  body: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  tile: {
    width: 42,
    height: 42,
    borderRadius: Radius.iconTile,
    backgroundColor: Colors.dark.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: { flex: 1, gap: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  saveButton: { paddingHorizontal: Spacing.three, minHeight: 36 },
  overflow: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
});
