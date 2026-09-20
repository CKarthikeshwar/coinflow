/**
 * FILE PURPOSE
 * ------------
 * The **Split sheet** (SPEC-UI-UX.md §6.17, UI-071 / UI-072): share a transaction between you and other
 * people. Two stages inside one sheet — **People** (who is in) then **Amounts** (how much each).
 *
 * WHERE IT FITS
 * -------------
 * Opened from the Confirm / Edit transaction sheets (`returnTo`) or from Transaction Details (`direct`).
 * Like the category picker it *replaces* its parent in the single `SheetHost` and returns to it — whatever
 * the user chose lives in `useSplitDraft` so it survives that round trip. **Done** commits the draft; the
 * parent's own Save (or, from Details, this sheet's Save) is what finally writes it (`persist-split.ts`).
 *
 * SENDING (phase 5)
 * ------------------
 * From Details the primary button is **Send requests**: the split is saved first, then each person is texted
 * (`services/splits/send-requests.ts`) and a per-person **result list** replaces the stage — *Sent*, *Sending
 * failed · Retry*, *Opened in Messages* (or *Open in Messages* when SEND_SMS was refused). A failure never loses
 * the split. From the Confirm / Edit sheets the split is written — and the requests sent — when *that* sheet is
 * saved. **Don't send now** turns sending off for this split; the button reads **Save split** when the device
 * cannot send at all.
 */

import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Colors, fontFamily, Radius, Spacing } from '@/constants/theme';
import { listPersons } from '@/db/repositories/persons';
import { getSplitForTransaction } from '@/db/repositories/splits';
import { getTransaction } from '@/db/repositories/transactions';
import { formatRupees } from '@/domain/format/money';
import { maskPhone, normalizePhone } from '@/domain/person';
import {
  computeSplitDraft,
  minorToRupeeText,
  parsePercent,
  parseRupeesToMinor,
  percentText,
  YOU_KEY,
  type SplitRow,
} from '@/domain/split-draft';
import { useAddSheetDraft, useSheetRegistry } from '@/stores';
import type { SheetName } from '@/stores/sheet-registry';
import { useSplitDraft, type DraftPerson } from '@/stores/split-draft';
import { useToast } from '@/stores/toast';

import { Button } from '@/ui/button';
import { Chip } from '@/ui/chip';
import { Icon } from '@/ui/icon';
import { SegmentedControl } from '@/ui/segmented-control';
import { TextField } from '@/ui/text-field';
import { ThemedText } from '@/ui/themed-text';

import {
  getContactsAccess,
  listContactCandidates,
  requestContactsAccess,
  type ContactCandidate,
  type ContactsAccess,
} from '@/services/contacts';
import { isSmsCaptureSupported } from '@/services/sms';
import { openInSmsApp, sendRequests, type SendReport } from '@/services/splits/send-requests';

import { persistSplitDraft } from './persist-split';

/** One line of the result list that replaces the Amounts stage after *Send requests*. */
type ResultRow = { shareId: string; name: string; state: 'sent' | 'failed' | 'opened_in_sms_app' | 'needs_messages' | 'sending' };

function rowsFrom(report: SendReport): ResultRow[] {
  return [
    ...report.results.map((r) => ({ shareId: r.shareId, name: r.personName, state: r.state })),
    ...report.fallback.map((f) => ({ shareId: f.shareId, name: f.personName, state: 'needs_messages' as const })),
  ];
}

const RESULT_LABEL: Record<ResultRow['state'], string> = {
  sent: 'Sent',
  failed: 'Sending failed',
  opened_in_sms_app: 'Opened in Messages',
  needs_messages: 'Not sent yet',
  sending: 'Sending…',
};

type SplitSheetParams = {
  /** Which sheet opened this one (Confirm / Edit); it is reopened, with the same params, on Done / Cancel. */
  returnTo?: SheetName;
  /** Details screen: no parent sheet — Save writes straight to the database. */
  direct?: boolean;
  transactionId?: string;
} & Record<string, unknown>;

