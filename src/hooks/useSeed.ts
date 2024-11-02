'use client';

import { initializeStore } from '@/stores/RootStore';

export function useSeed() {
  const store = initializeStore();

  return {
    seed: store.seed,
    updateSeed: (newSeed: string | null) => store.setSeed(newSeed),
    resetSeed: () => store.setSeed(null)
  };
}
