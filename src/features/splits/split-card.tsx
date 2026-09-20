/**
 * FILE PURPOSE
 * ------------
 * The **Split card** on Transaction Details (SPEC-UI-UX.md §6.8, UI-074): who shares this transaction, how
 * much each owes, and where each stands — *Pending*, *Partly paid ₹100*, *Settled* or *Waived* — plus the
 * request line (*Not sent*, *Requested by SMS*, *Sending failed*, *Opened in Messages*).
 *
 * Pure presentation: it renders a `SplitView` and calls back for the actions, so the Details screen owns
 * every side effect. Tapping a person expands their actions (Waive / Restore); the card footer offers
 * **Edit split** and **Remove split**.
 */

import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';
import type { ShareView, SplitView } from '@/db/repositories/splits';
import { formatRupees } from '@/domain/format/money';
import { maskPhone } from '@/domain/person';

import { Icon } from '@/ui/icon';
import { ThemedText } from '@/ui/themed-text';

export type SplitCardProps = {
  view: SplitView;
  onEditSplit: () => void;
  onRemoveSplit: () => void;
  onWaive: (shareId: string) => void;
  onRestore: (shareId: string) => void;
  /** V2 phase 5 — send / retry / resend this person's request SMS (absent where sending isn't possible). */
  onSendRequest?: (shareId: string) => void;
  /** The share a request is being sent for right now. */
  sendingShareId?: string | null;
};

/** What the send action on an expanded row says, given how the last request went. */
export function sendActionLabel(share: Pick<ShareView, 'requestState' | 'changedSinceRequested'>): string {
  if (share.requestState === 'failed') return 'Retry request';
  if (share.requestState === 'not_sent') return 'Send request';
  return share.changedSinceRequested ? 'Resend — the amount changed' : 'Send a reminder';
}

const REQUEST_LINE: Record<ShareView['requestState'], string> = {
  not_sent: 'Not sent',
  sent: 'Requested by SMS',
  failed: 'Sending failed',
  opened_in_sms_app: 'Opened in Messages',
};

/** The status chip's wording for a share (UI-074). */
export function shareChipLabel(share: Pick<ShareView, 'state' | 'settledMinor' | 'amountMinor'>): string {
  switch (share.state) {
    case 'settled':
      return 'Settled';
    case 'partial':
      return `Partly paid ${formatRupees(share.settledMinor)}`;
    case 'waived':
      return 'Waived';
    default:
      return 'Pending';
  }
}

function paidSummary(view: SplitView): string {
  const counting = view.shares.filter((s) => s.state !== 'waived');
  const paid = counting.filter((s) => s.state === 'settled').length;
  return counting.length === 0 ? '' : `${paid} of ${counting.length} paid`;
}

