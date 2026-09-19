# PokeStonks

Walk a pixel overworld, get pulled into a live 1v1 battle against another person, and win **synthetic stock tokens on Monad**. Twelve stock tickers are the creatures ("BrokerMon"); the live Pyth price of a ticker literally buffs or drags its BrokerMon's damage.

- **Live PvP, server-authoritative.** Two browsers fight in real time. Clients send *inputs only* (a move and a tap-timing result); the server owns stats, RNG, turn order, HP and the winner. A bot fills in after 20s if nobody is around.
- **Real Gen-3 battle mechanics.** Damage formula, stat stages, STAB, crits, the six-type chart and move stats follow the mainline games. A tap-timing bar on every attack adds skill: Perfect forces a critical hit.
- **On-chain settlement on Monad testnet (10143).** The winner claims sSTOCK (the loser's stock) and, in human-vs-human wins, a BrokerMon NFT with fully on-chain metadata. Rewards are authorized by an EIP-712 voucher the server signs and relays itself, so players never sign or pay gas.
- **The market is in the combat maths.** Spot vs. EMA from Pyth sets a ±10% mood, computed by the server for battle and re-derived on-chain at claim time.

## Repo layout

```
apps/web        Next.js 16 + React 19: globe (MapLibre), title/broker-select, Phaser game (overworld + battle)
apps/server     Colyseus 0.18 authoritative battle server + claim relayer
packages/game-core       Pure shared engine: species, moves, type chart, damage, stats, protocol (unit-tested)
packages/contracts-abi   Generated ABIs + deployment address book
contracts       Foundry: BattleArena, BrokerMonNFT, SyntheticStock (109 tests)
```

`game-core` is the single source of truth for rules. The client uses it only to *preview*; the server uses it as authority, so the two can never drift.

## Run it locally

Requires Node 22+, pnpm 10.

```bash
pnpm install
cp apps/web/.env.local.example apps/web/.env.local   # optional: add a Privy app id for Google login
pnpm dev:server          # battle server on :2567   (GET /health)
pnpm dev:web             # web app on :3000
```

Without a Privy app id the app runs in **guest mode** (a local test wallet). Without a deployed arena the game is fully playable; wins just aren't claimable yet.

```bash
pnpm typecheck
pnpm test                # game-core (50) + server (24, including real-websocket end-to-end battles)
pnpm test:contracts      # forge test (needs Foundry)
```

## Deploy the contracts (Monad testnet)

1. Get testnet MON from the faucet: https://faucet.monad.xyz
2. `cp contracts/.env.example contracts/.env` and set `PRIVATE_KEY` (the file is gitignored).
3. `./contracts/deploy-testnet.sh`

The script checks chain and balance, runs the tests, deploys 12 synthetic tokens + the NFT + the arena, exports ABIs to `packages/contracts-abi`, and writes `apps/server/.env` so the local server relays rewards. Never commit a private key.

## Deploy the app

- **Web → Vercel.** Project root `apps/web` (enable "include files outside the root directory"). Set `NEXT_PUBLIC_COLYSEUS_URL=wss://<your-server>`, `NEXT_PUBLIC_PRIVY_APP_ID`, `NEXT_PUBLIC_RPC_URL`.
- **Server → any always-on host** (Render, Fly, Railway). Vercel cannot host the websocket server. `render.yaml` and `apps/server/Dockerfile` are provided. Set `ALLOWED_ORIGINS` to your Vercel URL and the secrets `CLAIM_SIGNER_PRIVATE_KEY` / `RELAYER_PRIVATE_KEY` in the host's dashboard.

## Security notes

- The server signing key is the trust root for rewards: whoever holds it can authorize mints. The arena enforces one claim per room, deadlines, low-s signatures, and cannot be bricked by the oracle. This is a **testnet, synthetic-token** demo; sSTOCK has no monetary value and is not a security.
- Battle stats are derived on the server from the species alone. A client-supplied stat is ignored.
- A player's chosen move is not in synced state until the turn resolves.

## Credits

All art (sprites, tiles, backdrops) and audio (music and SFX) are generated in code and original to this project. Press Start 2P by CodeMan38, SIL Open Font License. Prices by Pyth Network.
