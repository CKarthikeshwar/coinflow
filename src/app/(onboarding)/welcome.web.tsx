// Web build's replacement for `welcome.tsx`. Even though this particular screen has no
// database dependency of its own, the app never lets a user progress through onboarding on
// web (the very next steps do need the database) — so every onboarding screen consistently
// shows the "Android only" notice on web rather than only some of them.
import { SafeAreaView } from 'react-native-safe-area-context';

import { AndroidOnlyNotice } from '@/ui/android-only-notice';

export default function WelcomeWebScreen() {
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <AndroidOnlyNotice />
    </SafeAreaView>
  );
}
