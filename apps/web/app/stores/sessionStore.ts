import { create } from 'zustand';
import { isSpeciesId } from 'game-core';

export type Stage = 'title' | 'select' | 'globe';

const SPECIES_SLOT = 'pokestonks.species';

function readSpecies(): string | null {
  try {
    const v = window.localStorage.getItem(SPECIES_SLOT);
    return isSpeciesId(v) ? v : null;
  } catch {
    return null;
  }
}

function writeSpecies(id: string) {
  try {
    window.localStorage.setItem(SPECIES_SLOT, id);
  } catch {
    /* storage blocked: the choice lasts for this page view only */
  }
}

interface SessionState {
  /** Which screen is showing. Not persisted: every visit starts at the title. */
  stage: Stage;
  /** Chosen BrokerMon. Persisted in localStorage `pokestonks.species`; null until hydrated/chosen. */
  speciesId: string | null;
  /** False during SSR and first paint; flips true once localStorage has been read (in an effect). */
  hydrated: boolean;
  /** Route currently being played (game overlay mounted), or null while on the globe. */
  marketId: string | null;
  setStage: (stage: Stage) => void;
  chooseSpecies: (id: string) => void;
  enterRoute: (marketId: string) => void;
  exitRoute: () => void;
  /** Read persisted state. Call once from an effect so server and first client render agree. */
  hydrate: () => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  stage: 'title',
  speciesId: null,
  hydrated: false,
  marketId: null,
  setStage: (stage) => set({ stage }),
  chooseSpecies: (id) => {
    if (!isSpeciesId(id)) return;
    writeSpecies(id);
    set({ speciesId: id });
  },
  enterRoute: (marketId) => set({ marketId }),
  exitRoute: () => set({ marketId: null }),
  hydrate: () => {
    if (get().hydrated) return;
    set({ speciesId: readSpecies(), hydrated: true });
  },
}));
