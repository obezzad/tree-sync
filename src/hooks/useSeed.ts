'use client';

import store from '@/stores/RootStore';

export function useSeed() {
  return {
    seed: store.seed,
    updateSeed: (newSeed: string | null) => store.setSeed(newSeed),
    resetSeed: () => store.setSeed(null)
  };
}
