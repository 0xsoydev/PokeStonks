/**
 * Smoke test for a running battle server: joins a practice room, plays a full battle vs the bot,
 * and exits 0 when it finishes.   pnpm --filter server smoke wss://your-server.onrender.com
 */
import { Client } from '@colyseus/sdk';
const url = process.argv[2] ?? 'ws://localhost:2567';
const r = await new Client(url).joinOrCreate('battle', { wallet: '0x' + 'b'.repeat(40), speciesId: 'gme', mode: 'practice', protocol: 1 });
let readied = false, last = -1, turns = 0, end: any = null;
for (const t of ['seat','mood','rejected','claimStatus','claimVoucher']) r.onMessage(t, () => {});
r.onMessage('turnResolved', (m: any) => { turns++; r.send('turnAck', { turnNo: m.turnNo }); });
r.onMessage('battleEnd', (m: any) => { end = m; });
const iv = setInterval(() => { const s = r.state; if (!s) return; let seat = ''; s.players?.forEach((p: any, k: string) => { if (p.sessionId === r.sessionId) seat = k; });
  if (s.phase === 'INTRO' && !readied) { readied = true; r.send('ready', {}); }
  if (seat && s.phase === 'COMMAND' && s.turnNo !== last && !s.players.get(seat)?.locked) { last = s.turnNo; r.send('lockMove', { turnNo: s.turnNo, moveId: s.players.get(seat).active.moves[0], tap: 'good' }); }
}, 200);
const t0 = Date.now();
while (!end && Date.now() - t0 < 180_000) await new Promise((res) => setTimeout(res, 300));
clearInterval(iv);
console.log(end ? `battle finished: ${turns} turns, winner ${end.winner}, reason ${end.reason}, ${((Date.now()-t0)/1000).toFixed(0)}s` : 'NO END');
process.exit(end ? 0 : 1);
