import { create } from "zustand";
import { createPublicClient, http, formatEther } from "viem";
import { monadTestnet } from "../web3/chains";

const POLL_INTERVAL = 8_000;

const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL),
});

interface WalletState {
  monBalance: string;
  sstock: Map<string, bigint>;
  refetch: (address?: `0x${string}`) => Promise<void>;
  startPolling: (address: `0x${string}`) => void;
  stopPolling: () => void;
}

let pollTimer: ReturnType<typeof setInterval> | null = null;
let currentAddress: `0x${string}` | null = null;

export const useWalletStore = create<WalletState>((set, get) => ({
  monBalance: "0",
  sstock: new Map(),
  refetch: async (address?: `0x${string}`) => {
    const addr = address ?? currentAddress;
    if (!addr) return;
    try {
      const bal = await publicClient.getBalance({ address: addr });
      set({ monBalance: formatEther(bal) });
    } catch {
      // ignore on network errors
    }
  },
  startPolling: (address) => {
    get().stopPolling();
    currentAddress = address;
    get().refetch(address);
    pollTimer = setInterval(() => get().refetch(), POLL_INTERVAL);
  },
  stopPolling: () => {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    currentAddress = null;
  },
}));
