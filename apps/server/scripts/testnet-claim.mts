/** Real-testnet proof: battle on the live server, get a voucher, submit BattleArena.claim from a wallet. */
import { readFileSync } from 'node:fs';
import { Client } from '@colyseus/sdk';
import { createPublicClient, createWalletClient, http, defineChain, parseEventLogs, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arenaAbi } from 'contracts-abi';
import { MSG } from 'game-core';
const key = readFileSync('../../contracts/.env', 'utf8').match(/PRIVATE_KEY=(0x[0-9a-fA-F]{64})/)![1] as Hex;
const acct = privateKeyToAccount(key);
const chain = defineChain({ id: 10143, name: 'Monad Testnet', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 }, rpcUrls: { default: { http: ['https://testnet-rpc.monad.xyz'] } } });
const pub = createPublicClient({ chain, transport: http() });
const wal = createWalletClient({ account: acct, chain, transport: http() });
const rand = () => `0x${[...crypto.getRandomValues(new Uint8Array(20))].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
function play(room: any) {
  const log: any = { seat: '', end: null, voucher: null, deny: null };
  room.onMessage(MSG.turnResolved, (m: any) => room.send(MSG.turnAck, { turnNo: m.turnNo }));
  room.onMessage(MSG.battleEnd, (m: any) => (log.end = m));
  room.onMessage(MSG.claimVoucher, (m: any) => (log.voucher = m));
  room.onMessage(MSG.claimStatus, (m: any) => (log.deny = m));
  for (const t of ['seat', 'mood', 'rejected']) room.onMessage(t, () => {});
  let last = -1, readied = false;
  setInterval(() => { const s = room.state; if (!s) return;
    if (!log.seat) s.players?.forEach((p: any, k: string) => { if (p.sessionId === room.sessionId) log.seat = k; });
    if (!log.seat) return;
    if (s.phase === 'INTRO' && !readied) { readied = true; room.send(MSG.ready, {}); }
    if (s.phase === 'COMMAND' && s.turnNo !== last && !s.players.get(log.seat)?.locked) { last = s.turnNo; room.send(MSG.lockMove, { turnNo: s.turnNo, moveId: s.players.get(log.seat).active.moves[0], tap: 'perfect' }); }
  }, 150);
  return log;
}
const until = async (p: () => any, ms: number, w: string) => { const t = Date.now(); while (!p()) { if (Date.now() - t > ms) throw new Error('timeout ' + w); await new Promise((r) => setTimeout(r, 100)); } };
const a = await new Client('ws://127.0.0.1:2567').joinOrCreate('battle', { wallet: rand(), speciesId: 'nvda', mode: 'quick' });
const b = await new Client('ws://127.0.0.1:2567').joinOrCreate('battle', { wallet: rand(), speciesId: 'tsla', mode: 'quick' });
const la = play(a), lb = play(b);
const dbg = setInterval(() => console.log('dbg', a.roomId, b.roomId, a.state?.phase, a.state?.turnNo, la.seat, lb.seat), 8000);
await until(() => la.end && lb.end, 240_000, 'battle'); clearInterval(dbg);
const [wr, wl] = la.end.winner === la.seat ? [a, la] : [b, lb];
console.log(`battle done in ${la.end.turns} turns, prize s${la.end.ticker}, claimable=${la.end.claimable}`);
wr.send(MSG.requestClaim, { to: acct.address });
await until(() => wl.voucher || wl.deny, 20_000, 'voucher');
if (wl.deny) throw new Error('denied: ' + JSON.stringify(wl.deny));
const v = wl.voucher, c = v.claim;
console.log('voucher signed for', c.winner);
const hash = await wal.writeContract({ address: v.arena, abi: arenaAbi, functionName: 'claim', args: [{ ...c, baseAmount: BigInt(c.baseAmount), deadline: BigInt(c.deadline) }, v.sig, []] });
const rc = await pub.waitForTransactionReceipt({ hash });
const ev: any = parseEventLogs({ abi: arenaAbi, logs: rc.logs, eventName: 'Claimed' })[0]?.args;
console.log(`TX ${rc.status}: https://testnet.monadvision.com/tx/${hash}`);
console.log(`minted ${Number(ev.minted) / 1e18} s${la.end.ticker}, NFT #${ev.nftId}`);
process.exit(0);
