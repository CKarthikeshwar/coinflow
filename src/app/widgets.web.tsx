// Web build's replacement for `widgets.tsx` — home-screen widgets are Android-only.
import { SafeAreaView } from 'react-native-safe-area-context';

import { AndroidOnlyNotice } from '@/ui/android-only-notice';

export default function WidgetsWebScreen() {
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <AndroidOnlyNotice />
    </SafeAreaView>
  );
}
