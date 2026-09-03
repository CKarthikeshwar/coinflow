/**
 * `BalanceHero` — SPEC-UI-UX.md §6.2 / SPEC-implementation.md §29.4. "Total balance" label +
 * the large running-balance figure (D2, §26.2 — all recorded income − all recorded expenses,
 * never an SMS "Avl Bal"). The `₹` mark is de-emphasised (small, muted, ref `1.png`); a
 * negative balance shows a leading `−` (§27.5 / IMP-010).
 */

import { StyleSheet } from 'react-native';

import { Spacing } from '@/constants/theme';
import { formatMoney } from '@/domain/format/money';

import { Card } from '@/ui/card';
import { ThemedText } from '@/ui/themed-text';

export type BalanceHeroProps = { balanceMinor: number };

export function BalanceHero({ balanceMinor }: BalanceHeroProps) {
  // Bare digits only — the leading `−` and the `₹` are rendered separately below so each can
  // carry its own style (the `₹` de-emphasised, the figure itself the hero).
  const digits = formatMoney(balanceMinor, { sign: 'none', withCurrency: false });
  const negative = balanceMinor < 0;

  return (
    <Card elevation="card" style={styles.hero}>
      <ThemedText type="label" themeColor="text2">
        Total balance
      </ThemedText>
      <ThemedText type="balanceHero" style={styles.figure}>
        {negative ? <ThemedText type="balanceHero">−</ThemedText> : null}
        <ThemedText type="balanceHero" themeColor="text3">
          ₹
        </ThemedText>
        {digits}
      </ThemedText>
    </Card>
  );
}

const styles = StyleSheet.create({
  hero: { gap: Spacing.one },
  figure: { marginTop: Spacing.half },
});
