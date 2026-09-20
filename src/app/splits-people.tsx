/**
 * FILE PURPOSE
 * ------------
 * **Settings › Splits & people** (SPEC-UI-UX.md §6.19 entry / UI-080, SPEC-implementation.md §43.4): the one place
 * that gathers everything about split requests — contacts access, the name your requests are signed with, which
 * SIM they go out on, and the people you have split with.
 *
 * WHERE IT FITS
 * -------------
 * Pushed from the Settings tab. `splitYourName` is an `app_setting` read by `send-requests.ts` when it builds the
 * SMS. Contacts access is the same just-in-time permission the Split sheet asks for; this screen only *shows* it
 * and offers to grant (or, once blocked, to open system settings).
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * --------------------------------
 * Requests always go out on the phone's **default SMS SIM** (D41) — the row states that rather than offering a
 * choice, because picking a non-default SIM is not supported in v2.0. A person who is still used by a split
 * cannot be deleted (their share would lose its owner); the row says so instead of hiding the action.
 */

import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Spacing } from '@/constants/theme';
import { deletePersonIfUnused, listPersons, renamePerson } from '@/db/repositories/persons';
import { getSetting, setSetting } from '@/db/repositories/settings';
import type { Person } from '@/db/schema';
import { maskPhone } from '@/domain/person';
import { sanitizeName } from '@/domain/split-message';
import { getContactsAccess, requestContactsAccess, type ContactsAccess } from '@/services/contacts';
import { getSendSmsPermission, isSmsCaptureSupported } from '@/services/sms';
import { useToast } from '@/stores/toast';

import { Icon } from '@/ui/icon';
import { TextField } from '@/ui/text-field';
import { ThemedText } from '@/ui/themed-text';
import { TopBar } from '@/ui/top-bar';

const CONTACTS_LABEL: Record<ContactsAccess, string> = {
  granted: 'On — you can pick people from contacts',
  denied: 'Off — tap to allow picking people from contacts',
  blocked: 'Off — turn it on in system settings',
  unsupported: 'Not available on this device',
};

export default function SplitsPeopleScreen() {
  // Both are plain synchronous reads, so they seed state directly rather than through an effect.
  const [people, setPeople] = useState<Person[]>(() => listPersons());
  const [name, setName] = useState(() => getSetting<string>('splitYourName', ''));
  const [contacts, setContacts] = useState<ContactsAccess>('denied');
  const [canSend, setCanSend] = useState(false);
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);

  useEffect(() => {
    let alive = true;
    getContactsAccess().then((a) => alive && setContacts(a));
    getSendSmsPermission().then((p) => alive && setCanSend(p.granted));
    return () => {
      alive = false;
    };
  }, []);

  const saveName = (next: string) => {
    setName(next);
    setSetting('splitYourName', sanitizeName(next)); // the SMS is GSM-7 only and ≤ 20 chars
  };

  const askForContacts = async () => {
    if (contacts === 'granted' || contacts === 'unsupported') return;
    if (contacts === 'blocked') {
      Linking.openSettings(); // the OS will not prompt again — IMP-042 rule
      return;
    }
    setContacts(await requestContactsAccess());
  };

  const commitRename = () => {
    if (!editing) return;
    const next = editing.value.trim();
    if (next) renamePerson(editing.id, next);
    setEditing(null);
    setPeople(listPersons());
  };

  const remove = (person: Person) => {
    if (deletePersonIfUnused(person.id)) {
      setPeople(listPersons());
      useToast.getState().show(`${person.displayName} removed`);
    } else {
      useToast.getState().show('They’re part of a split — remove that split first');
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <TopBar title="Splits & people" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.body}>
        <ThemedText type="caption" themeColor="text3" style={styles.sectionLabel}>
          YOUR NAME IN REQUESTS
        </ThemedText>
        <TextField value={name} onChangeText={saveName} placeholder="e.g. Karthik (optional)" maxLength={20} />
        <ThemedText type="caption" themeColor="text3">
          Requests read “{sanitizeName(name) || 'Please pay'} {sanitizeName(name) ? 'requests ' : ''}Rs 400.00 … (CoinFlow
          split)”. Leave it empty to stay unnamed.
        </ThemedText>

        <ThemedText type="caption" themeColor="text3" style={styles.sectionLabel}>
          SENDING
        </ThemedText>
        <Pressable accessibilityRole="button" accessibilityLabel="Contacts access" onPress={askForContacts} style={styles.row}>
          <View style={styles.tile}>
            <Icon name="users" size={18} />
          </View>
          <View style={styles.rowText}>
            <ThemedText type="body" themeColor="text">
              Contacts access
            </ThemedText>
            <ThemedText type="caption" themeColor="text3">
              {CONTACTS_LABEL[contacts]}
            </ThemedText>
          </View>
        </Pressable>
        <View style={styles.row}>
          <View style={styles.tile}>
            <Icon name="shield-check" size={18} />
          </View>
          <View style={styles.rowText}>
            <ThemedText type="body" themeColor="text">
              Sending requests
            </ThemedText>
            <ThemedText type="caption" themeColor="text3">
              {!isSmsCaptureSupported()
                ? 'Not available on this device'
                : canSend
                  ? 'Allowed — sent as a normal SMS on your default SIM'
                  : 'Asked for the first time you send a request'}
            </ThemedText>
          </View>
        </View>
        <ThemedText type="caption" themeColor="text3">
          A request is a plain text message, so it costs whatever an SMS costs and works without data. Replies only
          reach CoinFlow if the other phone sends them as SMS rather than a chat message.
        </ThemedText>

        <ThemedText type="caption" themeColor="text3" style={styles.sectionLabel}>
          SAVED PEOPLE
        </ThemedText>
        {people.length === 0 ? (
          <ThemedText type="body" themeColor="text3">
            Nobody yet — people you split with are remembered here.
          </ThemedText>
        ) : (
          people.map((person) => (
            <View key={person.id} style={styles.row}>
              <View style={styles.tile}>
                <ThemedText type="label" themeColor="text">
                  {(person.displayName.trim()[0] ?? '?').toUpperCase()}
                </ThemedText>
              </View>
              {editing?.id === person.id ? (
                <View style={styles.rowText}>
                  <TextField
                    value={editing.value}
                    onChangeText={(value) => setEditing({ id: person.id, value })}
                    placeholder="Name"
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={commitRename}
                    onBlur={commitRename}
                  />
                </View>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Rename ${person.displayName}`}
                  onPress={() => setEditing({ id: person.id, value: person.displayName })}
                  style={styles.rowText}
                >
                  <ThemedText type="body" themeColor="text">
                    {person.displayName}
                  </ThemedText>
                  <ThemedText type="caption" themeColor="text3">
                    {person.phoneKey ? maskPhone(person.phoneKey) : 'No number'}
                  </ThemedText>
                </Pressable>
              )}
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${person.displayName}`} onPress={() => remove(person)}>
                <ThemedText type="label" themeColor="text3">
                  Remove
                </ThemedText>
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.five, gap: Spacing.two },
  sectionLabel: { marginTop: Spacing.four },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 56 },
  rowText: { flex: 1 },
  tile: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: Colors.dark.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
