'use client';

import '@getpara/react-sdk/styles.css';
import { Environment, ParaProvider } from '@getpara/react-sdk';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { http } from 'wagmi';
import { monad, monadTestnet } from 'viem/chains';

const queryClient = new QueryClient();

// ponytail: BETA + testnet-first, Google + MetaMask only; flip to PRODUCTION / monad-first at launch
export default function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ParaProvider
        paraClientConfig={{ apiKey: process.env.NEXT_PUBLIC_PARA_API_KEY ?? '', env: Environment.BETA }}
        config={{ appName: 'PokeStonks' }}
        paraModalConfig={{ oAuthMethods: ['GOOGLE'], disableEmailLogin: true, disablePhoneLogin: true, recoverySecretStepEnabled: true }}
        externalWalletConfig={{
          evmConnector: {
            config: {
              chains: [monadTestnet, monad],
              transports: {
                [monadTestnet.id]: http('https://testnet-rpc.monad.xyz'),
                [monad.id]: http('https://rpc.monad.xyz'),
              },
            },
          },
          wallets: ['METAMASK'],
        }}
      >
        {children}
      </ParaProvider>
    </QueryClientProvider>
  );
}
