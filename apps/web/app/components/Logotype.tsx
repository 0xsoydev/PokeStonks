/**
 * The PokeStonks wordmark, drawn from a 5x7 pixel alphabet as one SVG (no image, no font).
 * POKE sits flat; STONKS climbs one cell per letter, a chart line that spells its name. Each glyph gets
 * a two-tone bevel, a navy outline and a deep-navy drop shadow, all derived from the same cell grid so the
 * pixels stay exact at any size.
 */

const GLYPHS: Record<string, string[]> = {
  P: ['1111.', '1...1', '1...1', '1111.', '1....', '1....', '1....'],
  O: ['.111.', '1...1', '1...1', '1...1', '1...1', '1...1', '.111.'],
  K: ['1...1', '1..1.', '1.1..', '11...', '1.1..', '1..1.', '1...1'],
  E: ['11111', '1....', '1....', '1111.', '1....', '1....', '11111'],
  S: ['.1111', '1....', '1....', '.111.', '....1', '....1', '1111.'],
  T: ['11111', '..1..', '..1..', '..1..', '..1..', '..1..', '..1..'],
  N: ['1...1', '11..1', '11..1', '1.1.1', '1..11', '1..11', '1...1'],
};

const WORD = 'POKESTONKS';
const FLAT = 4; // POKE stays on the baseline
const GAP = 1;
const GW = 5;
const GH = 7;

const COLORS = {
  shadow: '#0e1c5c',
  outline: '#183088',
  gloss: '#fff7c0',
  top: '#f8d858',
  bottom: '#d8a830',
};

function cellsToPath(cells: Iterable<string>): string {
  let d = '';
  for (const key of cells) {
    const [x, y] = key.split(',').map(Number);
    d += `M${x} ${y}h1v1h-1z`;
  }
  return d;
}

function dilate(cells: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const key of cells) {
    const [x, y] = key.split(',').map(Number);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) out.add(`${x + dx},${y + dy}`);
  }
  return out;
}

/** Each glyph cell is drawn as S x S sub-cells: bold 2-unit strokes under a 1-unit outline. */
const S = 2;

function build() {
  const rise = WORD.length - FLAT; // rows the last letter climbs above the baseline
  const gloss = new Set<string>();
  const top = new Set<string>();
  const bottom = new Set<string>();
  const all = new Set<string>();

  [...WORD].forEach((ch, i) => {
    const lift = i < FLAT ? 0 : i - FLAT + 1; // S starts one cell up, then one more per letter
    const ox = i * (GW + GAP) + 1; // +1: room for the outline
    const oy = rise - lift + 1;
    GLYPHS[ch].forEach((row, r) => {
      [...row].forEach((c, col) => {
        if (c !== '1') return;
        for (let dy = 0; dy < S; dy++) {
          for (let dx = 0; dx < S; dx++) {
            const key = `${(ox + col) * S + dx},${(oy + r) * S + dy}`;
            all.add(key);
            if (r === 0 && dy === 0) gloss.add(key);
            else if (r <= 3) top.add(key);
            else bottom.add(key);
          }
        }
      });
    });
  });

  const outlineZone = dilate(all);
  const outline = new Set([...outlineZone].filter((k) => !all.has(k)));
  const shadowZone = new Set<string>();
  for (const key of outlineZone) {
    const [x, y] = key.split(',').map(Number);
    shadowZone.add(`${x + S},${y + S}`);
  }
  const shadow = new Set([...shadowZone].filter((k) => !outlineZone.has(k)));

  const width = (WORD.length * (GW + GAP) - GAP + 3) * S + S;
  const height = (GH + rise + 3) * S + S;
  return {
    width,
    height,
    shadow: cellsToPath(shadow),
    outline: cellsToPath(outline),
    bottom: cellsToPath(bottom),
    top: cellsToPath(top),
    gloss: cellsToPath(gloss),
  };
}

const G = build();

export function Logotype({ className, title = 'PokeStonks' }: { className?: string; title?: string }) {
  const g = G;
  return (
    <svg
      className={className}
      viewBox={`0 0 ${g.width} ${g.height}`}
      role="img"
      aria-label={title}
      shapeRendering="crispEdges"
      style={{ display: 'block', width: '100%', height: 'auto', overflow: 'visible' }}
    >
      <path d={g.shadow} fill={COLORS.shadow} opacity="0.5" />
      <path d={g.outline} fill={COLORS.outline} />
      <path d={g.bottom} fill={COLORS.bottom} />
      <path d={g.top} fill={COLORS.top} />
      <path d={g.gloss} fill={COLORS.gloss} />
    </svg>
  );
}
