'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import {
  PrivyProvider,
  useCreateWallet,
  useLogin,
  useLogout,
  usePrivy,
  useWallets,
  type PrivyClientConfig,
} from '@privy-io/react-auth';
import { monadTestnet } from './chains';
import { activateGuest, deactivateGuest, useGuestAddress, useIsClient } from './guest';
import { shortAddress, isRealAddress, type Address } from './format';

export interface Identity {
  status: 'loading' | 'signed-out' | 'signed-in';
  /** The wallet handed to the game as `wallet`. Only set when signed in. */
  address?: Address;
  /** How the signed-in user authenticated. While signed out: the mode `login()` will use. */
  mode: 'privy' | 'guest';
  /** Short, human label for the identity pill. */
  displayName: string;
  /** True when a Privy app id is configured, so Google sign-in is available. */
  privyEnabled: boolean;
  /** Open Google sign-in (Privy). No-op when Privy is not configured. */
  login(): void;
  /** Start or resume a throwaway testnet wallet on this device. Works with zero setup. */
  playAsGuest(): void;
  logout(): void;
}

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim() || '';

const LOADING: Identity = {
  status: 'loading',
  mode: 'guest',
  displayName: '',
  privyEnabled: !!PRIVY_APP_ID,
  login() {},
  playAsGuest() {},
  logout() {},
};

const IdentityContext = createContext<Identity>(LOADING);

export function useIdentity(): Identity {
  return useContext(IdentityContext);
}

const PRIVY_CONFIG: PrivyClientConfig = {
  loginMethods: ['google'],
  embeddedWallets: { ethereum: { createOnLogin: 'all-users' } },
  defaultChain: monadTestnet,
  supportedChains: [monadTestnet],
  appearance: { theme: 'light', accentColor: '#183088', walletChainType: 'ethereum-only' },
};

/* -------------------------------------------------------------- guest only */

function GuestOnlyIdentity({ children }: { children: ReactNode }) {
  const guest = useGuestAddress();
  const isClient = useIsClient();
  const playAsGuest = useCallback(() => void activateGuest(), []);
  const value = useMemo<Identity>(
    () => ({
      status: !isClient ? 'loading' : guest ? 'signed-in' : 'signed-out',
      address: guest ?? undefined,
      mode: 'guest',
      displayName: guest ? `Guest ${shortAddress(guest, 4, 4)}` : '',
      privyEnabled: false,
      login: playAsGuest,
      playAsGuest,
      logout: deactivateGuest,
    }),
    [guest, isClient, playAsGuest],
  );
  return <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>;
}

/* ------------------------------------------------------------------- Privy */

function PrivyIdentity({ children }: { children: ReactNode }) {
  const guest = useGuestAddress();
  const { ready, authenticated, user } = usePrivy();
  const { login } = useLogin();
  const { logout } = useLogout();
  const { wallets } = useWallets();
  const { createWallet } = useCreateWallet();

  const embeddedAddress = useMemo<Address | undefined>(() => {
    const fromHook = wallets.find((w) => w.walletClientType?.startsWith('privy'))?.address;
    if (isRealAddress(fromHook)) return fromHook;
    const linked = user?.linkedAccounts?.find(
      (a) => a.type === 'wallet' && a.chainType === 'ethereum' && a.walletClientType?.startsWith('privy'),
    );
    const fromUser = linked && 'address' in linked ? linked.address : undefined;
    return isRealAddress(fromUser) ? fromUser : undefined;
  }, [wallets, user]);

  // createOnLogin normally makes the wallet; if it has not appeared shortly after login, ask once.
  const askedRef = useRef(false);
  useEffect(() => {
    if (!ready || !authenticated || embeddedAddress) {
      askedRef.current = false;
      return;
    }
    const t = setTimeout(() => {
      if (askedRef.current) return;
      askedRef.current = true;
      createWallet().catch(() => {});
    }, 4_000);
    return () => clearTimeout(t);
  }, [ready, authenticated, embeddedAddress, createWallet]);

  const playAsGuest = useCallback(() => void activateGuest(), []);
  const doLogin = useCallback(() => {
    if (ready && !authenticated) login();
  }, [ready, authenticated, login]);
  const doLogout = useCallback(() => {
    deactivateGuest();
    if (authenticated) void logout().catch(() => {});
  }, [authenticated, logout]);

  const value = useMemo<Identity>(() => {
    const base = { privyEnabled: true, login: doLogin, playAsGuest, logout: doLogout } as const;
    if (!ready) return { ...base, status: 'loading', mode: 'privy', displayName: '' };
    if (authenticated) {
      const name = user?.google?.name || user?.google?.email?.split('@')[0] || shortAddress(embeddedAddress);
      return {
        ...base,
        status: embeddedAddress ? 'signed-in' : 'loading',
        address: embeddedAddress,
        mode: 'privy',
        displayName: name || 'Player',
      };
    }
    if (guest) {
      return {
        ...base,
        status: 'signed-in',
        address: guest,
        mode: 'guest',
        displayName: `Guest ${shortAddress(guest, 4, 4)}`,
      };
    }
    return { ...base, status: 'signed-out', mode: 'privy', displayName: '' };
  }, [ready, authenticated, user, embeddedAddress, guest, doLogin, playAsGuest, doLogout]);

  return <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>;
}

/**
 * Identity for the whole app. With NEXT_PUBLIC_PRIVY_APP_ID set: Google sign-in + an auto-created
 * embedded wallet on Monad testnet, plus guest mode. Without it: guest mode only (PrivyProvider is
 * never mounted without an app id, it would throw).
 */
export function IdentityProvider({ children }: { children: ReactNode }) {
  if (!PRIVY_APP_ID) return <GuestOnlyIdentity>{children}</GuestOnlyIdentity>;
  return (
    <PrivyProvider appId={PRIVY_APP_ID} config={PRIVY_CONFIG}>
      <PrivyIdentity>{children}</PrivyIdentity>
    </PrivyProvider>
  );
}
