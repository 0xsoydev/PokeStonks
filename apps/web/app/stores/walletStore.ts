import { create } from 'zustand';
import { EventBus } from '../game/net/events';
import { readWalletData, TICKERS } from '../web3/contracts';
import { ZERO, type Address } from '../web3/format';

const POLL_MS = 8_000;
/** After a claim confirms, RPC nodes can lag a block or two: re-read shortly after too. */
const REFRESH_FOLLOWUPS_MS = [2_500, 7_000];

type Status = 'idle' | 'loading' | 'ready' | 'error';

const zeroSstock = () => Object.fromEntries(TICKERS.map((t) => [t, ZERO])) as Record<string, bigint>;

interface WalletState {
  address: Address | null;
  status: Status;
  /** Native MON balance (wei). */
  mon: bigint;
  /** ticker -> sTICKER balance (18 dp), all 12 tickers present. */
  sstock: Record<string, bigint>;
  /** Owned BrokerMon token ids, newest first. */
  nftIds: bigint[];
  error: string | null;
  updatedAt: number | null;
  /** Read balances now. Concurrent calls share one request; a call during a request queues one more. */
  refetch: () => Promise<void>;
  /** Start polling for `address` (ref-counted). Returns a detach function. Prefer `useWalletData`. */
  attach: (address: Address) => () => void;
  reset: () => void;
}

const INITIAL = {
  address: null,
  status: 'idle' as Status,
  mon: ZERO,
  sstock: zeroSstock(),
  nftIds: [] as bigint[],
  error: null,
  updatedAt: null,
};

let consumers = 0;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let followupTimers: ReturnType<typeof setTimeout>[] = [];
let inflight: Promise<void> | null = null;
let dirty = false;
let teardown: (() => void) | null = null;

export const useWalletStore = create<WalletState>((set, get) => {
  async function run(): Promise<void> {
    const address = get().address;
    if (!address) return;
    try {
      const data = await readWalletData(address);
      if (get().address !== address) return; // identity changed mid-flight
      const prev = get();
      const failed = new Set(data.failed);
      const allFailed = failed.size === 3;
      set({
        status: allFailed ? (prev.updatedAt ? 'ready' : 'error') : 'ready',
        error: failed.size ? 'Balances could not be refreshed. Retrying in a few seconds.' : null,
        mon: failed.has('mon') ? prev.mon : data.mon,
        sstock: failed.has('sstock') ? prev.sstock : data.sstock,
        nftIds: failed.has('nfts') ? prev.nftIds : data.nftIds,
        updatedAt: allFailed ? prev.updatedAt : Date.now(),
      });
    } catch (e) {
      // readWalletData never throws; this is a last line of defence so React never sees a rejection.
      if (get().address === address) {
        set({ status: get().updatedAt ? 'ready' : 'error', error: e instanceof Error ? e.message : 'Read failed' });
      }
    }
  }

  function refetch(): Promise<void> {
    if (inflight) {
      dirty = true;
      return inflight;
    }
    inflight = (async () => {
      try {
        do {
          dirty = false;
          await run();
        } while (dirty);
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  }

  function startPolling() {
    const tick = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void refetch();
    };
    pollTimer = setInterval(tick, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) void refetch();
    };
    document.addEventListener('visibilitychange', onVisible);
    const offBus = EventBus.on('wallet:refresh', () => {
      void refetch();
      followupTimers.forEach(clearTimeout);
      followupTimers = REFRESH_FOLLOWUPS_MS.map((ms) => setTimeout(() => void refetch(), ms));
    });
    teardown = () => {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
      followupTimers.forEach(clearTimeout);
      followupTimers = [];
      document.removeEventListener('visibilitychange', onVisible);
      offBus();
      teardown = null;
    };
  }

  return {
    ...INITIAL,
    refetch,
    attach: (address) => {
      if (get().address !== address) {
        set({ ...INITIAL, sstock: zeroSstock(), address, status: 'loading' });
      }
      consumers += 1;
      if (consumers === 1) startPolling();
      void refetch();
      let detached = false;
      return () => {
        if (detached) return;
        detached = true;
        consumers = Math.max(0, consumers - 1);
        if (consumers === 0) teardown?.();
      };
    },
    reset: () => {
      if (get().address !== null) set({ ...INITIAL, sstock: zeroSstock() });
    },
  };
});

/** Sum of every sTICKER balance (all 18 dp, so a plain bigint sum is meaningful). */
export function totalSstock(sstock: Record<string, bigint>): bigint {
  return Object.values(sstock).reduce((a, b) => a + b, ZERO);
}
