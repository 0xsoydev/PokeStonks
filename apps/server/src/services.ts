import { PriceService } from './web3/prices.ts';
import { ClaimService } from './web3/claims.ts';

export const prices = new PriceService();
export const claims = new ClaimService(prices);
