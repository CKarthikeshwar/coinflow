// Web build's replacement for `payment-methods.tsx` — that screen reads the database, which
// doesn't exist on web, so this shows the "Android only" notice instead.
import { SafeAreaView } from 'react-native-safe-area-context';

import { AndroidOnlyNotice } from '@/ui/android-only-notice';

export default function PaymentMethodsWebScreen() {
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <AndroidOnlyNotice />
    </SafeAreaView>
  );
}
