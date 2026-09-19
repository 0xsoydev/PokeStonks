import type { Species } from './types';

const S = (x: Species): Species => x;

/**
 * The 12 BrokerMon. One per market/ticker, two per type. `num` matches
 * speciesId in contracts/markets.json. Feed ids are real Pyth Equity.US.* feeds.
 */
export const SPECIES: Record<string, Species> = {
  aapl: S({ id: 'aapl', num: 1, name: 'Applon', ticker: 'AAPL', affinity: 'Normal', sector: 'Blue-chip',
    base: { hp: 95, atk: 85, def: 85, spa: 55, spd: 80, spe: 55 },
    learnset: ['TACKLE', 'BODY_SLAM', 'SWORDS_DANCE', 'QUICK_ATTACK'],
    feedId: '0x49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688',
    colors: ['#c9ced6', '#3b3f4a'], tagline: 'Never sells. Never bends.' }),
  msft: S({ id: 'msft', num: 2, name: 'Microsaur', ticker: 'MSFT', affinity: 'Normal', sector: 'Blue-chip',
    base: { hp: 100, atk: 70, def: 90, spa: 60, spd: 90, spe: 45 },
    learnset: ['BODY_SLAM', 'QUICK_ATTACK', 'GROWL', 'TAIL_WHIP'],
    feedId: '0xd0ca23c1cc005e004ccf1db5bf76aeb6a49218f43dac3d4b275e92de12ded4d1',
    colors: ['#5aa2e8', '#1f3a5f'], tagline: 'Slow, steady, on every desktop.' }),
  tsla: S({ id: 'tsla', num: 3, name: 'Teslaq', ticker: 'TSLA', affinity: 'Electric', sector: 'Tech',
    base: { hp: 65, atk: 60, def: 55, spa: 105, spd: 70, spe: 110 },
    learnset: ['THUNDERBOLT', 'THUNDER_SHOCK', 'QUICK_ATTACK', 'AGILITY'],
    feedId: '0x16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1',
    colors: ['#f2d13a', '#b8202e'], tagline: 'Volatile. Fast. Hits like a tweet.' }),
  nvda: S({ id: 'nvda', num: 4, name: 'Nvidra', ticker: 'NVDA', affinity: 'Electric', sector: 'Tech',
    base: { hp: 70, atk: 55, def: 60, spa: 125, spd: 85, spe: 80 },
    learnset: ['THUNDERBOLT', 'THUNDER', 'CONFUSION', 'CALM_MIND'],
    feedId: '0xb1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593',
    colors: ['#76d13a', '#1c2a12'], tagline: 'Trains on your GPUs. Then on you.' }),
  xom: S({ id: 'xom', num: 5, name: 'Exxonyx', ticker: 'XOM', affinity: 'Grass', sector: 'Energy',
    base: { hp: 90, atk: 75, def: 85, spa: 90, spd: 80, spe: 45 },
    learnset: ['RAZOR_LEAF', 'VINE_WHIP', 'GROWL', 'BODY_SLAM'],
    feedId: '0x4a1a12070192e8db9a89ac235bb032342a390dde39389b4ee1ba8e41e7eae5d8',
    colors: ['#4fa860', '#8a2a2a'], tagline: 'Old growth. Deep roots.' }),
  cvx: S({ id: 'cvx', num: 6, name: 'Chevrune', ticker: 'CVX', affinity: 'Grass', sector: 'Energy',
    base: { hp: 105, atk: 70, def: 95, spa: 75, spd: 85, spe: 40 },
    learnset: ['RAZOR_LEAF', 'VINE_WHIP', 'TAIL_WHIP', 'QUICK_ATTACK'],
    feedId: '0xf464e36fd4ef2f1c3dc30801a9ab470dcdaaa0af14dd3cf6ae17a7fca9e051c5',
    colors: ['#3f8f6a', '#2a5fa8'], tagline: 'Dividends are its photosynthesis.' }),
  gme: S({ id: 'gme', num: 7, name: 'Gamestomp', ticker: 'GME', affinity: 'Fire', sector: 'Growth',
    base: { hp: 75, atk: 65, def: 60, spa: 110, spd: 65, spe: 85 },
    learnset: ['FLAMETHROWER', 'EMBER', 'QUICK_ATTACK', 'GROWL'],
    feedId: '0x6f9cd89ef1b7fd39f667101a91ad578b6c6ace4579d5f7f285a4b06aa4504be6',
    colors: ['#e2452b', '#f6b73c'], tagline: 'Diamond hands. Squeeze incoming.' }),
  amd: S({ id: 'amd', num: 8, name: 'Amdrake', ticker: 'AMD', affinity: 'Fire', sector: 'Growth',
    base: { hp: 70, atk: 65, def: 60, spa: 105, spd: 60, spe: 100 },
    learnset: ['FLAMETHROWER', 'EMBER', 'QUICK_ATTACK', 'AGILITY'],
    feedId: '0x3622e381dbca2efd1859253763b1adc63f7f9abb8e76da1aa8e638a57ccde93e',
    colors: ['#e9542f', '#20232a'], tagline: 'Runs hot, runs fast.' }),
  amzn: S({ id: 'amzn', num: 9, name: 'Amazoo', ticker: 'AMZN', affinity: 'Water', sector: 'Consumer',
    base: { hp: 100, atk: 65, def: 80, spa: 90, spd: 85, spe: 50 },
    learnset: ['SURF', 'WATER_GUN', 'BODY_SLAM', 'TAIL_WHIP'],
    feedId: '0xb5d0e0fa58a1f8b81498ae670ce93c872d14434b72c364885d4fa1b257cbb07a',
    colors: ['#f0a030', '#2b3a4a'], tagline: 'Delivers a tidal wave, next day.' }),
  nke: S({ id: 'nke', num: 10, name: 'Nikefin', ticker: 'NKE', affinity: 'Water', sector: 'Consumer',
    base: { hp: 80, atk: 75, def: 70, spa: 95, spd: 70, spe: 80 },
    learnset: ['SURF', 'WATER_GUN', 'QUICK_ATTACK', 'GROWL'],
    feedId: '0x67649450b4ca4bfff97cbaf96d2fd9e40f6db148cb65999140154415e4378e14',
    colors: ['#2f7de0', '#f4f4f4'], tagline: 'Just swims it.' }),
  coin: S({ id: 'coin', num: 11, name: 'Coinix', ticker: 'COIN', affinity: 'Psychic', sector: 'Crypto',
    base: { hp: 70, atk: 50, def: 65, spa: 120, spd: 95, spe: 75 },
    learnset: ['PSYCHIC', 'CONFUSION', 'CALM_MIND', 'QUICK_ATTACK'],
    feedId: '0xfee33f2a978bf32dd6b662b65ba8083c6773b494f8401194ec1870c640860245',
    colors: ['#3b6ff0', '#e8e6ff'], tagline: 'Reads the order book like a mind.' }),
  mstr: S({ id: 'mstr', num: 12, name: 'Stratyr', ticker: 'MSTR', affinity: 'Psychic', sector: 'Crypto',
    base: { hp: 85, atk: 55, def: 70, spa: 110, spd: 90, spe: 60 },
    learnset: ['PSYCHIC', 'CONFUSION', 'AGILITY', 'TACKLE'],
    feedId: '0xe1e80251e5f5184f2195008382538e847fafc36f751896889dd3d1b1f6111f09',
    colors: ['#f58a1f', '#5b2a86'], tagline: 'Convinced. Fully leveraged.' }),
};

export const SPECIES_LIST: Species[] = Object.values(SPECIES).sort((a, b) => a.num - b.num);
export const SPECIES_IDS = SPECIES_LIST.map((s) => s.id);

export function isSpeciesId(id: unknown): id is string {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(SPECIES, id);
}

export function getSpecies(id: string): Species {
  return isSpeciesId(id) ? SPECIES[id] : SPECIES.aapl;
}

export function speciesByNum(num: number): Species | undefined {
  return SPECIES_LIST.find((s) => s.num === num);
}
