// Web build's replacement for `data.tsx` — that screen reads/exports/wipes the database, none
// of which exist on web, so this shows the "Android only" notice instead.
import { SafeAreaView } from 'react-native-safe-area-context';

import { AndroidOnlyNotice } from '@/ui/android-only-notice';

export default function DataWebScreen() {
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <AndroidOnlyNotice />
    </SafeAreaView>
  );
}
