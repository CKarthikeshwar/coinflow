/**
 * FILE PURPOSE
 * ------------
 * `coinflow://add` (SPEC-implementation.md §43.3) — the Quick add widget's tap target. Not a screen: it lands on
 * Home and opens the Add sheet, so a cold start from the widget ends up exactly where the in-app + button would.
 * Renders nothing.
 */

import { Redirect } from 'expo-router';
import { useEffect } from 'react';

import { useSheetRegistry } from '@/stores';

export default function AddRedirect() {
  useEffect(() => {
    useSheetRegistry.getState().open('add', {});
  }, []);
  return <Redirect href="/" />;
}
