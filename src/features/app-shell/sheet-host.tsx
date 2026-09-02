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
 */

import {
  BottomSheetBackdrop,
  BottomSheetModal,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useEffect, useMemo, useRef } from 'react';

import { Colors, Radius } from '@/constants/theme';
import { useAddSheetDraft, useCategoryDraft, useSheetRegistry } from '@/stores';

import { CategoryEditorSheet } from '@/features/categories/category-editor-sheet';
import { CategoryPickerSheet } from '@/features/categories/category-picker-sheet';
import { TransactionSheetBody } from '@/features/transactions/transaction-sheet';

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

  useEffect(() => {
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
      ref.current?.dismiss();
    }
  }, [current]);

  const sizing = useMemo(() => {
    if (current === 'confirm' || current === 'add') return { snapPoints: ['92%'], enableDynamicSizing: false };
    return { snapPoints: undefined, enableDynamicSizing: true };
  }, [current]);

  return (
    <BottomSheetModal
      ref={ref}
      snapPoints={sizing.snapPoints}
      enableDynamicSizing={sizing.enableDynamicSizing}
      enablePanDownToClose={!dirty}
      backgroundStyle={{ backgroundColor: Colors.dark.surface, borderRadius: Radius.sheet }}
      handleIndicatorStyle={{ backgroundColor: Colors.dark.hairline }}
      backdropComponent={(props) => <Backdrop {...props} dirty={dirty} />}
      onDismiss={close}
    >
      {current === 'confirm' ? <TransactionSheetBody mode="confirm" /> : null}
      {current === 'add' ? <TransactionSheetBody mode="add" /> : null}
      {current === 'categoryPicker' ? <CategoryPickerSheet /> : null}
      {isCategoryEditor ? <CategoryEditorSheet /> : null}
    </BottomSheetModal>
  );
}
