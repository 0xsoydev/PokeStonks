import { Server, matchMaker } from 'colyseus';
import { ROOM_NAME } from 'game-core';
import { config } from './config.ts';
import { BattleRoom } from './rooms/BattleRoom.ts';
import { claims } from './services.ts';

export function createGameServer(): Server {
  const startedAt = Date.now();
  const server = new Server({
    greet: false,
    express: (app) => {
      const allowed = config.allowedOrigins;
      app.use((req, res, next) => {
        const origin = req.headers.origin;
        if (origin && (allowed.length === 0 || allowed.includes(origin))) {
          res.setHeader('Access-Control-Allow-Origin', origin);
          res.setHeader('Vary', 'Origin');
        }
        next();
      });
      app.get('/health', async (_req, res) => {
        let rooms = 0;
        try { rooms = (await matchMaker.query({ name: ROOM_NAME })).length; } catch { /* stats are best-effort */ }
        res.json({ ok: true, uptimeS: Math.floor((Date.now() - startedAt) / 1000), rooms, rewards: claims.enabled });
      });
    },
  });
  // `mode` partitions the matchmaker: quick players only meet quick players, etc.
  server.define(ROOM_NAME, BattleRoom).filterBy(['mode']);
  return server;
}
