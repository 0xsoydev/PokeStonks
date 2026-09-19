import type { Metadata, Viewport } from 'next';
import { Atkinson_Hyperlegible_Next } from 'next/font/google';
import './globals.css';
import { IdentityProvider } from './web3/identity';

/**
 * Body face: Atkinson Hyperlegible Next. Made for unambiguous characters (0/O, 1/l/I), which matters
 * here: hex addresses, tickers and token amounts are half the copy. Press Start 2P handles display.
 */
const body = Atkinson_Hyperlegible_Next({
  subsets: ['latin'],
  variable: '--font-atkinson',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'PokeStonks',
  description: 'Battle other players with stock-ticker monsters and win synthetic tokens on Monad testnet.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#183088',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={body.variable}>
      <body>
        <IdentityProvider>{children}</IdentityProvider>
      </body>
    </html>
  );
}
