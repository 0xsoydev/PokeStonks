import { describe, it, expect, beforeAll } from 'vitest';
import { verifyTypedData, getAddress, keccak256, toBytes } from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';

const signerKey = generatePrivateKey();
const ARENA = '0x7FDbBe8458c0F2123A10FF8eFB90CE3D2A8Da246';
const WINNER = '0x1111111111111111111111111111111111111111';
const LOSER = '0x2222222222222222222222222222222222222222';

let VoucherService: typeof import('./claims.ts').VoucherService;
let domainOf: typeof import('contracts-abi').arenaEip712Domain;
let types: typeof import('contracts-abi').claimEip712Types;

beforeAll(async () => {
  // config.ts reads env at import time.
  process.env.CLAIM_SIGNER_PRIVATE_KEY = signerKey;
  process.env.ARENA_ADDRESS = ARENA;
  process.env.PYTH_API_KEY = '';
  process.env.MAX_CLAIMS_PER_HOUR = '2';
  ({ VoucherService } = await import('./claims.ts'));
  ({ arenaEip712Domain: domainOf, claimEip712Types: types } = await import('contracts-abi'));
});

const fakePrices = { updateData: async () => ['0xabcd'] as `0x${string}`[] } as never;
const req = (over: Partial<Parameters<InstanceType<typeof VoucherService>['issue']>[0]> = {}) => ({
  roomId: 'room1', roomStamp: 42, to: WINNER, loser: LOSER as `0x${string}`, ticker: 'TSLA', prizeSpeciesId: 'tsla',
  humanFoe: true, captureSpeciesNum: 3, level: 50, ...over,
});

describe('VoucherService', () => {
  it('signs an EIP-712 Claim that verifies against the arena domain', async () => {
    const svc = new VoucherService(fakePrices);
    const r = await svc.issue(req());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = r.voucher;
    const c = v.claim;
    const ok = await verifyTypedData({
      address: privateKeyToAccount(signerKey).address,
      domain: domainOf(10143, ARENA),
      types,
      primaryType: 'Claim',
      message: { ...c, winner: c.winner as `0x${string}`, loser: c.loser as `0x${string}`, roomId: c.roomId as `0x${string}`, ticker: c.ticker as `0x${string}`, baseAmount: BigInt(c.baseAmount), deadline: BigInt(c.deadline) },
      signature: v.sig as `0x${string}`,
    });
    expect(ok).toBe(true);
    expect(getAddress(c.winner)).toBe(getAddress(WINNER));
    expect(c.roomId).toBe(keccak256(toBytes('room1:42')));
    expect(c.captureSpeciesId).toBe(3);
    expect(v.priceUpdate).toEqual(['0xabcd']);
    expect(v.arena).toBe(ARENA);
    expect(Number(c.deadline)).toBeGreaterThan(Date.now() / 1000 + 20 * 60);
  });

  it('bot wins pay the small amount and never mint an NFT', async () => {
    const svc = new VoucherService(fakePrices);
    const r = await svc.issue(req({ roomId: 'bot', humanFoe: false, loser: undefined }));
    expect(r.ok && r.voucher.claim.captureSpeciesId).toBe(0);
    expect(r.ok && BigInt(r.voucher.claim.baseAmount) < BigInt('100000000000000000')).toBe(true);
  });

  it('is idempotent per room and refuses to re-issue the room to a different wallet', async () => {
    const svc = new VoucherService(fakePrices);
    const a = await svc.issue(req({ roomId: 'same' }));
    const b = await svc.issue(req({ roomId: 'same' }));
    expect(a.ok && b.ok && a.voucher.sig === b.voucher.sig).toBe(true);
    const c = await svc.issue(req({ roomId: 'same', to: '0x3333333333333333333333333333333333333333' }));
    expect(c.ok).toBe(false);
  });

  it('rejects bad recipients and paying the loser', async () => {
    const svc = new VoucherService(fakePrices);
    expect((await svc.issue(req({ roomId: 'x1', to: 'nope' }))).ok).toBe(false);
    expect((await svc.issue(req({ roomId: 'x2', to: LOSER }))).ok).toBe(false);
  });

  it('rate-limits vouchers per wallet', async () => {
    const svc = new VoucherService(fakePrices);
    const w = '0x4444444444444444444444444444444444444444';
    expect((await svc.issue(req({ roomId: 'r1', to: w }))).ok).toBe(true);
    expect((await svc.issue(req({ roomId: 'r2', to: w }))).ok).toBe(true);
    expect((await svc.issue(req({ roomId: 'r3', to: w }))).ok).toBe(false);
  });
});
