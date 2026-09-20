/**
 * FILE PURPOSE
 * ------------
 * The **Splits** page (SPEC-UI-UX.md §6.19, UI-076): everything to do with shared money in one place, in three
 * segments — **Owed to you** (open shares, grouped by person), **You owe** (accepted incoming requests, grouped
 * by requester) and **Requests** (received, not yet decided / accepted).
 *
 * WHERE IT FITS
 * -------------
 * Pushed from Home's "Owed to you" row, and by `coinflow://splits[?tab=requests]` (expo-router resolves the
 * scheme link to this route). Reads `useSplitsOverview` (live). Settling opens the Merge sheet
 * (`features/splits/merge-sheet.tsx`); tapping an owed row opens that transaction's Details.
 *
 * REQUESTS (phase 5)
 * ------------------
 * An *Unattended* request has **Accept** (it becomes something you owe) and **Reject** (discarded silently — the
 * sender is never told); both are one tap with an Undo snackbar, and both also clear the request's notification.
 * In a dev build the **You owe** segment offers a sample request so that side can be tried without a second phone.
 */

import { router, useLocalSearchParams } from 'expo-router';
import { format } from 'date-fns';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { useSplitsOverview } from '@/db/repositories/split-hooks';
import { undoDecision, type RequestView } from '@/db/repositories/split-requests';
import type { OwedItem } from '@/db/repositories/splits';
import { formatRupees } from '@/domain/format/money';
import { maskPhone } from '@/domain/person';
import { handleAcceptRequest, handleRejectRequest } from '@/services/notifications/respond-split';
import { useSheetRegistry } from '@/stores';
import { useToast } from '@/stores/toast';

import { addSampleRequest } from '@/features/splits/dev-seed';
import { StatusChip } from '@/features/splits/status-chip';

import { Button } from '@/ui/button';
import { EmptyState } from '@/ui/empty-state';
import { SegmentedControl } from '@/ui/segmented-control';
import { Skeleton } from '@/ui/skeleton';
import { ThemedText } from '@/ui/themed-text';
import { TopBar } from '@/ui/top-bar';

type Tab = 'owed' | 'owe' | 'requests';

function initialTab(param: string | undefined): Tab {
  return param === 'requests' ? 'requests' : param === 'owe' ? 'owe' : 'owed';
}

