import { SafeAreaView } from 'react-native-safe-area-context';

import { AndroidOnlyNotice } from '@/ui/android-only-notice';

export default function PermissionsWebScreen() {
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <AndroidOnlyNotice />
    </SafeAreaView>
  );
}
