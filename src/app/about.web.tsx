// Web build's replacement for `about.tsx` — this screen has no real content to show on web
// (About is mostly static, but kept consistent with every other route's platform split).
import { SafeAreaView } from 'react-native-safe-area-context';

import { AndroidOnlyNotice } from '@/ui/android-only-notice';

export default function AboutWebScreen() {
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <AndroidOnlyNotice />
    </SafeAreaView>
  );
}
