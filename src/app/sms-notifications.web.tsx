// Web build's replacement for `sms-notifications.tsx` — that screen needs the native SMS
// module and OS permission APIs, neither of which exist on web.
import { SafeAreaView } from 'react-native-safe-area-context';

import { AndroidOnlyNotice } from '@/ui/android-only-notice';

export default function SmsNotificationsWebScreen() {
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <AndroidOnlyNotice />
    </SafeAreaView>
  );
}