function initial(name: string): string {
  return (name.trim()[0] ?? '?').toUpperCase();
}

function Avatar({ name, you = false }: { name: string; you?: boolean }) {
  return (
    <View style={[styles.avatar, you ? styles.avatarYou : null]}>
      <ThemedText type="label" themeColor={you ? 'primaryInk' : 'text'}>
        {initial(name)}
      </ThemedText>
    </View>
  );
}

/** An amount / percent cell that keeps its own text while focused so typing never fights the auto-recompute. */
function CellInput({
  value,
  onCommit,
  suffix,
  label,
}: {
  value: string;
  onCommit: (text: string) => void;
  suffix?: string;
  label: string;
}) {
  const [text, setText] = useState<string | null>(null); // non-null only while the user is typing
  return (
    <View style={styles.cell}>
      <TextInput
        accessibilityLabel={label}
        value={text ?? value}
        keyboardType="decimal-pad"
        onFocus={() => setText(value)}
        onChangeText={(t) => {
          setText(t);
          onCommit(t);
        }}
        onBlur={() => setText(null)}
        selectTextOnFocus
        style={styles.cellInput}
      />
      {suffix ? (
        <ThemedText type="label" themeColor="text3">
          {suffix}
        </ThemedText>
      ) : null}
    </View>
  );
}

