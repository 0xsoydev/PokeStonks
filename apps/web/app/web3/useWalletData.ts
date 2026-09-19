'use client';

import { useEffect } from 'react';
import { useWalletStore } from '../stores/walletStore';
import type { Address } from './format';

/**
 * Live wallet balances for `address`: MON, sSTOCK per ticker and owned BrokerMon ids.
 * Polls every 8s while the tab is visible, refetches on tab focus and on EventBus 'wallet:refresh'.
 * Any number of components may call this; polling is shared and reads are de-duplicated.
 * Read failures never throw: check `status` / `error`, the last good data stays in place.
 */
export function useWalletData(address?: Address | null) {
  useEffect(() => {
    const store = useWalletStore.getState();
    if (!address) {
      store.reset();
      return;
    }
    return store.attach(address);
  }, [address]);
  return useWalletStore((s) => s);
}
