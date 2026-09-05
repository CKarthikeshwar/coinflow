/**
 * FILE PURPOSE
 * ------------
 * Tracks progress through the multi-step onboarding flow (`src/app/(onboarding)/`) — which step
 * the user is on, and the choices they've made on the category-review step (which default
 * categories they turned off, what order they want them in). Nothing here touches the database
 * until the user actually finishes onboarding.
 *
 * WHERE IT FITS
 * -------------
 * Used by `src/app/(onboarding)/welcome.tsx`, `permissions.tsx`, and `category-review.tsx` to
 * move between steps and record selections. Only once the user completes the flow are these
 * selections actually written to the database (creating/reordering categories) and the
 * `onboardingDone` setting flipped to true (`src/db/repositories/settings.ts`) — this store is
 * just the scratch pad along the way.
 */

import { create } from 'zustand';

type OnboardingStore = {
  step: 1 | 2 | 3;
  /** category ids the user has toggled off during step 3 (default = all on) */
  disabledCategoryIds: string[];
  categoryOrder: string[] | null;
  next: () => void;
  back: () => void;
  goTo: (step: 1 | 2 | 3) => void;
  toggleCategory: (id: string) => void;
  setOrder: (ids: string[]) => void;
  reset: () => void;
};

export const useOnboarding = create<OnboardingStore>((set) => ({
  step: 1,
  disabledCategoryIds: [],
  categoryOrder: null,
  next: () => set((s) => ({ step: Math.min(3, s.step + 1) as 1 | 2 | 3 })),
  back: () => set((s) => ({ step: Math.max(1, s.step - 1) as 1 | 2 | 3 })),
  goTo: (step) => set({ step }),
  toggleCategory: (id) =>
    set((s) => ({
      disabledCategoryIds: s.disabledCategoryIds.includes(id)
        ? s.disabledCategoryIds.filter((x) => x !== id)
        : [...s.disabledCategoryIds, id],
    })),
  setOrder: (ids) => set({ categoryOrder: ids }),
  reset: () => set({ step: 1, disabledCategoryIds: [], categoryOrder: null }),
}));
