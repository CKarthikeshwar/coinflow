/**
 * RNTL test double for `@gorhom/bottom-sheet`. The real components need an actual mounted
 * `BottomSheet` context — measured layout, animated shared values from `react-native-reanimated`
 * — that doesn't exist in a plain `render()` and isn't what these tests verify anyway: sheet
 * positioning/animation/gesture timing is Maestro's job (SPEC-implementation.md §34's "which
 * tier" rule), not RNTL's. Swaps the layout-measuring wrappers for plain RN primitives so a
 * sheet's *content* — validation, buttons, interactions — is testable in isolation.
 *
 * Picked up automatically by Jest for any test file in this project (manual mocks for node_modules
 * packages, unlike local-file mocks, apply without an explicit `jest.mock()` call) — no per-test
 * wiring needed.
 */

import { forwardRef, type ReactNode } from 'react';
import { ScrollView, TextInput, View } from 'react-native';

export const BottomSheetView = View;
export const BottomSheetScrollView = ScrollView;
export const BottomSheetFlatList = View;
export const BottomSheetTextInput = TextInput;

export const BottomSheetBackdrop = () => null;

export const BottomSheetModal = forwardRef<unknown, { children?: ReactNode }>(function BottomSheetModal(_props, _ref) {
  return null;
});

export function BottomSheetModalProvider({ children }: { children: ReactNode }) {
  return children;
}

export function useBottomSheetModal() {
  return { dismiss: () => {}, dismissAll: () => {} };
}
