/**
 * Lazy bridge to the pixel-art module (app/game/art, owned by the art engineer), so a missing or failing
 * art module can never break rendering: callers just keep the placeholder tile.
 *
 * `speciesPortraitDataUrl` (the planned art API) does not exist yet, so this renders the same creature
 * sprites the game uses (`drawMon`, front view) to a canvas and returns a PNG data URL. When the art
 * engineer ships `speciesPortraitDataUrl`, swap the body of `render` for a call to it.
 */
type PortraitFn = (speciesId: string, size?: number) => string;

let pending: Promise<PortraitFn | null> | null = null;

export function loadPortraitFn(): Promise<PortraitFn | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (!pending) {
    pending = import('../game/art/mons')
      .then((mod): PortraitFn => (speciesId, size = 64) => {
        // The sprite is a 32x32 grid: render at a whole multiple so pixels stay square, CSS scales the rest.
        const px = Math.max(32, Math.round(size / 32) * 32);
        const canvas = document.createElement('canvas');
        canvas.width = px;
        canvas.height = px;
        const ctx = canvas.getContext('2d');
        if (!ctx) return '';
        ctx.imageSmoothingEnabled = false;
        mod.drawMon(ctx, speciesId, 'front', px);
        return canvas.toDataURL('image/png');
      })
      .catch(() => null);
  }
  return pending;
}
