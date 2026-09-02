/**
 * `SheetHost` — SPEC-implementation.md §28.2 (D25). One `BottomSheetModal`, mounted once at
 * the app root, that switches its child on `useSheetRegistry().current`.
 *
 * Wires `'confirm'`, `'add'`, `'categoryPicker'` (F3/F4) and `'createCategory'`/`'editCategory'`
 * (F6, both routed to the one mode-aware `CategoryEditorSheet`). `'edit'`/`'filter'` still render
 * nothing — their own features build the bodies later.
 *
 * V-6 discard-guard: rather than intercepting the swipe-down/scrim-tap gesture mid-flight (hard
 * to do cleanly with `@gorhom`'s gesture pipeline), this **disables** pan-down-to-close and
 * scrim-tap-to-close while the active draft is dirty — forcing the explicit **Cancel** button,
 * which does the dirty-check + discard `ConfirmDialog` itself (see `transaction-sheet.tsx`). Same
 * outcome (can't lose unsaved input by accident), simpler mechanism than spec's literal
 * "swipe wired to requestClose".
 *
 * Dismiss/present are serialized, not raced: closing one sheet and opening the next (e.g.
 * cancelling an edit, then immediately tapping a different row) used to silently drop the new
 * sheet's content if the tap landed before the previous one's close *animation* actually
 * finished — `.dismiss()` takes real time, but `current` (and so `.present()`) can change well
 * before that animation completes. `@gorhom`'s portal-render gate checks whether the shared
 * modal is still mid-close at the moment new content is registered, not at present()-call time,
 * so a present() that races an in-flight dismiss registers nothing and is never retried. Fixed
 * by deferring `.present()` until the modal's own `onDismiss` confirms the previous close has
 * actually completed, rather than firing it the instant `current` changes.
 *
 * Hardware/gesture **back** while a sheet is open used to fall through to whatever's behind it
 * (the underlying route, or — with nothing left to pop — straight out of the app) rather than
 * closing the sheet, since nothing intercepted it: `@gorhom`'s sheet is an overlay, not part of
 * the route stack `expo-router`'s own back handling knows about. A `BackHandler` listener here
 * now intercepts back presses while a sheet is open and routes them through
 * `useSheetRegistry().requestClose()` — the *same* Cancel handler each sheet body registers for
 * its own Cancel button (dirty-check + discard `ConfirmDialog`, V-6), not a bypass of it: back
 * should surface the same "discard changes?" prompt Cancel does, not silently no-op or silently
 * close. Lets the press through untouched when no sheet is open.
 */

import {
  BottomSheetBackdrop,
  BottomSheetModal,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useEffect, useMemo, useRef } from 'react';
import { BackHandler } from 'react-native';
import { Easing } from 'react-native-reanimated';

import { Colors, Radius } from '@/constants/theme';
import { useAddSheetDraft, useCategoryDraft, useSheetRegistry } from '@/stores';

import { CategoryEditorSheet } from '@/features/categories/category-editor-sheet';
import { CategoryPickerSheet } from '@/features/categories/category-picker-sheet';
import { TransactionSheetBody } from '@/features/transactions/transaction-sheet';

// SPEC-UI-UX.md §3.5 — sheet slide-up/dismiss is the `slow` (320ms) token; @gorhom's Android
// default (250ms `Easing.out(exp)`) decelerates hard right at the end of the motion, which reads
// as an abrupt stop on dismiss. `standard` (`cubic-bezier(.2,0,0,1)`) applied to both directions.
const SHEET_ANIMATION_CONFIG = { duration: 320, easing: Easing.bezier(0.2, 0, 0, 1) };

function Backdrop(props: BottomSheetBackdropProps & { dirty: boolean }) {
  const { dirty, ...rest } = props;
  return (
    <BottomSheetBackdrop
      {...rest}
      appearsOnIndex={0}
      disappearsOnIndex={-1}
      pressBehavior={dirty ? 'none' : 'close'}
    />
  );
}

export function SheetHost() {
  const ref = useRef<BottomSheetModal>(null);
  const { current, close } = useSheetRegistry();
  const addSheetDirty = useAddSheetDraft((s) => s.dirty);
  const categoryDirty = useCategoryDraft((s) => s.dirty);
  const isCategoryEditor = current === 'createCategory' || current === 'editCategory';
  const dirty = isCategoryEditor ? categoryDirty : addSheetDirty;
  const hasPresented = useRef(false);
  const dismissing = useRef(false);

  const currentRef = useRef(current);
  useEffect(() => {
    currentRef.current = current;
  }, [current]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!currentRef.current) return false; // no sheet open — let default back navigation happen
      useSheetRegistry.getState().requestClose();
      return true; // handled — don't let it fall through to the route behind the sheet
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (dismissing.current) {
      // A previous sheet is still mid-close. Presenting now would race gorhom's
      // portal-render gate and silently drop this sheet's content (see file header) —
      // `handleDismiss` (below) re-checks `current` once the close actually finishes
      // and presents it then instead.
      return;
    }
    if (current) {
      hasPresented.current = true;
      ref.current?.present();
    } else if (hasPresented.current) {
      // Only dismiss a sheet that has actually been presented before — calling
      // `.dismiss()` on a never-presented `BottomSheetModal` leaves gorhom's internal
      // `statusRef` stuck at `DISMISSING` forever (its `handleDismiss` has no guard for
      // "never opened"), which then makes every future `.present()` silently no-op:
      // the imperative call succeeds, but the portal render that actually shows the
      // sheet's content is gated on that status and never runs again.
      dismissing.current = true;
      ref.current?.dismiss();
    }
  }, [current]);

  const handleDismiss = () => {
    dismissing.current = false;
    if (current) {
      // Something new was requested while the previous sheet was still closing —
      // present it now that the close has actually finished, rather than the stale
      // attempt from the effect above (which deferred instead of racing it).
      ref.current?.present();
    } else {
      close();
    }
  };

  const sizing = useMemo(() => {
    if (current === 'confirm' || current === 'add') return { snapPoints: ['92%'], enableDynamicSizing: false };
    return { snapPoints: undefined, enableDynamicSizing: true };
  }, [current]);

  return (
    <BottomSheetModal
      ref={ref}
      snapPoints={sizing.snapPoints}
      enableDynamicSizing={sizing.enableDynamicSizing}
      animationConfigs={SHEET_ANIMATION_CONFIG}
      enablePanDownToClose={!dirty}
      backgroundStyle={{ backgroundColor: Colors.dark.surface, borderRadius: Radius.sheet }}
      handleIndicatorStyle={{ backgroundColor: Colors.dark.hairline }}
      backdropComponent={(props) => <Backdrop {...props} dirty={dirty} />}
      onDismiss={handleDismiss}
    >
      {current === 'confirm' ? <TransactionSheetBody mode="confirm" /> : null}
      {current === 'add' ? <TransactionSheetBody mode="add" /> : null}
      {current === 'categoryPicker' ? <CategoryPickerSheet /> : null}
      {isCategoryEditor ? <CategoryEditorSheet /> : null}
    </BottomSheetModal>
  );
}
