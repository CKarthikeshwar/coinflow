// Web build's replacement for `splits/index.tsx` — split money lives in the on-device database, which web doesn't
// have (same platform split as every other route).
import { SafeAreaView } from 'react-native-safe-area-context';

import { AndroidOnlyNotice } from '@/ui/android-only-notice';

export default function SplitsWebScreen() {
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <AndroidOnlyNotice />
    </SafeAreaView>
  );
}
