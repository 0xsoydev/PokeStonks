import { create } from 'zustand';

interface BrokerMon {
  id: string;
  name: string;
  affinity: string;
  level: number;
}

interface SessionState {
  wallet: string | null;
  privyReady: boolean;
  marketId: string | null;
  party: BrokerMon[];
  reconnectToken: string | null;
  setWallet: (w: string | null) => void;
  setPrivyReady: (r: boolean) => void;
  setMarketId: (id: string | null) => void;
  setParty: (p: BrokerMon[]) => void;
  setReconnectToken: (t: string | null) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  wallet: null,
  privyReady: false,
  marketId: null,
  party: [],
  reconnectToken: null,
  setWallet: (wallet) => set({ wallet }),
  setPrivyReady: (privyReady) => set({ privyReady }),
  setMarketId: (marketId) => set({ marketId }),
  setParty: (party) => set({ party }),
  setReconnectToken: (reconnectToken) => set({ reconnectToken }),
}));
