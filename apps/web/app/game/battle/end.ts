import * as Phaser from 'phaser';
import type { BattleEnd, ClaimStatus } from 'game-core';
import { audio } from '../audio';
import { C, H, W, drawFrame, formatToken, txt } from './ui';

export interface EndOptions {
  won: boolean;
  end: BattleEnd;
  onClaim: () => void;
  onContinue: () => void;
}

const REASON: Record<string, string> = {
  faint: '', flee: 'The opponent ran away.', forfeit: 'The opponent forfeited.', disconnect: 'The opponent lost connection.',
};

/** Result card with the claim flow. Claim progress is streamed into `setClaim`. */
export class EndOverlay {
  private objs: Phaser.GameObjects.GameObject[] = [];
  private status!: Phaser.GameObjects.Text;
  private claimBtn?: { g: Phaser.GameObjects.Graphics; t: Phaser.GameObjects.Text; z: Phaser.GameObjects.Zone };
  private keys: Array<[string, () => void]> = [];

  constructor(private scene: Phaser.Scene, private o: EndOptions) {
    const { won, end } = o;
    const dim = scene.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.72).setDepth(100).setAlpha(0);
    scene.tweens.add({ targets: dim, alpha: 0.72, duration: 300 });
    const panel = scene.add.graphics().setDepth(101);
    drawFrame(panel, W / 2 - 330, 130, 660, 380, { fill: C.navy, border: won ? C.gold : C.grayDark, borderW: 5, inner: C.white });
    const title = txt(scene, W / 2, 190, won ? 'YOU WIN!' : 'YOU LOSE', 38, won ? '#ffd23c' : '#f85858', { stroke: '#181818', strokeThickness: 8 }).setOrigin(0.5).setDepth(102);
    scene.tweens.add({ targets: title, scale: { from: 0.2, to: 1 }, duration: 320, ease: 'Back.easeOut' });
    if (won) scene.tweens.add({ targets: title, scale: 1.06, duration: 520, yoyo: true, repeat: -1, delay: 320, ease: 'Sine.easeInOut' });

    const sub = REASON[end.reason] || (won ? 'The opponent fainted.' : 'Your BrokerMon fainted.');
    const s1 = txt(scene, W / 2, 246, sub, 12, '#ffffff').setOrigin(0.5).setDepth(102);
    const s2 = txt(scene, W / 2, 274, `${end.turns} turn${end.turns === 1 ? '' : 's'}`, 10, '#a8b8f8').setOrigin(0.5).setDepth(102);
    this.objs.push(dim, panel, title, s1, s2);

    if (won && end.claimable) {
      const prize = txt(scene, W / 2, 318, `PRIZE: s${end.ticker}`, 16, '#f8d858').setOrigin(0.5).setDepth(102);
      this.objs.push(prize);
    }
    this.status = txt(scene, W / 2, 358, won && !end.claimable ? 'Rewards are only paid in live matches.' : '', 11, '#ffffff', { align: 'center', wordWrap: { width: 600 }, lineSpacing: 12 }).setOrigin(0.5, 0).setDepth(102);
    this.objs.push(this.status);

    let bx = W / 2 - 110;
    if (won && end.claimable) {
      this.claimBtn = this.button('CLAIM REWARD', W / 2 - 235, 430, 250, C.green, C.greenDark, () => o.onClaim());
      bx = W / 2 + 20;
    }
    this.button('CONTINUE', bx, 430, 210, C.gray, C.grayDark, () => o.onContinue(), true);

    audio.bgm(won ? 'victory' : 'defeat');
    audio.sfx(won ? 'win' : 'lose');
  }

  private button(label: string, x: number, y: number, w: number, color: number, dark: number, cb: () => void, primaryKey = false) {
    const h = 56;
    const g = this.scene.add.graphics().setDepth(102);
    const draw = (hover: boolean) => { g.clear(); drawFrame(g, x, y, w, h, { fill: hover ? color : dark, border: C.white, borderW: 3 }); };
    draw(false);
    const t = txt(this.scene, x + w / 2, y + h / 2, label, 13, '#ffffff').setOrigin(0.5).setDepth(103);
    const z = this.scene.add.zone(x + w / 2, y + h / 2, w, h).setDepth(104).setInteractive({ useHandCursor: true });
    z.on('pointerover', () => draw(true)); z.on('pointerout', () => draw(false));
    z.on('pointerdown', () => { audio.sfx('menu_select'); cb(); });
    this.objs.push(g, t, z);
    if (primaryKey) {
      const k = () => { audio.sfx('menu_select'); cb(); };
      this.scene.input.keyboard?.on('keydown-ENTER', k);
      this.keys.push(['ENTER', k]);
    }
    return { g, t, z };
  }

  setClaim(s: ClaimStatus) {
    const btn = this.claimBtn;
    const lock = (msg: string, color: string) => { this.status.setText(msg).setColor(color); };
    if (btn) { btn.z.disableInteractive(); btn.t.setAlpha(0.5); }
    switch (s.state) {
      case 'signing': lock('Getting your reward voucher...', '#f8d858'); break;
      case 'wallet': lock('Confirm the claim in your wallet.\nYou pay a small MON network fee.', '#f8d858'); break;
      case 'submitted': lock('Settling on Monad...', '#f8d858'); break;
      case 'confirmed': {
        const amt = formatToken(s.minted);
        const buff = s.buffBps ? `  ${s.buffBps > 0 ? 'BULL BONUS +10%' : 'BEAR DRAG -10%'}` : '';
        lock(`+${amt} s${this.o.end.ticker} claimed!${buff}${s.nftId ? `\nBrokerMon #${s.nftId} added to your collection.` : ''}`, '#58d858');
        btn?.t.setText('CLAIMED');
        audio.sfx('claim');
        break;
      }
      case 'failed':
        lock(`Claim failed: ${s.error ?? 'unknown error'}`, '#f85858');
        if (btn) { btn.z.setInteractive({ useHandCursor: true }); btn.t.setAlpha(1).setText('TRY AGAIN'); }
        audio.sfx('error');
        break;
      case 'ineligible': lock(s.error ?? 'This match does not pay rewards.', '#f8a858'); break;
      default: break;
    }
  }

  destroy() {
    for (const [k, fn] of this.keys) this.scene.input.keyboard?.off(`keydown-${k}`, fn);
    this.keys = [];
    this.objs.forEach((o) => o.destroy());
    this.objs = [];
  }
}
