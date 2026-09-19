import { create } from "zustand";

type BattlePhase = "IDLE" | "INTRO" | "COMMAND" | "LOCKED" | "RESOLVE" | "END";

interface BattleState {
  phase: BattlePhase;
  myHP: number;
  foeHP: number;
  turnTimer: number;
  lastEvents: unknown[];
  setPhase: (p: BattlePhase) => void;
  setMyHP: (hp: number) => void;
  setFoeHP: (hp: number) => void;
  setTurnTimer: (t: number) => void;
  pushEvent: (e: unknown) => void;
  reset: () => void;
}

const INITIAL = { phase: "IDLE" as const, myHP: 0, foeHP: 0, turnTimer: 30, lastEvents: [] };

export const useBattleStore = create<BattleState>((set) => ({
  ...INITIAL,
  setPhase: (phase) => set({ phase }),
  setMyHP: (myHP) => set({ myHP }),
  setFoeHP: (foeHP) => set({ foeHP }),
  setTurnTimer: (turnTimer) => set({ turnTimer }),
  pushEvent: (e) => set((s) => ({ lastEvents: [...s.lastEvents, e] })),
  reset: () => set(INITIAL),
}));
