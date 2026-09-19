import * as Phaser from 'phaser';
import { SPECIES_LIST, getMarket } from 'game-core';
import { artSteps, type ArtStep } from '../art/register';
import { isRouteTheme, type RouteTheme } from '../art/themes';
import { buildExchangeInterior, buildRouteMap } from '../overworld/maps';
import { C, FONT, H, W, drawFrame, notched } from '../overworld/ui';

const MIN_SPLASH_MS = 520;

/**
 * Branded splash whose progress bar tracks real work: every texture group of the procedural art
 * engine and both map builds are separate steps, run one per frame so the bar visibly fills.
 */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  create() {
    const started = this.time.now;
    const cam = this.cameras.main;
    cam.setBackgroundColor('#0f1f5c');
    cam.fadeIn(180, 15, 31, 92);

    // backdrop: soft diagonal stripes so the splash is not a flat colour
    const bg = this.add.graphics();
    bg.fillStyle(0x142a78, 1);
    for (let i = -6; i < 16; i++) {
      bg.beginPath();
      bg.moveTo(i * 90, 0); bg.lineTo(i * 90 + 44, 0); bg.lineTo(i * 90 + 44 - 260, H); bg.lineTo(i * 90 - 260, H);
      bg.closePath(); bg.fillPath();
    }

    const title = this.add.text(W / 2, 200, 'POKESTONKS', {
      fontFamily: FONT, fontSize: '64px', color: '#f8d858', stroke: '#181818', strokeThickness: 12,
    }).setOrigin(0.5).setResolution(2);
    this.add.text(W / 2 + 4, 200 + 4, 'POKESTONKS', { fontFamily: FONT, fontSize: '64px', color: '#a8781c' }).setOrigin(0.5).setResolution(2).setDepth(-1);
    this.add.text(W / 2, 262, 'WALK. BATTLE. TRADE.', { fontFamily: FONT, fontSize: '14px', color: '#f8f8d0' }).setOrigin(0.5).setResolution(2);
    this.tweens.add({ targets: title, y: 194, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // progress bar
    const bx = W / 2 - 280, by = 360, bw = 560, bh = 34;
    const frame = this.add.graphics();
    drawFrame(frame, bx - 8, by - 8, bw + 16, bh + 16, { fill: C.navyDark, border: C.gold, borderW: 5, inner: C.white });
    const fill = this.add.graphics();
    const label = this.add.text(W / 2, by + bh + 34, 'WAKING THE MARKETS...', { fontFamily: FONT, fontSize: '11px', color: '#c8c8f0' }).setOrigin(0.5).setResolution(2);
    const setProgress = (p: number, text: string) => {
      fill.clear();
      const w = Math.round((bw - 8) * p);
      if (w > 0) {
        notched(fill, bx + 4, by + 4, w, bh - 8, 0x58d858, 1, 2);
        fill.fillStyle(0xa8f8a8, 1);
        fill.fillRect(bx + 6, by + 6, Math.max(0, w - 4), 4);
      }
      label.setText(text.toUpperCase());
    };
    setProgress(0, 'WAKING THE MARKETS...');

    // BrokerMon roll-call: each portrait pops in as soon as its texture exists
    const shown = new Set<string>();
    const slotX = (i: number) => W / 2 - 11 * 34 + i * 68;
    const rollCall = () => {
      SPECIES_LIST.forEach((sp, i) => {
        const key = `mon_${sp.id}_front`;
        if (shown.has(sp.id) || !this.textures.exists(key)) return;
        shown.add(sp.id);
        const img = this.add.image(slotX(i) + 0, 548, key).setDisplaySize(60, 60).setScale(0);
        this.tweens.add({ targets: img, scale: 60 / 128, duration: 260, ease: 'Back.easeOut' });
        this.tweens.add({ targets: img, y: 542, duration: 700 + (i % 4) * 90, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: 300 });
      });
    };

    const marketId = (this.registry.get('marketId') as string | undefined) ?? 'aapl';
    const market = getMarket(marketId);
    const theme: RouteTheme = isRouteTheme(market?.routeTheme) ? (market!.routeTheme as RouteTheme) : 'bluechip';
    const routeName = market?.name ?? 'Route';

    const steps: ArtStep[] = [
      ...artSteps(this).slice(1),
      { label: 'Surveying the route', run: () => this.registerMap('route', buildRouteMap(theme, marketId, { routeName })) },
      { label: 'Building The Exchange', run: () => this.registerMap('exchange', buildExchangeInterior(theme, routeName)) },
    ];

    let i = 0;
    const next = () => {
      if (!this.sys.isActive()) return;
      if (i >= steps.length) {
        setProgress(1, 'Ready!');
        rollCall();
        const wait = Math.max(0, MIN_SPLASH_MS - (this.time.now - started));
        this.time.delayedCall(wait + 120, () => {
          let left = false;
          const leave = () => { if (left || !this.sys.isActive()) return; left = true; this.scene.start('Overworld'); };
          cam.fadeOut(180, 0, 0, 0);
          cam.once('camerafadeoutcomplete', leave);
          // belt and braces: never get stuck on the splash if the fade event is missed
          this.time.delayedCall(420, leave);
        });
        return;
      }
      const s = steps[i++];
      s.run();
      setProgress(i / steps.length, s.label);
      rollCall();
      this.time.delayedCall(0, next);
    };
    this.time.delayedCall(40, next);
  }

  private registerMap(kind: 'route' | 'exchange', built: ReturnType<typeof buildRouteMap>) {
    this.registry.set(`map:${kind}`, built);
    if (!this.cache.tilemap.exists(built.key)) this.cache.tilemap.add(built.key, { format: Phaser.Tilemaps.Formats.TILED_JSON, data: built.json });
  }
}
