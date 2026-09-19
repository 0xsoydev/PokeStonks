import { create } from 'zustand';
import { getAccount } from 'wagmi/actions';
import { wagmiConfig } from './wagmi';
import type { Address } from './format';

interface ConnectDialogState {
  open: boolean;
  /** Why the dialog was opened, shown as its subtitle. */
  reason: string | null;
  show(reason?: string): void;
  close(): void;
}

let waiters: Array<(a: Address | null) => void> = [];

export const useConnectDialog = create<ConnectDialogState>((set) => ({
  open: false,
  reason: null,
  show: (reason) => set({ open: true, reason: reason ?? null }),
  close: () => {
    set({ open: false, reason: null });
    const a = connectedAddress();
    waiters.forEach((w) => w(a));
    waiters = [];
  },
}));

export function connectedAddress(): Address | null {
  const a = getAccount(wagmiConfig);
  return a.status === 'connected' && a.address ? (a.address as Address) : null;
}

/**
 * Resolve with a connected wallet address, opening the connect dialog if needed. Resolves null if the
 * player closes the dialog without connecting. Usable from non-React code.
 */
export function requireWallet(reason: string): Promise<Address | null> {
  const now = connectedAddress();
  if (now) return Promise.resolve(now);
  return new Promise((resolve) => {
    waiters.push(resolve);
    useConnectDialog.getState().show(reason);
  });
}

/** Called by the dialog once a wallet connects. */
export function resolveConnected() {
  useConnectDialog.getState().close();
}
