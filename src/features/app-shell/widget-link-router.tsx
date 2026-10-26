/**
 * FILE PURPOSE
 * ------------
 * Handles a widget tap (`coinflow://`, `coinflow://add`, `coinflow://review[?open=<id>]` —
 * SPEC-implementation.md §43.3, IMP-092) on a **cold start** explicitly, the same way
 * `NotificationRouter` handles a cold-start notification tap: it reads the incoming URL itself
 * and imperatively navigates/opens the sheet, instead of relying only on expo-router's automatic
 * Linking resolution.
 *
 * WHY THIS EXISTS
 * ----------------
 * `src/app/add.tsx` / `src/app/review.tsx` are real routes and handle a *warm* tap (app already
 * running, `onNewIntent`) correctly on their own — expo-router's Linking listener is already live
 * by then. On a cold start, though, that automatic resolution races `<MigrationGate>` and
 * `RootNavigator`'s async onboarding gate (both `return null` until their data resolves): the
 * navigator doesn't exist yet at the moment the initial URL would normally be applied, so the
 * link is silently dropped and the app falls back to Home instead of the review flow — confirmed
 * on-device 2026-09-22 (a queue-row widget tap after the app process had been killed opened plain
 * Home, no sheet, nothing). This mirrors the exact hazard `NotificationRouter`'s own header
 * comment already documents for notifications, solved the same way there.
 *
 * WHERE IT FITS
 * -------------
 * Mounted inside `<MigrationGate>` next to `NotificationRouter` (so the database — and the
 * suggestion a `review?open=` link points at — is ready), reading `Linking.getInitialURL()`
 * exactly once. It calls the same `router`/`useSheetRegistry` actions `add.tsx`/`review.tsx`
 * already use, so the outcome matches a warm tap either way.
 */

import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';

import { getSuggestion } from '@/db/repositories/suggestions';
import { useSheetRegistry } from '@/stores';

function routeInitialUrl(url: string): void {
  const { hostname, path, queryParams } = Linking.parse(url);
  const target = (hostname || path || '').replace(/^\/+/, '').toLowerCase();

  if (target === 'add') {
    router.push('/');
    useSheetRegistry.getState().open('add', {});
    return;
  }

  if (target === 'review') {
    router.push('/review-queue');
    const open = queryParams?.open;
    const id = typeof open === 'string' ? open : undefined;
    if (!id) return;
    const suggestion = getSuggestion(id);
    if (suggestion?.status === 'pending') {
      useSheetRegistry.getState().open('confirm', { suggestionId: suggestion.id });
    }
  }
  // CR-34 — the Balances widget
  if (target === 'my-accounts') {
    router.push('/my-accounts' as never);
    return;
  }
  // bare "coinflow://" (Summary widget root) needs no extra routing — Home is already there.
}

export function WidgetLinkRouter() {
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    Linking.getInitialURL()
      .then((url) => {
        if (url) routeInitialUrl(url);
      })
      .catch(() => {});
  }, []);

  return null;
}
