import type { Metadata } from "next";
import "./globals.css";
import { Web3Providers } from "./web3/providers";

export const metadata: Metadata = {
  title: 'PokeStonks',
  description: 'Walk IRL, battle 1v1, win tokenized stocks on Monad.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Web3Providers>{children}</Web3Providers>
      </body>
    </html>
  );
}