export default function SplitsScreen() {
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(initialTab(tabParam));
  const [showSettled, setShowSettled] = useState<Record<Tab, boolean>>({ owed: false, owe: false, requests: false });
  const o = useSplitsOverview();

  const toggleSettled = () => setShowSettled((s) => ({ ...s, [tab]: !s[tab] }));

  return (
    <SafeAreaView style={styles.screen}>
      <TopBar title="Splits" onBack={() => router.back()} />
      <View style={styles.segments}>
        <SegmentedControl
          options={[
            { value: 'owed', label: 'Owed to you' },
            { value: 'owe', label: 'You owe' },
            { value: 'requests', label: o.unattended.length > 0 ? `Requests · ${o.unattended.length}` : 'Requests' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>

      {!o.ready ? (
        <Skeleton layout="transaction-list" />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {tab === 'owed' ? (
            <OwedSegment groups={o.owed} settled={o.owedSettled} totalMinor={o.owedTotalMinor} showSettled={showSettled.owed} onToggleSettled={toggleSettled} />
          ) : null}
          {tab === 'owe' ? (
            <YouOweSegment open={o.youOwe} settled={o.youOweSettled} totalMinor={o.youOweTotalMinor} showSettled={showSettled.owe} onToggleSettled={toggleSettled} />
          ) : null}
          {tab === 'requests' ? <RequestsSegment unattended={o.unattended} accepted={o.accepted} /> : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function dateOf(ms: number): string {
  return format(new Date(ms), 'd MMM');
}

function SettledToggle({ count, shown, onPress }: { count: number; shown: boolean; onPress: () => void }) {
  if (count === 0) return null;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.settledToggle}>
      <ThemedText type="label" themeColor="text2">
        {shown ? 'Hide settled' : `Show settled (${count})`}
      </ThemedText>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Owed to you
// ---------------------------------------------------------------------------------------------------------------

function OwedRow({ item }: { item: OwedItem }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.personName}, ${item.label || 'shared expense'}, ${formatRupees(item.remainingMinor || item.amountMinor)}`}
      onPress={() => router.push(`/transaction/${item.transactionId}`)}
      style={styles.row}
    >
      <View style={styles.rowText}>
        <ThemedText type="body" themeColor="text">
          {item.label || 'Shared expense'}
        </ThemedText>
        <ThemedText type="caption" themeColor="text3">
          {dateOf(item.occurredAt)}
        </ThemedText>
      </View>
      <View style={styles.amountCol}>
        <ThemedText type="body" themeColor="text">
          {formatRupees(item.remainingMinor > 0 ? item.remainingMinor : item.amountMinor)}
        </ThemedText>
        <StatusChip status={item} />
      </View>
    </Pressable>
  );
}

function OwedSegment({
  groups,
  settled,
  totalMinor,
  showSettled,
  onToggleSettled,
}: {
  groups: ReturnType<typeof useSplitsOverview>['owed'];
  settled: OwedItem[];
  totalMinor: number;
  showSettled: boolean;
  onToggleSettled: () => void;
}) {
  const openSheet = useSheetRegistry((s) => s.open);
  if (groups.length === 0 && settled.length === 0) {
    return <EmptyState glyph="users" line="Nobody owes you anything." />;
  }
  return (
    <View>
      {groups.length > 0 ? (
        <ThemedText type="label" themeColor="text3" style={styles.total}>
          {formatRupees(totalMinor)} owed to you
        </ThemedText>
      ) : (
        <ThemedText type="body" themeColor="text3" style={styles.total}>
          Nobody owes you anything.
        </ThemedText>
      )}
      {groups.map((g) => (
        <View key={g.personId} style={styles.group}>
          <View style={styles.groupHeader}>
            <ThemedText type="title" style={styles.groupName}>
              {g.personName}
            </ThemedText>
            <ThemedText type="label" themeColor="text2">
              {formatRupees(g.totalMinor)} owed
            </ThemedText>
            <Pressable accessibilityRole="button" accessibilityLabel={`Mark all paid for ${g.personName}`} onPress={() => openSheet('merge', { personId: g.personId })} style={styles.groupAction}>
              <ThemedText type="label" themeColor="text">
                Mark all paid…
              </ThemedText>
            </Pressable>
          </View>
          {g.items.map((i) => (
            <OwedRow key={i.shareId} item={i} />
          ))}
        </View>
      ))}
      <SettledToggle count={settled.length} shown={showSettled} onPress={onToggleSettled} />
      {showSettled
        ? settled.map((i) => (
            <View key={i.shareId} style={styles.settledRow}>
              <ThemedText type="caption" themeColor="text3" style={styles.settledName}>
                {i.personName}
              </ThemedText>
              <OwedRow item={i} />
            </View>
          ))
        : null}
    </View>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// You owe
// ---------------------------------------------------------------------------------------------------------------

function RequestRow({ r, mergeable }: { r: RequestView; mergeable: boolean }) {
  const openSheet = useSheetRegistry((s) => s.open);
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <ThemedText type="body" themeColor="text">
          {r.forNote || 'Split request'}
        </ThemedText>
        <ThemedText type="caption" themeColor="text3">
          {dateOf(r.receivedAt)}
        </ThemedText>
      </View>
      <View style={styles.amountCol}>
        <ThemedText type="body" themeColor="text">
          {formatRupees(r.remainingMinor > 0 ? r.remainingMinor : r.amountMinor)}
        </ThemedText>
        <StatusChip status={r} />
      </View>
      {mergeable ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Merge ${r.fromLabel}'s request`} onPress={() => openSheet('merge', { requestId: r.id })} style={styles.mergeButton}>
          <ThemedText type="label" themeColor="text">
            Merge…
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

function groupRequests(rows: readonly RequestView[]): { key: string; name: string; totalMinor: number; items: RequestView[] }[] {
  const out: { key: string; name: string; totalMinor: number; items: RequestView[] }[] = [];
  for (const r of rows) {
    const g = out.find((x) => x.key === r.fromPhoneKey);
    if (g) {
      g.items.push(r);
      g.totalMinor += r.remainingMinor;
    } else out.push({ key: r.fromPhoneKey, name: r.fromLabel, totalMinor: r.remainingMinor, items: [r] });
  }
  return out.sort((a, b) => b.totalMinor - a.totalMinor || a.name.localeCompare(b.name));
}

function YouOweSegment({
  open,
  settled,
  totalMinor,
  showSettled,
  onToggleSettled,
}: {
  open: RequestView[];
  settled: RequestView[];
  totalMinor: number;
  showSettled: boolean;
  onToggleSettled: () => void;
}) {
  const groups = groupRequests(open);
  const empty = open.length === 0 && settled.length === 0;
  return (
    <View>
      {empty ? (
        <EmptyState glyph="users" line="You don’t owe anyone." />
      ) : (
        <>
          <ThemedText type="label" themeColor="text3" style={styles.total}>
            {open.length > 0 ? `${formatRupees(totalMinor)} you owe` : 'You don’t owe anyone.'}
          </ThemedText>
          {groups.map((g) => (
            <View key={g.key} style={styles.group}>
              <View style={styles.groupHeader}>
                <ThemedText type="title" style={styles.groupName}>
                  {g.name}
                </ThemedText>
                <ThemedText type="label" themeColor="text2">
                  {formatRupees(g.totalMinor)} owed
                </ThemedText>
              </View>
              {g.items.map((r) => (
                <RequestRow key={r.id} r={r} mergeable />
              ))}
            </View>
          ))}
          <SettledToggle count={settled.length} shown={showSettled} onPress={onToggleSettled} />
          {showSettled
            ? settled.map((r) => (
                <View key={r.id} style={styles.settledRow}>
                  <ThemedText type="caption" themeColor="text3" style={styles.settledName}>
                    {r.fromLabel}
                  </ThemedText>
                  <RequestRow r={r} mergeable={false} />
                </View>
              ))
            : null}
        </>
      )}
      {__DEV__ ? (
        <View style={styles.dev}>
          <Button
            variant="ghost"
            onPress={() => {
              if (!addSampleRequest()) useToast.getState().show('Sample request refused (rate limit)');
            }}
          >
            Add sample request (dev build only)
          </Button>
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------------------------------------------

/** Accept / Reject from the list: one tap, with Undo (which puts it back to Unattended). */
async function decide(request: RequestView, decision: 'accept' | 'reject') {
  const result = decision === 'accept' ? await handleAcceptRequest(request.id) : await handleRejectRequest(request.id);
  if (result.outcome === 'noop') return; // already decided elsewhere (e.g. from the notification)
  useToast.getState().show(
    decision === 'accept' ? `Accepted — ${request.fromLabel}’s request is in You owe` : 'Request rejected',
    { label: 'Undo', onPress: () => { undoDecision(request.id); useToast.getState().clear(); } },
    5000,
  );
}

function RequestsSegment({ unattended, accepted }: { unattended: RequestView[]; accepted: RequestView[] }) {
  if (unattended.length === 0 && accepted.length === 0) {
    return <EmptyState glyph="users" line="No requests." />;
  }
  const block = (title: string, rows: RequestView[], actionable: boolean) =>
    rows.length === 0 ? null : (
      <View style={styles.group}>
        <ThemedText type="caption" themeColor="text3" style={styles.blockTitle}>
          {title}
        </ThemedText>
        {rows.map((r) => (
          <View key={r.id} style={styles.requestRow}>
            <View style={styles.requestTop}>
              <View style={styles.rowText}>
                <ThemedText type="body" themeColor="text">
                  {r.fromLabel}
                </ThemedText>
                <ThemedText type="caption" themeColor="text3">
                  {[r.forNote, dateOf(r.receivedAt), maskPhone(r.fromPhoneKey), r.knownPerson ? '' : 'not in your people'].filter(Boolean).join(' · ')}
                </ThemedText>
              </View>
              <ThemedText type="body" themeColor="text">
                {formatRupees(r.amountMinor)}
              </ThemedText>
            </View>
            {actionable ? (
              <View style={styles.requestActions}>
                <Pressable accessibilityRole="button" accessibilityLabel={`Reject ${r.fromLabel}'s request`} onPress={() => decide(r, 'reject')} style={styles.actionButton}>
                  <ThemedText type="label" themeColor="text2">
                    Reject
                  </ThemedText>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={`Accept ${r.fromLabel}'s request`} onPress={() => decide(r, 'accept')} style={[styles.actionButton, styles.acceptButton]}>
                  <ThemedText type="label" themeColor="primaryInk">
                    Accept
                  </ThemedText>
                </Pressable>
              </View>
            ) : null}
          </View>
        ))}
      </View>
    );
  return (
    <View>
      {block('UNATTENDED', unattended, true)}
      {block('ACCEPTED', accepted, false)}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  segments: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.two },
  scroll: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.five, flexGrow: 1 },
  total: { paddingVertical: Spacing.two },
  group: { marginTop: Spacing.two },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two },
  groupName: { flex: 1 },
  groupAction: { minHeight: 44, justifyContent: 'center', paddingLeft: Spacing.one },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 60,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.dark.hairline,
  },
  rowText: { flex: 1 },
  amountCol: { alignItems: 'flex-end', gap: 4, paddingVertical: Spacing.two },
  mergeButton: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.control,
    backgroundColor: Colors.dark.surface2,
  },
  settledToggle: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.two },
  settledRow: { opacity: 0.7 },
  settledName: { marginTop: Spacing.two },
  blockTitle: { paddingVertical: Spacing.one },
  requestRow: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: Colors.dark.hairline, paddingVertical: Spacing.two, gap: Spacing.two },
  requestTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  requestActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.two },
  actionButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: Spacing.four, borderRadius: Radius.control, backgroundColor: Colors.dark.surface2 },
  acceptButton: { backgroundColor: Colors.dark.primary },
  dev: { marginTop: Spacing.four },
});
