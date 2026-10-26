/**
 * **Needs a look** (SPEC-UI-UX.md §6.25 UI-107): the bank's balance moved by more than the recorded transactions
 * explain. One card per unexplained gap — "₹1,200 left HDFC ··672 that isn't recorded" — with **Add transaction**
 * (the Add sheet pre-filled: amount, direction, account, date, note "Unrecorded") and **It's fine** (hides it; the
 * balance itself stays right). Adding the missing transaction clears it by itself (derived, D45). Shown on Home and
 * on My accounts.
 */

import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { acknowledgeDiscrepancy, type AccountView } from '@/db/repositories/balances';
import { formatRupees } from '@/domain/format/money';
import { useSheetRegistry } from '@/stores';

import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Icon } from '@/ui/icon';
import { ThemedText } from '@/ui/themed-text';

import { METHOD_FOR_KIND } from './method-for-kind';

export function NeedsALookCards({ views }: { views: readonly AccountView[] }) {
  const openSheet = useSheetRegistry((s) => s.open);
  const items = views.flatMap((v) => (v.account.archivedAt ? [] : v.discrepancies.map((d) => ({ view: v, d }))));
  if (items.length === 0) return null;

  return (
    <View style={styles.list}>
      {items.map(({ view, d }) => {
        const out = d.diffMinor < 0;
        const amount = formatRupees(Math.abs(d.diffMinor));
        const name = view.account.nickname;
        return (
          <Card key={d.snapshotId} elevation="card" padding={Spacing.three} style={styles.card}>
            <View style={styles.head}>
              <Icon name="triangle-alert" size={18} color="warn" />
              <ThemedText type="body" themeColor="text" style={styles.title}>
                Needs a look
              </ThemedText>
            </View>
            <ThemedText type="label" themeColor="text2">
              {out ? `${amount} left ${name} that isn't recorded` : `${amount} arrived in ${name} that isn't recorded`}
            </ThemedText>
            <View style={styles.actions}>
              <Button variant="ghost" onPress={() => acknowledgeDiscrepancy(d.snapshotId)} style={styles.button}>
                It&apos;s fine
              </Button>
              <Button
                onPress={() =>
                  openSheet('add', {
                    prefill: {
                      amountMinor: Math.abs(d.diffMinor),
                      direction: out ? 'debit' : 'credit',
                      accountId: view.account.id,
                      paymentMethod: METHOD_FOR_KIND[view.account.kind],
                      occurredAt: d.toAsOf,
                      note: 'Unrecorded',
                    },
                  })
                }
                style={styles.button}
              >
                Add transaction
              </Button>
            </View>
          </Card>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.two },
  card: { gap: Spacing.two },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  title: { flex: 1 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.two },
  button: { paddingHorizontal: Spacing.three, minHeight: 36 },
});
