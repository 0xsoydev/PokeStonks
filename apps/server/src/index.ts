import { Server } from 'colyseus';
import express from 'express';
import { createServer } from 'http';
import { config } from './config.ts';
import { BattleRoom } from './rooms/BattleRoom.ts';
import { QueueRoom } from './rooms/QueueRoom.ts';

const app = express();
const httpServer = createServer(app);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const gameServer = new Server({ server: httpServer });

gameServer.define('battle', BattleRoom);
gameServer.define('queue', QueueRoom);

gameServer.listen(config.port).then(() => {
  console.log(`Colyseus server listening on port ${config.port}`);
});
