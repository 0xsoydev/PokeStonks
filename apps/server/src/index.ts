import { config } from './config.ts';
import { createGameServer } from './server.ts';
import { vouchers } from './services.ts';

if (!config.pythApiKey) console.warn('[pokestonks] PYTH_API_KEY not set: live stock moods and on-chain price buffs are OFF (Hermes now requires a free key).');

createGameServer()
  .listen(config.port)
  .then(() => {
    console.log(`[pokestonks] battle server on :${config.port} — rewards ${vouchers.enabled ? 'ON' : 'OFF (set CLAIM_SIGNER_PRIVATE_KEY + ARENA_ADDRESS)'}`);
  });