export function SplitSheet() {
  const params = useSheetRegistry((s) => s.params) as SplitSheetParams;
  const open = useSheetRegistry((s) => s.open);
  const close = useSheetRegistry((s) => s.close);
  const draft = useSplitDraft();
  const direct = !!params.direct;

  // The transaction's amount + note: from the Details screen's transaction (direct) or the parent sheet's draft.
  const parentDraft = useAddSheetDraft.getState();
  const directTxn = direct && params.transactionId ? getTransaction(params.transactionId) : undefined;
  const totalMinor = direct ? (directTxn?.amountMinor ?? 0) : parentDraft.amountMinor;
  const noteLabel = (direct ? directTxn?.note : parentDraft.note)?.trim() ?? '';

  // Build the working state once when the sheet opens (and pick up an existing split when coming from Details).
  useEffect(() => {
    if (direct && params.transactionId) {
      const existing = getSplitForTransaction(params.transactionId);
      useSplitDraft.getState().seedExisting(
        existing
          ? {
              splitId: existing.split.id,
              shares: existing.shares.map((s) => ({
                key: s.personId,
                personId: s.personId,
                name: s.person.displayName,
                phone: s.person.phoneDisplay,
                contactRef: s.person.contactRef,
                source: s.person.source,
                amountMinor: s.amountMinor,
                waived: s.waivedAt != null,
              })),
            }
          : null,
      );
    }
    useSplitDraft.getState().begin(totalMinor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const backToParent = useCallback(() => {
    if (direct || !params.returnTo) {
      useSplitDraft.getState().reset();
      close();
    } else {
      open(params.returnTo, params);
    }
  }, [direct, params, open, close]);

  // Hardware back / swipe: leave the split sheet without touching what the parent already had committed.
  useEffect(() => {
    useSheetRegistry.getState().setOnRequestClose(backToParent);
    return () => useSheetRegistry.getState().setOnRequestClose(null);
  }, [backToParent]);

  const result = useMemo(
    () =>
      computeSplitDraft({
        totalMinor: draft.totalMinor,
        personKeys: draft.people.map((p) => p.key),
        mode: draft.mode,
        overrides: draft.overrides,
      }),
    [draft.totalMinor, draft.people, draft.mode, draft.overrides],
  );

  // Sending needs a device that can send; without one the button is plain "Save split".
  const canSend = isSmsCaptureSupported();
  const willSend = canSend && draft.sendOnSave;
  // After *Send requests* (Details): the split id being sent for, and the per-person result list.
  const [sendState, setSendState] = useState<{ splitId: string; rows: ResultRow[] } | null>(null);
  const [sending, setSending] = useState(false);

  const runSend = async (splitId: string, shareIds?: string[]) => {
    setSending(true);
    if (shareIds) {
      setSendState((s) => s && { ...s, rows: s.rows.map((r) => (shareIds.includes(r.shareId) ? { ...r, state: 'sending' as const } : r)) });
    }
    try {
      const report = await sendRequests(splitId, shareIds ? { shareIds, force: true } : {});
      setSendState((s) => {
        const next = rowsFrom(report);
        if (!s || !shareIds) return { splitId, rows: next };
        // a retry replaces just those lines
        return { ...s, rows: s.rows.map((r) => next.find((n) => n.shareId === r.shareId) ?? r) };
      });
    } catch {
      // The split is already saved; report the failure in place rather than losing the sheet.
      useToast.getState().show('Could not send the requests — retry from Details');
      setSendState((s) => s ?? { splitId, rows: [] });
    } finally {
      setSending(false);
    }
  };

  const done = async () => {
    if (!useSplitDraft.getState().commit()) return;
    if (direct && params.transactionId) {
      let splitId: string | null = null;
      try {
        const persisted = persistSplitDraft(params.transactionId, useSplitDraft.getState().pending(), {
          direction: directTxn?.direction,
        });
        if (persisted.kind === 'created' || persisted.kind === 'updated') splitId = persisted.splitId;
        useToast.getState().show('Split saved');
      } catch {
        useToast.getState().show('Could not save the split');
      }
      if (splitId && willSend) {
        // The split is safely saved; now send. The result list replaces the stage until the user presses Done.
        await runSend(splitId);
        return;
      }
      useSplitDraft.getState().reset();
      close();
    } else {
      backToParent();
    }
  };

  const finishAfterSend = () => {
    useSplitDraft.getState().reset();
    close();
  };

  const removeSplit = () => {
    useSplitDraft.getState().removeSplit();
    if (direct && params.transactionId) {
      try {
        persistSplitDraft(params.transactionId, useSplitDraft.getState().pending());
        useToast.getState().show('Split removed');
      } catch {
        useToast.getState().show('Could not remove the split');
      }
      useSplitDraft.getState().reset();
      close();
    } else {
      backToParent();
    }
  };

  const hasExistingOrCommitted = draft.existingSplitId !== null || draft.committed !== null;

  // The split is already saved by the time this shows — the sheet is now only reporting what happened.
  if (sendState) {
    return (
      <View style={styles.root}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <ThemedText type="title">Requests</ThemedText>
            <ThemedText type="caption" themeColor="text3">
              Split saved{noteLabel ? ` · ${noteLabel}` : ''}
            </ThemedText>
          </View>
        </View>
        <BottomSheetScrollView contentContainerStyle={styles.scroll}>
          {sendState.rows.map((row) => (
            <View key={row.shareId} style={styles.resultRow}>
              <Avatar name={row.name} />
              <View style={styles.personText}>
                <ThemedText type="body" themeColor="text">
                  {row.name}
                </ThemedText>
                <ThemedText type="caption" themeColor="text3">
                  {RESULT_LABEL[row.state]}
                </ThemedText>
              </View>
              {row.state === 'failed' ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Retry ${row.name}`}
                  disabled={sending}
                  onPress={() => runSend(sendState.splitId, [row.shareId])}
                >
                  <ThemedText type="label" themeColor="text">
                    Retry
                  </ThemedText>
                </Pressable>
              ) : null}
              {row.state === 'needs_messages' ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${row.name} in Messages`}
                  onPress={async () => {
                    const res = await openInSmsApp(sendState.splitId, row.shareId);
                    if (res) {
                      setSendState((s) => s && { ...s, rows: s.rows.map((r) => (r.shareId === row.shareId ? { ...r, state: res.state } : r)) });
                    }
                  }}
                >
                  <ThemedText type="label" themeColor="text">
                    Open in Messages
                  </ThemedText>
                </Pressable>
              ) : null}
            </View>
          ))}
          {sendState.rows.some((r) => r.state === 'needs_messages') ? (
            <ThemedText type="caption" themeColor="text3">
              CoinFlow can’t send texts itself without permission — open each one in Messages and press send.
            </ThemedText>
          ) : null}
        </BottomSheetScrollView>
        <View style={styles.footer}>
          <Button onPress={finishAfterSend} style={styles.fullWidth}>
            Done
          </Button>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        {draft.stage === 'amounts' ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => draft.goPeople()} style={styles.back}>
            <Icon name="arrow-left" size={18} />
          </Pressable>
        ) : null}
        <View style={styles.headerText}>
          <ThemedText type="title">{draft.stage === 'people' ? `Split ${formatRupees(totalMinor)}` : 'How much each?'}</ThemedText>
          <ThemedText type="caption" themeColor="text3">
            {draft.stage === 'people' ? (noteLabel ? `${noteLabel} · who’s in?` : 'Who’s in?') : `${formatRupees(totalMinor)}${noteLabel ? ` · ${noteLabel}` : ''}`}
          </ThemedText>
        </View>
        <View style={styles.dots}>
          <View style={[styles.dot, draft.stage === 'people' ? styles.dotOn : null]} />
          <View style={[styles.dot, draft.stage === 'amounts' ? styles.dotOn : null]} />
        </View>
        <Pressable accessibilityRole="button" onPress={backToParent}>
          <ThemedText type="label" themeColor="text2">
            Cancel
          </ThemedText>
        </Pressable>
      </View>

      {draft.stage === 'people' ? <PeopleStage /> : <AmountsStage rows={result.rows} />}

      {draft.stage === 'people' ? (
        <View style={styles.footer}>
          <Button variant={draft.people.length > 0 ? 'primary' : 'disabled'} onPress={() => draft.goAmounts()} style={styles.fullWidth}>
            Continue
          </Button>
        </View>
      ) : (
        <View style={styles.footer}>
          <View style={styles.footerLine}>
            <ThemedText type="label" themeColor="text3">
              Total
            </ThemedText>
            <ThemedText type="label" themeColor="text">
              {formatRupees(draft.totalMinor)}
            </ThemedText>
          </View>
          <View style={styles.footerLine}>
            <ThemedText type="label" themeColor="text3">
              {result.remainingMinor < 0 ? 'Over by' : 'Remaining'}
            </ThemedText>
            <ThemedText type="label" themeColor="text" style={result.remainingMinor !== 0 ? styles.bold : undefined}>
              {formatRupees(Math.abs(result.remainingMinor))}
            </ThemedText>
          </View>
          {result.zeroPeople.length > 0 ? (
            <ThemedText type="caption" themeColor="text3">
              Everyone you add needs to owe something.
            </ThemedText>
          ) : null}
          <Button variant={result.canSave && !sending ? 'primary' : 'disabled'} onPress={done} style={styles.fullWidth}>
            {direct ? (willSend ? 'Send requests' : 'Save split') : 'Done'}
          </Button>
          {canSend ? (
            <Pressable accessibilityRole="button" onPress={() => draft.setSendOnSave(!draft.sendOnSave)} style={styles.removeTap}>
              <ThemedText type="label" themeColor="text2">
                {draft.sendOnSave ? 'Don’t send now' : 'Send requests when saved'}
              </ThemedText>
            </Pressable>
          ) : null}
          {hasExistingOrCommitted ? (
            <Pressable accessibilityRole="button" onPress={removeSplit} style={styles.removeTap}>
              <ThemedText type="label" themeColor="text2">
                Remove split
              </ThemedText>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Stage 1 — People
// ---------------------------------------------------------------------------------------------------------------

function PeopleStage() {
  const people = useSplitDraft((s) => s.people);
  const togglePerson = useSplitDraft((s) => s.togglePerson);
  const removePerson = useSplitDraft((s) => s.removePerson);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);

  // Saved people are read once when the stage mounts — nothing changes them while the sheet is open.
  const [saved] = useState(() => listPersons());

  // Contacts (§6.17): optional and just-in-time — nothing is read until the user taps "Choose from contacts",
  // and everything else on this stage works without the permission.
  const [contactsAccess, setContactsAccess] = useState<ContactsAccess>('denied');
  const [contacts, setContacts] = useState<ContactCandidate[]>([]);
  useEffect(() => {
    let alive = true;
    // Already granted from an earlier split? Then show them without asking again.
    getContactsAccess().then(async (access) => {
      if (!alive) return;
      setContactsAccess(access);
      if (access === 'granted') {
        const list = await listContactCandidates();
        if (alive) setContacts(list);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const askForContacts = async () => {
    if (contactsAccess === 'blocked') {
      Linking.openSettings(); // the OS won't prompt again — IMP-042's rule
      return;
    }
    if (contactsAccess === 'unsupported') return;
    const access = await requestContactsAccess();
    setContactsAccess(access);
    if (access === 'granted') setContacts(await listContactCandidates());
  };
  const q = query.trim().toLowerCase();
  const visible = saved.filter(
    (p) => !q || p.displayName.toLowerCase().includes(q) || (p.phoneKey ?? '').includes(q.replace(/\D/g, '') || '§'),
  );
  const selectedKeys = new Set(people.map((p) => p.key));
  const visibleContacts = contacts.filter((c) => !q || c.name.toLowerCase().includes(q) || c.phoneKey.includes(q.replace(/D/g, '') || '§'));

  const asDraft = (p: (typeof saved)[number]): DraftPerson => ({
    key: p.id,
    personId: p.id,
    name: p.displayName,
    phone: p.phoneDisplay,
    contactRef: p.contactRef,
    source: p.source,
  });

  const addNumber = () => {
    const phone = normalizePhone(newPhone);
    if (!phone) {
      setPhoneError('Enter a 10-digit mobile number');
      return;
    }
    const existing = saved.find((p) => p.phoneKey === phone.phoneKey);
    const person: DraftPerson = existing
      ? asDraft(existing)
      : {
          key: `n:${phone.phoneKey}`,
          personId: null,
          name: newName.trim() || phone.phoneDisplay,
          phone: phone.phoneDisplay,
          contactRef: null,
          source: 'manual',
        };
    if (!selectedKeys.has(person.key)) togglePerson(person); // a duplicate number merges into one chip
    setNewName('');
    setNewPhone('');
    setPhoneError(null);
    setAdding(false);
  };

  return (
    <BottomSheetScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <TextField value={query} onChangeText={setQuery} placeholder="Search name or number" />

      {adding ? (
        <View style={styles.addForm}>
          <TextField value={newName} onChangeText={setNewName} placeholder="Name (optional)" />
          <TextField
            value={newPhone}
            onChangeText={(t) => {
              setNewPhone(t);
              setPhoneError(null);
            }}
            placeholder="10-digit mobile number"
            keyboardType="phone-pad"
            returnKeyType="done"
            onSubmitEditing={addNumber} // the keyboard's ✓ adds the person — the Add button can sit under the keyboard
          />
          {phoneError ? (
            <ThemedText type="caption" themeColor="text">
              {phoneError}
            </ThemedText>
          ) : null}
          <Button variant="ghost" onPress={addNumber} style={styles.fullWidth}>
            Add
          </Button>
        </View>
      ) : null}

      {people.length > 0 ? (
        <View style={styles.chips}>
          {people.map((p) => (
            <Chip key={p.key} label={p.name.split(' ')[0]} selected onRemove={() => removePerson(p.key)} />
          ))}
        </View>
      ) : null}

      {visible.length > 0 ? (
        <ThemedText type="caption" themeColor="text3" style={styles.sectionLabel}>
          SAVED PEOPLE
        </ThemedText>
      ) : null}
      {visible.map((p) => {
        const selected = selectedKeys.has(p.id);
        return (
          <Pressable
            key={p.id}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={p.displayName}
            onPress={() => togglePerson(asDraft(p))}
            style={styles.personRow}
          >
            <Avatar name={p.displayName} />
            <View style={styles.personText}>
              <ThemedText type="body" themeColor="text">
                {p.displayName}
              </ThemedText>
              {p.phoneKey ? (
                <ThemedText type="caption" themeColor="text3">
                  {maskPhone(p.phoneKey)}
                </ThemedText>
              ) : null}
            </View>
            <View style={[styles.check, selected ? styles.checkOn : null]}>
              {selected ? <Icon name="check" size={14} color="primaryInk" /> : null}
            </View>
          </Pressable>
        );
      })}

      <ThemedText type="caption" themeColor="text3" style={styles.sectionLabel}>
        CONTACTS
      </ThemedText>
      {contactsAccess === 'granted' ? (
        visibleContacts.length === 0 ? (
          <ThemedText type="caption" themeColor="text3">
            {contacts.length === 0 ? 'No contacts with a mobile number.' : 'No contact matches that search.'}
          </ThemedText>
        ) : (
          visibleContacts.map((c) => {
            const key = `n:${c.phoneKey}`;
            const selected = selectedKeys.has(key);
            return (
              <Pressable
                key={c.contactRef + c.phoneKey}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={c.name}
                onPress={() =>
                  togglePerson({ key, personId: null, name: c.name, phone: c.phoneDisplay, contactRef: c.contactRef, source: 'contact' })
                }
                style={styles.personRow}
              >
                <Avatar name={c.name} />
                <View style={styles.personText}>
                  <ThemedText type="body" themeColor="text">
                    {c.name}
                  </ThemedText>
                  <ThemedText type="caption" themeColor="text3">
                    {maskPhone(c.phoneKey)}
                  </ThemedText>
                </View>
                <View style={[styles.check, selected ? styles.checkOn : null]}>
                  {selected ? <Icon name="check" size={14} color="primaryInk" /> : null}
                </View>
              </Pressable>
            );
          })
        )
      ) : (
        <Pressable accessibilityRole="button" onPress={askForContacts} style={styles.personRow}>
          <View style={styles.dashedAvatar}>
            <Icon name="users" size={16} color="text3" />
          </View>
          <View style={styles.personText}>
            <ThemedText type="body" themeColor={contactsAccess === 'unsupported' ? 'text3' : 'text'}>
              Choose from contacts
            </ThemedText>
            <ThemedText type="caption" themeColor="text3">
              {contactsAccess === 'blocked'
                ? 'Contacts access is off — turn it on in Settings.'
                : contactsAccess === 'unsupported'
                  ? 'Not available on this device — add a number below.'
                  : 'Only used to pick who to ask — nothing is uploaded.'}
            </ThemedText>
          </View>
        </Pressable>
      )}

      <Pressable accessibilityRole="button" onPress={() => setAdding((v) => !v)} style={styles.personRow}>
        <View style={styles.dashedAvatar}>
          <Icon name="plus" size={16} />
        </View>
        <ThemedText type="body" themeColor="text" style={styles.personText}>
          Add a number
        </ThemedText>
      </Pressable>
    </BottomSheetScrollView>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Stage 2 — Amounts
// ---------------------------------------------------------------------------------------------------------------

function AmountsStage({ rows }: { rows: SplitRow[] }) {
  const people = useSplitDraft((s) => s.people);
  const mode = useSplitDraft((s) => s.mode);
  const setMode = useSplitDraft((s) => s.setMode);
  const setOverride = useSplitDraft((s) => s.setOverride);
  const resetEqual = useSplitDraft((s) => s.resetEqual);
  const anyCustom = rows.some((r) => r.custom);
  const nameOf = (key: string) => (key === YOU_KEY ? 'You' : (people.find((p) => p.key === key)?.name ?? key));

  const commitText = (key: string, text: string) => {
    if (text.trim() === '') return setOverride(key, null); // clearing a cell makes the row free again
    const value = mode === 'rupee' ? parseRupeesToMinor(text) : parsePercent(text);
    if (value !== null) setOverride(key, value);
  };

  return (
    <BottomSheetScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <SegmentedControl
        options={[
          { value: 'rupee', label: '₹ Amount' },
          { value: 'percent', label: '% Percent' },
        ]}
        value={mode}
        onChange={setMode}
      />
      <View style={styles.equalRow}>
        <ThemedText type="caption" themeColor="text3">
          {anyCustom ? 'CUSTOM SPLIT' : 'EQUAL SPLIT'}
        </ThemedText>
        {anyCustom ? (
          <Pressable accessibilityRole="button" onPress={resetEqual}>
            <ThemedText type="label" themeColor="text2">
              Equal
            </ThemedText>
          </Pressable>
        ) : null}
      </View>
      {rows.map((r) => (
        <View key={r.key} style={styles.amountRow}>
          <Avatar name={nameOf(r.key)} you={r.key === YOU_KEY} />
          <View style={styles.personText}>
            <ThemedText type="body" themeColor="text">
              {nameOf(r.key)}
            </ThemedText>
            {r.key === YOU_KEY ? (
              <ThemedText type="caption" themeColor="text3">
                your share
              </ThemedText>
            ) : null}
          </View>
          <CellInput
            key={mode} // remount on a ₹ ↔ % switch so no half-typed text from the other unit survives
            label={`${nameOf(r.key)} ${mode === 'rupee' ? 'amount' : 'percent'}`}
            value={mode === 'rupee' ? minorToRupeeText(r.amountMinor) : percentText(r.percent)}
            suffix={mode === 'rupee' ? undefined : '%'}
            onCommit={(t) => commitText(r.key, t)}
          />
        </View>
      ))}
    </BottomSheetScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingBottom: Spacing.two },
  back: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.dark.surface2, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1 },
  dots: { flexDirection: 'row', gap: 5 },
  dot: { width: 18, height: 4, borderRadius: 2, backgroundColor: Colors.dark.surface3 },
  dotOn: { backgroundColor: Colors.dark.primary },
  scroll: { paddingHorizontal: Spacing.three, gap: Spacing.two, paddingBottom: Spacing.four },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  sectionLabel: { marginTop: Spacing.two },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, minHeight: 56 },
  personText: { flex: 1 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.dark.surface3, alignItems: 'center', justifyContent: 'center' },
  avatarYou: { backgroundColor: Colors.dark.primary },
  dashedAvatar: {
    width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.dark.hairline,
    alignItems: 'center', justifyContent: 'center',
  },
  check: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.dark.text3, alignItems: 'center', justifyContent: 'center',
  },
  checkOn: { backgroundColor: Colors.dark.primary, borderColor: Colors.dark.primary },
  addForm: { gap: Spacing.two, paddingBottom: Spacing.two },
  equalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.two },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, minHeight: 58 },
  cell: {
    flexDirection: 'row', alignItems: 'center', minWidth: 96, minHeight: 40, paddingHorizontal: Spacing.three,
    borderRadius: Radius.control, backgroundColor: Colors.dark.surface2, gap: Spacing.one,
  },
  cellInput: { flex: 1, minWidth: 60, color: Colors.dark.text, fontFamily: fontFamily('display', 700), fontSize: 15, textAlign: 'right', paddingVertical: 0 },
  footer: {
    paddingHorizontal: Spacing.three, paddingVertical: Spacing.three, gap: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth, borderColor: Colors.dark.hairline,
  },
  footerLine: { flexDirection: 'row', justifyContent: 'space-between' },
  bold: { fontWeight: '700' },
  fullWidth: { width: '100%' },
  removeTap: { alignItems: 'center', paddingVertical: Spacing.one },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, minHeight: 58 },
});
