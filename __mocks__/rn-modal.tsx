/**
 * RNTL test double for `react-native`'s `Modal` (wired via `jest.config.js`'s `moduleNameMapper`
 * onto `react-native/Libraries/Modal/Modal`, the exact file `react-native`'s index re-exports it
 * from). The real `Modal` renders its children through an `AppContainer`/`RootTagContext` that
 * only exists under RN's actual app root — not present in a bare RNTL `render()` — so
 * `ConfirmDialog`/any Modal-based content silently doesn't appear in the query tree, even with
 * `visible={true}`. This keeps the one behavior these tests actually care about (gating on
 * `visible`) without the native app-root machinery.
 */

import type { ReactNode } from 'react';
import { View } from 'react-native';

export default function Modal({ visible, children }: { visible?: boolean; children?: ReactNode }) {
  if (!visible) return null;
  return <View>{children}</View>;
}
