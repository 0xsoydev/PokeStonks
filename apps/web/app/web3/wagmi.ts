import { createConfig, http } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { monadTestnet, RPC_URL } from './chains';

/**
 * Browser-wallet config (MetaMask, Rabby, Phantom, OKX… anything that announces itself via EIP-6963,
 * plus a generic injected fallback). Players connect a wallet that already holds MON and pay the
 * claim's network fee themselves. Module singleton so non-React code (the Phaser claim flow) can use it.
 */
export const wagmiConfig = createConfig({
  chains: [monadTestnet],
  connectors: [injected({ shimDisconnect: true })],
  multiInjectedProviderDiscovery: true,
  transports: { [monadTestnet.id]: http(RPC_URL) },
  ssr: true,
});

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig;
  }
}
