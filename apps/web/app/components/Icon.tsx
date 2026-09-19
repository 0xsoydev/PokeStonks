/**
 * Pixel icons: tiny bitmaps rendered as a single crisp SVG path, tinted by `currentColor`.
 * One shape language across the UI (same cell grid as the logotype and the game's sprites).
 */
const BITMAPS = {
  copy: [
    '..######',
    '..#....#',
    '######.#',
    '#....#.#',
    '#....#.#',
    '#....###',
    '#....#..',
    '######..',
  ],
  external: [
    '...#####',
    '......##',
    '.....#.#',
    '....#..#',
    '...#...#',
    '..#.....',
    '.#......',
    '#.......',
  ],
  soundOn: [
    '...#....',
    '..##.#..',
    '###..#.#',
    '###..#.#',
    '###..#.#',
    '..##.#..',
    '...#....',
  ],
  soundOff: [
    '...#....',
    '..##....',
    '###..#.#',
    '###...#.',
    '###..#.#',
    '..##....',
    '...#....',
  ],
  grid: [
    '##.##.##',
    '##.##.##',
    '........',
    '##.##.##',
    '##.##.##',
    '........',
    '##.##.##',
    '##.##.##',
  ],
  swap: [
    '..#..#..',
    '.#....#.',
    '########',
    '.#....#.',
    '..#..#..',
  ],
  power: [
    '...##...',
    '...##...',
    '.#.##.#.',
    '#..##..#',
    '#......#',
    '#......#',
    '.#....#.',
    '..####..',
  ],
  close: [
    '#......#',
    '##....##',
    '.##..##.',
    '..####..',
    '..####..',
    '.##..##.',
    '##....##',
    '#......#',
  ],
  check: [
    '.......#',
    '......##',
    '#....##.',
    '##..##..',
    '.####...',
    '..##....',
  ],
  down: [
    '#......#',
    '##....##',
    '.##..##.',
    '..####..',
    '...##...',
  ],
  up: [
    '...##...',
    '..####..',
    '.##..##.',
    '##....##',
    '#......#',
  ],
} as const;

export type IconName = keyof typeof BITMAPS;

const PATHS = Object.fromEntries(
  (Object.entries(BITMAPS) as Array<[IconName, readonly string[]]>).map(([name, rows]) => {
    let d = '';
    rows.forEach((row, y) => {
      let x = 0;
      while (x < row.length) {
        if (row[x] !== '#') {
          x += 1;
          continue;
        }
        let end = x;
        while (end < row.length && row[end] === '#') end += 1;
        d += `M${x} ${y}h${end - x}v1h-${end - x}z`;
        x = end;
      }
    });
    return [name, { d, w: Math.max(...rows.map((r) => r.length)), h: rows.length }];
  }),
) as Record<IconName, { d: string; w: number; h: number }>;

export function Icon({ name, size = 16, className }: { name: IconName; size?: number; className?: string }) {
  const p = PATHS[name];
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={className}
      viewBox={`0 0 ${p.w} ${p.h}`}
      width={size}
      height={Math.round((size * p.h) / p.w)}
      shapeRendering="crispEdges"
      fill="currentColor"
    >
      <path d={p.d} />
    </svg>
  );
}
