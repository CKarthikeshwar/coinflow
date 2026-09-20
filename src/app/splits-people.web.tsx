// Web build's replacement for `splits-people.tsx` — contacts, SMS and the people table are all on-device.
import { SafeAreaView } from 'react-native-safe-area-context';

import { AndroidOnlyNotice } from '@/ui/android-only-notice';

export default function SplitsPeopleWebScreen() {
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <AndroidOnlyNotice />
    </SafeAreaView>
  );
}
