import { PriceService } from './web3/prices.ts';
import { VoucherService } from './web3/claims.ts';

export const prices = new PriceService();
export const vouchers = new VoucherService(prices);
