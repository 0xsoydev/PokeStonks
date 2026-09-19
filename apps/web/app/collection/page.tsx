import type { Metadata } from 'next';
import CollectionView from './CollectionView';

export const metadata: Metadata = {
  title: 'Your collection | PokeStonks',
  description: 'Your sSTOCK balances, BrokerMon collectibles and battle record on Monad testnet.',
};

export default function CollectionPage() {
  return <CollectionView />;
}
