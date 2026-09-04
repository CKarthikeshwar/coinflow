/**
 * Root crash recovery screen (§32.3, E20) — "Option B" from the design-prototype review
 * (`design-prototype/01-midnight/recovery-screens.html`). Purely presentational; owned by
 * `RootErrorBoundary`, which supplies the already-redacted exception name and, when crash
 * reporting is armed, the real Sentry event id.
 *
 * "Technical details" only ever shows a Ref line when `eventId` is non-null — never a
 * placeholder. If reporting is off, the row still shows the exception name (harmless, already
 * scrubbed) but no Ref, since nothing was actually sent anywhere to reference.
 */

import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Radius, Spacing } from '@/constants/theme';

import { AppBackground } from '@/ui/app-background';
import { Button } from '@/ui/button';
import { Icon } from '@/ui/icon';
import { ThemedText } from '@/ui/themed-text';

export type RecoveryScreenProps = {
  name: string;
  eventId: string | null;
  onReload: () => void;
};

export function RecoveryScreen({ name, eventId, onReload }: RecoveryScreenProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  const handleCopy = () => {
    const text = eventId ? `${name} · boundary\nRef ${eventId}` : `${name} · boundary`;
    Clipboard.setStringAsync(text);
  };

  return (
    <AppBackground>
      <SafeAreaView style={styles.safe}>
        <View style={styles.mid}>
          <View style={styles.iconTile}>
            <Icon name="shield-check" size={26} />
          </View>
          <ThemedText type="title" style={styles.title}>
            Your data is safe.
          </ThemedText>
          <ThemedText type="body" themeColor="text2" style={styles.body}>
            CoinFlow hit an unexpected error and needs to restart. Nothing on this device was
            changed.
          </ThemedText>

          <View style={styles.disclosure}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setDetailsOpen((v) => !v)}
              style={styles.disclosureRow}
            >
              <View style={{ transform: [{ rotate: detailsOpen ? '90deg' : '0deg' }] }}>
                <Icon name="chevron-right" size={15} color="text2" />
              </View>
              <ThemedText type="label" themeColor="text2">
                Technical details
              </ThemedText>
            </Pressable>
            {detailsOpen ? (
              <View style={styles.disclosureBody}>
                <ThemedText type="caption" themeColor="text2">
                  <ThemedText type="caption" themeColor="text" style={styles.mono}>
                    {name}
                  </ThemedText>{' '}
                  · boundary
                </ThemedText>
                {eventId ? (
                  <ThemedText type="caption" themeColor="text2" style={styles.ref}>
                    Ref {eventId}
                  </ThemedText>
                ) : null}
                <View style={styles.copyRow}>
                  <Button variant="ghost" onPress={handleCopy} style={styles.copyButton}>
                    Copy details
                  </Button>
                </View>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.foot}>
          <Button onPress={onReload}>Reload app</Button>
        </View>
      </SafeAreaView>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  mid: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.five,
  },
  iconTile: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.dark.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.three,
  },
  title: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
  body: { marginTop: Spacing.two, maxWidth: 260, textAlign: 'center' },
  disclosure: {
    width: '100%',
    maxWidth: 260,
    marginTop: Spacing.four,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.hairline,
    paddingTop: Spacing.three,
  },
  disclosureRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.one, minHeight: 32 },
  disclosureBody: {
    marginTop: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.control,
    backgroundColor: Colors.dark.surface2,
  },
  mono: { fontWeight: '700' },
  ref: { marginTop: Spacing.half },
  copyRow: { marginTop: Spacing.two, alignItems: 'center' },
  copyButton: { minHeight: 32, paddingHorizontal: Spacing.three },
  foot: { paddingHorizontal: Spacing.five, paddingBottom: Spacing.four },
});
