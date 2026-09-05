/**
 * FILE PURPOSE
 * ------------
 * Settings › SMS & notifications — lets the user see and grant/enable the app's two OS
 * permissions (SMS access, notifications) via two `PermissionCard`s, using the same shared
 * `usePermissionStatus` hook every other permission-aware screen uses.
 *
 * Live OS permission status via `usePermissionStatus`; two `PermissionCard`s. This is the first
 * place IMP-042 ("a permanently-denied permission's Enable action opens the system settings
 * screen") is actually implemented — Home's and Review Queue's existing banners both just
 * re-request unconditionally, since neither needed the distinction until now.
 */

import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { Linking, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { requestSmsPermissions } from '@/services/sms';
import { usePermissionStatus } from '@/hooks/use-permission-status';

import { PermissionCard } from '@/features/onboarding/permission-card';
import { ThemedText } from '@/ui/themed-text';
import { TopBar } from '@/ui/top-bar';

export default function SmsNotificationsScreen() {
  const permission = usePermissionStatus();

  const handleSmsRequest = async () => {
    if (permission.smsCanAskAgain) {
      await requestSmsPermissions();
      permission.refresh();
    } else {
      await Linking.openSettings();
    }
  };

  const handleNotifRequest = async () => {
    if (permission.notificationsCanAskAgain) {
      await Notifications.requestPermissionsAsync();
      permission.refresh();
    } else {
      await Linking.openSettings();
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <TopBar title="SMS & notifications" onBack={() => router.back()} />
      <View style={styles.body}>
        <PermissionCard
          kind="sms"
          state={permission.sms === 'unknown' ? 'idle' : permission.sms}
          canAskAgain={permission.smsCanAskAgain}
          onRequest={handleSmsRequest}
        />
        <PermissionCard
          kind="notif"
          state={permission.notifications === 'unknown' ? 'idle' : permission.notifications}
          optional
          canAskAgain={permission.notificationsCanAskAgain}
          onRequest={handleNotifRequest}
        />
        <ThemedText type="caption" themeColor="text3" style={styles.explainer}>
          CoinFlow reads bank &amp; UPI transaction messages on this device to detect payments.
          Personal messages are ignored, and nothing is ever uploaded.
        </ThemedText>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { flex: 1, paddingHorizontal: Spacing.three, gap: Spacing.two },
  explainer: { paddingTop: Spacing.two },
});
