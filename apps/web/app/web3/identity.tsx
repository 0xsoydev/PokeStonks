'use client';

import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, useAccount, useDisconnect } from 'wagmi';
import { wagmiConfig } from './wagmi';
import { useConnectDialog } from './connectDialog';
import { activateGuest, deactivateGuest, useGuestAddress, useIsClient } from './guest';
import { shortAddress, type Address } from './format';

export interface Identity {
  status: 'loading' | 'signed-out' | 'signed-in';
  /** The wallet handed to the game as `wallet`. Only set when signed in. */
  address?: Address;
  /** `wallet`: a connected browser wallet (can pay gas, claims rewards). `guest`: local throwaway key. */
  mode: 'wallet' | 'guest';
  /** Short, human label for the identity pill. */
  displayName: string;
  /** Open the connect-wallet dialog. */
  login(): void;
  /** Start or resume a throwaway wallet on this device. Plays fine; connect a real wallet to claim. */
  playAsGuest(): void;
  logout(): void;
}

const IdentityContext = createContext<Identity | null>(null);

export function useIdentity(): Identity {
  const v = useContext(IdentityContext);
  if (!v) throw new Error('useIdentity must be used inside <IdentityProvider>');
  return v;
}

function WalletIdentity({ children }: { children: ReactNode }) {
  const guest = useGuestAddress();
  const isClient = useIsClient();
  const { address, status } = useAccount();
  const { disconnect } = useDisconnect();
  const show = useConnectDialog((s) => s.show);

  const login = useCallback(() => show(), [show]);
  const playAsGuest = useCallback(() => void activateGuest(), []);
  const logout = useCallback(() => {
    deactivateGuest();
    disconnect();
  }, [disconnect]);

  const value = useMemo<Identity>(() => {
    const base = { login, playAsGuest, logout } as const;
    if (!isClient || status === 'reconnecting' || status === 'connecting') {
      return { ...base, status: 'loading', mode: 'wallet', displayName: '' };
    }
    if (status === 'connected' && address) {
      return { ...base, status: 'signed-in', address: address as Address, mode: 'wallet', displayName: shortAddress(address, 6, 4) };
    }
    if (guest) {
      return { ...base, status: 'signed-in', address: guest, mode: 'guest', displayName: `Guest ${shortAddress(guest, 4, 4)}` };
    }
    return { ...base, status: 'signed-out', mode: 'wallet', displayName: '' };
  }, [isClient, status, address, guest, login, playAsGuest, logout]);

  return <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>;
}

/** Wallet + react-query providers and the app identity (connected wallet, else guest). */
export function IdentityProvider({ children }: { children: ReactNode }) {
  const queryClient = useMemo(() => new QueryClient(), []);
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <WalletIdentity>{children}</WalletIdentity>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
