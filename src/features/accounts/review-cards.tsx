/**
 * The Review Queue's account cards (SPEC-UI-UX.md §6.25), shown above the detected transactions:
 *   - **New account found** (UI-104) — an account auto-created from a bank text; *Name it* opens the account sheet.
 *   - **Looks like a transfer?** (UI-106) — a debit and a credit of the same amount on two of your accounts that could
 *     not be linked on their own (several candidates, or neither came from an SMS). *Yes, transfer* / *No*.
 *   - **Card bill payment?** (UI-108) — a bank debit whose text said it paid one of your cards. *Yes* makes it a
 *     transfer (not spending); *No* keeps it an expense.
 */

import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useAccounts, useNewAccounts } from '@/db/repositories/accounts';
import {
  acceptCardBillHint,
  clearCardBillHint,
  dismissTransferHint,
  linkPair,
  useCardBillHints,
  useTransferHints,
} from '@/db/repositories/transfers';
import type { MyAccount } from '@/db/schema';
import { formatRupees } from '@/domain/format/money';
import { useSheetRegistry, useToast } from '@/stores';

import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Icon } from '@/ui/icon';
import { ThemedText } from '@/ui/themed-text';

import { ACCOUNT_KIND_ICON, accountName } from './account-label';

function ReviewCard({
  icon,
  title,
  body,
  primary,
  secondary,
}: {
  icon: Parameters<typeof Icon>[0]['name'];
  title: string;
  body?: string;
  primary: { label: string; onPress: () => void };
  secondary?: { label: string; onPress: () => void };
}) {
  return (
    <Card elevation="card" padding={Spacing.three} style={styles.card}>
      <View style={styles.head}>
        <Icon name={icon} size={18} color="text2" />
        <ThemedText type="body" themeColor="text" style={styles.title}>
          {title}
        </ThemedText>
      </View>
      {body ? (
        <ThemedText type="label" themeColor="text3">
          {body}
        </ThemedText>
      ) : null}
      <View style={styles.actions}>
        {secondary ? (
          <Button variant="ghost" onPress={secondary.onPress} style={styles.button}>
            {secondary.label}
          </Button>
        ) : null}
        <Button onPress={primary.onPress} style={styles.button}>
          {primary.label}
        </Button>
      </View>
    </Card>
  );
}

/** How many account cards are waiting (the Review Queue's empty state / count). */
export function useAccountReviewCount(): number {
  const { data: fresh } = useNewAccounts();
  return (fresh ?? []).length + useTransferHints().length + useCardBillHints().length;
}

export function AccountReviewCards() {
  const openSheet = useSheetRegistry((s) => s.open);
  const showToast = useToast((s) => s.show);
  const { data: fresh } = useNewAccounts();
  const { data: all } = useAccounts();
  const transferHints = useTransferHints();
  const cardBillHints = useCardBillHints();
  const byId = new Map<string, MyAccount>((all ?? []).map((a) => [a.id, a]));
  const name = (id: string | null) => accountName(id ? byId.get(id) : null);

  return (
    <View style={styles.list}>
      {(fresh ?? []).map((a) => (
        <ReviewCard
          key={`new-${a.id}`}
          icon={ACCOUNT_KIND_ICON[a.kind]}
          title={`New account found: ${a.nickname}`}
          body="Found in your bank texts. Give it a name you will recognise."
          primary={{ label: 'Name it', onPress: () => openSheet('editAccount', { accountId: a.id }) }}
        />
      ))}

      {transferHints.map(({ outRow, inRow }) => (
        <ReviewCard
          key={`tr-${outRow.id}-${inRow.id}`}
          icon="arrow-left-right"
          title="Looks like a transfer?"
          body={`${formatRupees(outRow.amountMinor)} out of ${name(outRow.accountId)}, ${formatRupees(inRow.amountMinor)} into ${name(inRow.accountId)}`}
          secondary={{ label: 'No', onPress: () => dismissTransferHint(outRow.id, inRow.id) }}
          primary={{
            label: 'Yes, transfer',
            onPress: () => {
              linkPair(outRow.id, inRow.id);
              showToast('Linked as a transfer');
            },
          }}
        />
      ))}

      {cardBillHints.map((hint) => (
        <ReviewCard
          key={`cb-${hint.row.id}`}
          icon="credit-card"
          title="Card bill payment?"
          body={`${formatRupees(hint.row.amountMinor)} from ${name(hint.row.accountId)} paid ${name(hint.cardAccountId)}. A bill payment is not spending.`}
          secondary={{ label: 'No', onPress: () => clearCardBillHint(hint.dedupeKey) }}
          primary={{
            label: 'Yes, bill payment',
            onPress: () => {
              acceptCardBillHint(hint);
              showToast('Marked as a card bill payment');
            },
          }}
        />
      ))}
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
