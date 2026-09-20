/**
 * FILE PURPOSE
 * ------------
 * `coinflow://review[?open=<id>]` (SPEC-implementation.md §28.3 / §43.3) — the Queue widget's tap targets. Not a
 * screen: it sends the user to the Review Queue and, for a row tap, opens that suggestion's Confirmation sheet.
 * The row is re-read first (never trust the link): if it was confirmed or dismissed since the widget last drew,
 * the user just lands on the queue.
 */

import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';

import { getSuggestion } from '@/db/repositories/suggestions';
import { useSheetRegistry } from '@/stores';

export default function ReviewRedirect() {
  const { open } = useLocalSearchParams<{ open?: string }>();

  useEffect(() => {
    if (!open) return;
    const suggestion = getSuggestion(open);
    if (suggestion?.status === 'pending') {
      useSheetRegistry.getState().open('confirm', { suggestionId: suggestion.id });
    }
  }, [open]);

  return <Redirect href="/review-queue" />;
}
