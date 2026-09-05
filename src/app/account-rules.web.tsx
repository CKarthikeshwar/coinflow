// Web build's replacement for `account-rules.tsx` — that screen reads the database, which
// doesn't exist on web, so this shows the "Android only" notice instead.
import { SafeAreaView } from 'react-native-safe-area-context';

import { AndroidOnlyNotice } from '@/ui/android-only-notice';

export default function AccountRulesWebScreen() {
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <AndroidOnlyNotice />
    </SafeAreaView>
  );
}
