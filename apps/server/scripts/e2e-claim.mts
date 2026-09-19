/**
 * End-to-end reward test: two real websocket clients play a battle, the winner claims through the
 * relayer, and we verify the mint on-chain. Point it at a local fork of Monad testnet (anvil) — see README.
 *
 *   E2E_RPC=http://127.0.0.1:8546 ARENA_ADDRESS=0x… CLAIM_SIGNER_PRIVATE_KEY=0x… RELAYER_PRIVATE_KEY=0x… \
 *     tsx scripts/e2e-claim.mts
 */
process.env.FAST_TIMING = '1';
process.env.RPC_URL = process.env.E2E_RPC ?? process.env.RPC_URL ?? 'http://127.0.0.1:8546';
for (const k of ['ARENA_ADDRESS', 'CLAIM_SIGNER_PRIVATE_KEY', 'RELAYER_PRIVATE_KEY']) {
  if (!process.env[k]) { console.error(`missing env ${k}`); process.exit(2); }
}

const { createPublicClient, http, getAddress } = await import('viem');
const { arenaAbi, brokerMonAbi, syntheticStockAbi, tickerToBytes32 } = await import('contracts-abi');
const { Client } = await import('@colyseus/sdk');
const { createGameServer } = await import('../src/server.ts');
const { MSG } = await import('game-core');

const PORT = 2588;
const server = createGameServer();
await server.listen(PORT);
const pub = createPublicClient({ transport: http(process.env.RPC_URL) });
const arena = process.env.ARENA_ADDRESS as `0x${string}`;

const rand = () => getAddress(`0x${[...crypto.getRandomValues(new Uint8Array(20))].map((b) => b.toString(16).padStart(2, '0')).join('')}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function play(room: any) {
  const log: any = { seat: '', end: null, claim: [] as any[] };
  room.onMessage(MSG.turnResolved, (m: any) => room.send(MSG.turnAck, { turnNo: m.turnNo }));
  room.onMessage(MSG.battleEnd, (m: any) => (log.end = m));
  room.onMessage(MSG.claimStatus, (m: any) => log.claim.push(m));
  room.onMessage(MSG.seat, () => {});
  let last = -1;
  const iv = setInterval(() => {
    const s = room.state; if (!s) return;
    if (!log.seat) s.players?.forEach((p: any, k: string) => { if (p.sessionId === room.sessionId) log.seat = k; });
    if (!log.seat) return;
    if (s.phase === 'INTRO') room.send(MSG.ready, {});
    if (s.phase === 'COMMAND' && s.turnNo !== last && !s.players.get(log.seat)?.locked) {
      last = s.turnNo;
      const me = s.players.get(log.seat);
      room.send(MSG.lockMove, { turnNo: s.turnNo, moveId: me.active.moves[0], tap: 'good' });
    }
  }, 20);
  log.stop = () => clearInterval(iv);
  return log;
}

const until = async (p: () => boolean, ms: number, what: string) => {
  const t0 = Date.now();
  while (!p()) { if (Date.now() - t0 > ms) throw new Error(`timeout: ${what}`); await sleep(50); }
};

const w1 = rand(), w2 = rand();
const a = await new Client(`ws://127.0.0.1:${PORT}`).joinOrCreate('battle', { wallet: w1, speciesId: 'tsla', mode: 'quick' });
const b = await new Client(`ws://127.0.0.1:${PORT}`).joinOrCreate('battle', { wallet: w2, speciesId: 'amzn', mode: 'quick' });
const la = play(a), lb = play(b);
await until(() => la.end && lb.end, 30_000, 'battle end');
la.stop(); lb.stop();

const winnerIsA = la.end.winner === la.seat;
const winner = winnerIsA ? a : b, wl = winnerIsA ? la : lb;
const winnerWallet = winnerIsA ? w1 : w2;
console.log(`battle over: winner=${winnerWallet} prize=s${la.end.ticker} claimable=${la.end.claimable} turns=${la.end.turns}`);
if (!la.end.claimable) throw new Error('expected the match to be claimable');

winner.send(MSG.requestClaim, {});
await until(() => wl.claim.some((c: any) => c.state === 'confirmed' || c.state === 'failed' || c.state === 'ineligible'), 90_000, 'claim result');
const final = wl.claim.at(-1);
console.log('claim states:', wl.claim.map((c: any) => c.state).join(' -> '));
if (final.state !== 'confirmed') throw new Error(`claim did not confirm: ${JSON.stringify(final)}`);

const market = await pub.readContract({ address: arena, abi: arenaAbi, functionName: 'markets', args: [tickerToBytes32(la.end.ticker)] }) as any;
const token = (market.token ?? market[0]) as `0x${string}`;
const bal = await pub.readContract({ address: token, abi: syntheticStockAbi, functionName: 'balanceOf', args: [winnerWallet] }) as bigint;
console.log(`tx ${final.txHash}`);
console.log(`minted ${final.minted} wei | on-chain balance ${bal} wei | buffBps ${final.buffBps} | nft ${final.nftId ?? 'none'}`);
if (bal !== BigInt(final.minted)) throw new Error('on-chain balance != minted');
if (final.nftId) {
  const brokerMon = await pub.readContract({ address: arena, abi: arenaAbi, functionName: 'brokerMon' }) as `0x${string}`;
  const owner = await pub.readContract({ address: brokerMon, abi: brokerMonAbi, functionName: 'ownerOf', args: [BigInt(final.nftId)] });
  const uri = await pub.readContract({ address: brokerMon, abi: brokerMonAbi, functionName: 'tokenURI', args: [BigInt(final.nftId)] }) as string;
  console.log(`NFT #${final.nftId} owner ${owner} tokenURI ${uri.slice(0, 60)}...`);
  if (getAddress(owner as string) !== winnerWallet) throw new Error('NFT not owned by winner');
}
const wins = await pub.readContract({ address: arena, abi: arenaAbi, functionName: 'wins', args: [winnerWallet] });
console.log(`on-chain wins[winner] = ${wins}`);

// A second request for the same room must be idempotent (no double mint).
winner.send(MSG.requestClaim, {});
await sleep(600);
const bal2 = await pub.readContract({ address: token, abi: syntheticStockAbi, functionName: 'balanceOf', args: [winnerWallet] }) as bigint;
if (bal2 !== bal) throw new Error('replayed claim minted twice!');
console.log('replay guarded: balance unchanged');

console.log('\nE2E CLAIM OK');
await a.leave(); await b.leave();
await server.gracefullyShutdown(false).catch(() => {});
process.exit(0);
