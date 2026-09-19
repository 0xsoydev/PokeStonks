import { config } from './config.ts';
import { createGameServer } from './server.ts';
import { claims } from './services.ts';

createGameServer()
  .listen(config.port)
  .then(() => {
    console.log(`[pokestonks] battle server on :${config.port} — rewards ${claims.enabled ? 'ON' : 'OFF (no signer/arena configured)'}`);
  });
