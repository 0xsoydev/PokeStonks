import Phaser from 'phaser';
import { BattleSession } from '../net/session';
import { EventBus } from '../net/events';
import { audio } from '../audio';
import { playEncounterIntro, playVersus, clearCutscene } from '../overworld/cutscene';
import { C, H, W, drawFrame, isTouch, txt } from '../battle/ui';

export type EncounterKind = 'wild' | 'trainer';

export interface EncounterContext {
  /** Market/route the player is roaming (drives the bot's route table). */
  marketId: string;
  kind: EncounterKind;
  /** Purely cosmetic hint shown in the intro text. */
  foeHintSpeciesId?: string;
  /** Trainer display name for line-of-sight encounters. */
  trainerName?: string;
}

const COVER_DEPTH = 10_100;

/**
 * Overworld → battle → overworld. Matchmaking starts the instant the encounter fires and runs
 * underneath the flash/wipe cutscene, so in the common case there is no visible wait.
 * Resolves when the battle is fully finished and the overworld may resume.
 */
export async function runEncounter(scene: Phaser.Scene, ctx: EncounterContext): Promise<void> {
  const speciesId = scene.registry.get('speciesId') as string | undefined;
  const wallet = scene.registry.get('wallet') as string | undefined;
  if (!speciesId || !wallet) {
    EventBus.emit('toast', { text: 'Sign in and pick a BrokerMon first.', tone: 'bad' });
    return;
  }

  const kb = scene.input.keyboard;
  const prevInput = scene.input.enabled;
  scene.input.enabled = false;
  if (kb) kb.enabled = false;
  let session: BattleSession | null = null;

  try {
    const joining = BattleSession.join({ wallet, speciesId, mode: 'quick', marketId: ctx.marketId })
      .then((s) => ({ s }), (e: Error) => ({ e }));

    await playEncounterIntro(scene, { kind: ctx.kind });

    const joined = await joining;
    if ('e' in joined) {
      await showNotice(scene, joined.e.message);
      clearCutscene(scene);
      return;
    }
    session = joined.s;

    if (!session.bothSeated()) {
      const found = await waitForOpponent(scene, session);
      if (!found) {
        await session.leave();
        session = null;
        clearCutscene(scene);
        EventBus.emit('toast', { text: 'Left the queue.', tone: 'info' });
        return;
      }
    }

    const snap = session.snapshot()!;
    const mySeat = session.mySeat() ?? 'A';
    const me = snap.players[mySeat]!;
    const foe = snap.players[mySeat === 'A' ? 'B' : 'A']!;
    await playVersus(
      scene,
      { speciesId: me.mon.speciesId, name: me.mon.name },
      { speciesId: foe.mon.speciesId, name: foe.mon.name, isBot: foe.isBot },
      { kind: ctx.kind },
    );

    EventBus.emit('battle:start', { roomId: session.roomId, seat: mySeat, foeSpeciesId: foe.mon.speciesId, isBot: foe.isBot });
    const closed = new Promise<void>((res) => { EventBus.once('battle:closed', () => res()); });
    scene.scene.launch('Battle', { session, marketId: ctx.marketId, kind: ctx.kind, trainerName: ctx.trainerName });
    scene.scene.bringToTop('Battle');
    scene.scene.pause();
    await closed;
    scene.scene.resume();
    clearCutscene(scene);
    audio.bgm('overworld');
  } catch (err) {
    console.error('[encounter] failed', err);
    clearCutscene(scene);
    EventBus.emit('toast', { text: 'The encounter could not start. Try again.', tone: 'bad' });
  } finally {
    if (session) await session.leave();
    scene.input.enabled = prevInput;
    if (kb) kb.enabled = true;
  }
}

/** Searching overlay over the black cutscene cover. Resolves true when a rival (human or bot) is seated. */
function waitForOpponent(scene: Phaser.Scene, session: BattleSession): Promise<boolean> {
  return new Promise((resolve) => {
    const g = scene.add.graphics().setScrollFactor(0).setDepth(COVER_DEPTH);
    drawFrame(g, W / 2 - 300, H / 2 - 110, 600, 220, { fill: C.navy, border: C.gold, borderW: 4, inner: C.white });
    const title = txt(scene, W / 2, H / 2 - 66, 'SEARCHING FOR A RIVAL', 16, '#ffffff').setOrigin(0.5).setScrollFactor(0).setDepth(COVER_DEPTH + 1);
    const sub = txt(scene, W / 2, H / 2 - 20, '', 11, '#f8d858').setOrigin(0.5).setScrollFactor(0).setDepth(COVER_DEPTH + 1);
    const hint = txt(scene, W / 2, H / 2 + 52, isTouch() ? 'TAP TO CANCEL' : 'PRESS ESC OR CLICK TO CANCEL', 9, '#a8b8f8').setOrigin(0.5).setScrollFactor(0).setDepth(COVER_DEPTH + 1);
    const dots = scene.add.graphics().setScrollFactor(0).setDepth(COVER_DEPTH + 1);
    const zone = scene.add.zone(W / 2, H / 2, W, H).setScrollFactor(0).setDepth(COVER_DEPTH + 2).setInteractive();
    audio.bgm('title');

    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      window.clearInterval(iv);
      window.removeEventListener('keydown', onKey);
      [g, title, sub, hint, dots, zone].forEach((o) => o.destroy());
      resolve(ok);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') finish(false); };
    window.addEventListener('keydown', onKey);
    zone.on('pointerdown', () => finish(false));

    let n = 0;
    const iv = window.setInterval(() => {
      if (session.bothSeated()) return finish(true);
      if (session.conn === 'closed') return finish(false);
      const snap = session.snapshot();
      const s = Math.ceil((snap?.waitMs ?? 0) / 1000);
      sub.setText(s > 0 ? `A Broker bot joins in ${s}s` : 'Matching you with a Broker bot...');
      dots.clear();
      for (let i = 0; i < 3; i++) { dots.fillStyle(C.gold, (n + i) % 3 === 0 ? 1 : 0.25); dots.fillRect(W / 2 - 30 + i * 24, H / 2 + 12, 14, 14); }
      n++;
    }, 220);
  });
}

async function showNotice(scene: Phaser.Scene, message: string): Promise<void> {
  const g = scene.add.graphics().setScrollFactor(0).setDepth(COVER_DEPTH);
  drawFrame(g, W / 2 - 320, H / 2 - 80, 640, 160, { fill: C.navy, border: C.red, borderW: 4, inner: C.white });
  const t = txt(scene, W / 2, H / 2, message, 12, '#ffffff', { align: 'center', wordWrap: { width: 560 }, lineSpacing: 10 }).setOrigin(0.5).setScrollFactor(0).setDepth(COVER_DEPTH + 1);
  audio.sfx('error');
  await new Promise<void>((res) => window.setTimeout(res, 2600));
  g.destroy(); t.destroy();
}
