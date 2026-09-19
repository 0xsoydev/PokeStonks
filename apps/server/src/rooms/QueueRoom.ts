import { Room, Client, matchMaker } from 'colyseus';

export class QueueRoom extends Room {
  onCreate(options: any) {
    this.maxClients = 100;
    this.setState({});

    // 20s timeout → bot fill
    this.clock.setTimeout(() => {
      this.fillWithBot();
    }, 20_000);
  }

  async onJoin(client: Client, options: any) {
    // Store player info on client for matching
    client.userData = {
      wallet: options?.wallet ?? `anon_${client.sessionId}`,
      mode: options?.mode ?? 'quick',
      monId: options?.monId ?? 'BROKER_A',
      affinity: options?.affinity ?? 'electric',
      level: options?.level ?? 5,
      maxHp: options?.maxHp ?? 52,
      atk: options?.atk ?? 48,
      def: options?.def ?? 40,
      spa: options?.spa ?? 65,
      spd: options?.spd ?? 50,
      spe: options?.spe ?? 55,
      learnset: options?.learnset ?? ['TACKLE', 'THUNDER', 'QUICK_ATTACK', 'GROWL'],
    };

    // Try to match immediately
    this.tryMatch();
  }

  onLeave(client: Client) {
    // Nothing special needed
  }

  private tryMatch() {
    const clients = Array.from(this.clients);
    if (clients.length < 2) return;

    // Take first two clients
    const a = clients[0];
    const b = clients[1];
    const aData = a.userData;
    const bData = b.userData;

    // Create BattleRoom
    this.createBattleRoom(a, b, aData, bData);
  }

  private async createBattleRoom(
    a: Client, b: Client,
    aData: any, bData: any,
  ) {
    try {
      const room = await matchMaker.createRoom('battle', {
        tickerA: aData.monId,
        tickerB: bData.monId,
        stockBuffA: 1,
        stockBuffB: 1,
      });

      // Create seat reservations
      const seatA = await matchMaker.reserveSeatFor(room, aData);
      const seatB = await matchMaker.reserveSeatFor(room, bData);

      // Send reservations to clients
      a.send('seatReservation', {
        roomId: room.roomId,
        sessionId: seatA.sessionId,
      });
      b.send('seatReservation', {
        roomId: room.roomId,
        sessionId: seatB.sessionId,
      });

      // Remove from queue
      a.close();
      b.close();
    } catch (err) {
      console.error('Failed to create battle room:', err);
    }
  }

  private async fillWithBot() {
    const clients = Array.from(this.clients);
    if (clients.length === 0) return;

    // Match remaining humans with bots
    for (const client of clients) {
      const userData = client.userData;
      try {
        const room = await matchMaker.createRoom('battle', {
          tickerA: userData.monId,
          tickerB: 'BROKER_B',
          stockBuffA: 1,
          stockBuffB: 1,
        });

        // Create reservation for the human
        const seatHuman = await matchMaker.reserveSeatFor(room, userData);
        client.send('seatReservation', {
          roomId: room.roomId,
          sessionId: seatHuman.sessionId,
        });

        // Create bot reservation
        const seatBot = await matchMaker.reserveSeatFor(room, {
          wallet: `bot_${Date.now()}`,
          isBot: true,
          monId: 'BROKER_B',
          affinity: 'Psychic',
          level: 5,
          maxHp: 48,
          atk: 42,
          def: 38,
          spa: 55,
          spd: 48,
          spe: 60,
          learnset: ['TACKLE', 'GROWL'],
        });
        // The bot slot will be filled by BattleRoom.onJoin

        client.close();
      } catch (err) {
        console.error('Bot fill failed:', err);
      }
    }
  }
}
