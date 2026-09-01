/**
 * Onboarding progress (SPEC-implementation.md §22.2 / §6.1). Step index + the per-step
 * selections held before they're committed to the DB on "Done" (which then sets
 * `onboardingDone`).
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