export function SplitCard({ view, onEditSplit, onRemoveSplit, onWaive, onRestore, onSendRequest, sendingShareId }: SplitCardProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Icon name="users" size={16} />
        <ThemedText type="label" themeColor="text" style={styles.headerTitle}>
          Split
        </ThemedText>
        <ThemedText type="caption" themeColor="text3">
          {paidSummary(view)}
        </ThemedText>
      </View>

      <View style={styles.row}>
        <View style={[styles.avatar, styles.avatarYou]}>
          <ThemedText type="label" themeColor="primaryInk">
            Y
          </ThemedText>
        </View>
        <View style={styles.rowText}>
          <ThemedText type="body" themeColor="text">
            You
          </ThemedText>
          <ThemedText type="caption" themeColor="text3">
            your share
          </ThemedText>
        </View>
        <ThemedText type="body" themeColor="text">
          {formatRupees(view.effectiveMinor)}
        </ThemedText>
      </View>

      {view.shares.map((s) => {
        const expanded = expandedId === s.id;
        const canWaive = s.state === 'pending' || s.state === 'partial';
        return (
          <View key={s.id}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${s.person.displayName}, ${shareChipLabel(s)}`}
              accessibilityState={{ expanded }}
              onPress={() => setExpandedId(expanded ? null : s.id)}
              style={styles.row}
            >
              <View style={styles.avatar}>
                <ThemedText type="label" themeColor="text">
                  {(s.person.displayName.trim()[0] ?? '?').toUpperCase()}
                </ThemedText>
              </View>
              <View style={styles.rowText}>
                <ThemedText type="body" themeColor="text">
                  {s.person.displayName}
                </ThemedText>
                <ThemedText type="caption" themeColor="text3">
                  {REQUEST_LINE[s.requestState]}
                  {s.changedSinceRequested ? ' · changed since requested' : ''}
                  {s.person.phoneKey ? ` · ${maskPhone(s.person.phoneKey)}` : ''}
                </ThemedText>
              </View>
              <View style={styles.amountCol}>
                <ThemedText type="body" themeColor="text">
                  {formatRupees(s.amountMinor)}
                </ThemedText>
                <View style={[styles.chip, s.state === 'settled' ? styles.chipSettled : s.state === 'pending' || s.state === 'waived' ? styles.chipQuiet : styles.chipPartial]}>
                  <ThemedText type="caption" themeColor={s.state === 'settled' ? 'primaryInk' : s.state === 'partial' ? 'text' : 'text2'}>
                    {shareChipLabel(s)}
                  </ThemedText>
                </View>
              </View>
            </Pressable>
            {expanded ? (
              <View style={styles.actions}>
                {onSendRequest && canWaive && s.person.phoneDisplay ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${sendActionLabel(s)} for ${s.person.displayName}`}
                    disabled={sendingShareId === s.id}
                    onPress={() => onSendRequest(s.id)}
                  >
                    <ThemedText type="label" themeColor="text">
                      {sendingShareId === s.id ? 'Sending…' : sendActionLabel(s)}
                    </ThemedText>
                  </Pressable>
                ) : null}
                {s.state === 'waived' ? (
                  <Pressable accessibilityRole="button" onPress={() => onRestore(s.id)}>
                    <ThemedText type="label" themeColor="text">
                      Restore this share
                    </ThemedText>
                  </Pressable>
                ) : canWaive ? (
                  <Pressable accessibilityRole="button" onPress={() => onWaive(s.id)}>
                    <ThemedText type="label" themeColor="text">
                      Waive — I’ll cover it
                    </ThemedText>
                  </Pressable>
                ) : (
                  <ThemedText type="caption" themeColor="text3">
                    Already paid in full.
                  </ThemedText>
                )}
              </View>
            ) : null}
          </View>
        );
      })}

      <View style={styles.footer}>
        <Pressable accessibilityRole="button" onPress={onEditSplit} style={styles.footerButton}>
          <ThemedText type="label" themeColor="text">
            Edit split
          </ThemedText>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onRemoveSplit} style={styles.footerButton}>
          <ThemedText type="label" themeColor="text3">
            Remove split
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: Spacing.three,
    borderRadius: Radius.card,
    backgroundColor: Colors.dark.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.dark.hairline,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.dark.hairline,
  },
  headerTitle: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    minHeight: 60,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.dark.hairline,
  },
  rowText: { flex: 1 },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.dark.surface3, alignItems: 'center', justifyContent: 'center' },
  avatarYou: { backgroundColor: Colors.dark.primary },
  amountCol: { alignItems: 'flex-end', gap: 4 },
  chip: { borderRadius: Radius.pill, paddingHorizontal: Spacing.two, paddingVertical: 2, borderWidth: 1, borderColor: 'transparent' },
  chipSettled: { backgroundColor: Colors.dark.primary },
  chipPartial: { borderColor: Colors.dark.text },
  chipQuiet: { borderColor: Colors.dark.hairline },
  actions: { paddingHorizontal: Spacing.three + 34 + Spacing.three, paddingBottom: Spacing.three, paddingTop: Spacing.one, gap: Spacing.two },
  footer: { flexDirection: 'row', justifyContent: 'space-between' },
  footerButton: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 46 },
});
