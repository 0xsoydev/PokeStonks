'use client';

// FireRed-style stock battle overlay. Static turn logic: pick 1 of 2 moves,
// HP bars drain, opponent retaliates, faint -> victory/defeat popup.
// Sprites are PokéAPI gifs — <img> tags animate natively (no canvas quirks).
import { useEffect, useRef, useState } from 'react';

const SPRITES_CDN = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
const MAX_HP = 300;
const FONT = '"Courier New", monospace';

export interface StockMon {
  id: number;
  name: string;
  moves: [string, string];
}

// which pokemon guards which tokenized stock
export const STOCK_MONS: Record<string, StockMon> = {
  AAPL: { id: 143, name: 'SNORLAX', moves: ['BODY SLAM', 'REST'] },
  TSLA: { id: 101, name: 'ELECTRODE', moves: ['ELECTRO BALL', 'ROLLOUT'] },
  NVDA: { id: 65, name: 'ALAKAZAM', moves: ['PSYBEAM', 'CONFUSION'] },
  GME: { id: 94, name: 'GENGAR', moves: ['SHADOW BALL', 'LICK'] },
  AMZN: { id: 3, name: 'VENUSAUR', moves: ['VINE WHIP', 'RAZOR LEAF'] },
};

const PLAYER_MOVES: Record<number, [string, string]> = {
  25: ['THUNDER SHOCK', 'QUICK ATTACK'],
  4: ['EMBER', 'SCRATCH'],
  1: ['VINE WHIP', 'TACKLE'],
  7: ['WATER GUN', 'TACKLE'],
  133: ['QUICK ATTACK', 'BITE'],
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const hit = () => 45 + Math.floor(Math.random() * 41); // 45–85

// round FireRed-style platform the pokemon stands on
const Pavement = ({ width }: { width: number }) => (
  <div className="relative z-10 -mt-4" style={{ width, height: 36 }}>
    <div className="absolute inset-0 rounded-[50%] bg-[#a89070]" />
    <div className="absolute left-2 right-2 top-1 bottom-2.5 rounded-[50%] bg-[#d4c4a4]" />
  </div>
);

interface BattleProps {
  symbol: string;
  drop: string;
  playerName: string;
  playerId: number;
  onDone: (result: 'win' | 'lose' | 'flee') => void;
}

type Phase = 'intro' | 'menu' | 'moves' | 'msg' | 'victory' | 'defeat';

export default function Battle({ symbol, drop, playerName, playerId, onDone }: BattleProps) {
  const opp = STOCK_MONS[symbol] ?? { id: 132, name: 'DITTO', moves: ['TACKLE', 'TACKLE'] as [string, string] };
  const pMoves = PLAYER_MOVES[playerId] ?? (['TACKLE', 'SCRATCH'] as [string, string]);

  const [pHP, setPHP] = useState(MAX_HP);
  const [oHP, setOHP] = useState(MAX_HP);
  const pHPRef = useRef(MAX_HP);
  const oHPRef = useRef(MAX_HP);
  const [phase, setPhase] = useState<Phase>('intro');
  const [msg, setMsg] = useState('');
  const [cursor, setCursor] = useState(0);
  const [flash, setFlash] = useState<'p' | 'o' | null>(null);
  const [shake, setShake] = useState(false);
  const [fainted, setFainted] = useState<'p' | 'o' | null>(null);
  const [playerGif, setPlayerGif] = useState<string | null>(null);
  const [oppGif, setOppGif] = useState<string | null>(null);
  const busy = useRef(false);
  const skip = useRef(false);
  const finished = useRef(false);

  const finish = (r: 'win' | 'lose' | 'flee') => {
    if (!finished.current) {
      finished.current = true;
      onDone(r);
    }
  };

  // sprites: first URL that loads wins (animated gif -> static fallback)
  useEffect(() => {
    const load = (urls: string[], set: (s: string | null) => void) => {
      void (async () => {
        for (const u of urls) {
          const ok = await new Promise<boolean>((res) => {
            const img = new Image();
            img.onload = () => res(true);
            img.onerror = () => res(false);
            img.src = u;
          });
          if (ok) {
            set(u);
            return;
          }
        }
        set(null);
      })();
    };
    load(
      [
        `${SPRITES_CDN}/versions/generation-v/black-white/animated/back/${playerId}.gif`,
        `${SPRITES_CDN}/back/${playerId}.png`,
      ],
      setPlayerGif,
    );
    load(
      [
        `${SPRITES_CDN}/versions/generation-v/black-white/animated/${opp.id}.gif`,
        `${SPRITES_CDN}/versions/generation-iii/emerald/${opp.id}.png`,
        `${SPRITES_CDN}/${opp.id}.png`,
      ],
      setOppGif,
    );
  }, [playerId, opp.id]);

  const hpColor = (hp: number) =>
    hp / MAX_HP > 0.5 ? '#58c858' : hp / MAX_HP > 0.2 ? '#f8d048' : '#f05858';

  const say = (text: string) =>
    new Promise<void>((resolve) => {
      setMsg('');
      skip.current = false;
      let i = 0;
      const iv = setInterval(() => {
        i = skip.current ? text.length : i + 1;
        setMsg(text.slice(0, i));
        if (i >= text.length) {
          clearInterval(iv);
          resolve();
        }
      }, 18);
    });

  const drainTo = (ref: { current: number }, set: (n: number) => void, target: number) =>
    new Promise<void>((resolve) => {
      const from = ref.current;
      const t0 = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / 600);
        const v = Math.round(from + (target - from) * t);
        ref.current = v;
        set(v);
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });

  const doTurn = async (move: string) => {
    busy.current = true;
    setPhase('msg');
    await say(`${playerName.toUpperCase()} used ${move}!`);
    setFlash('o');
    await sleep(650);
    setFlash(null);
    await drainTo(oHPRef, setOHP, Math.max(0, oHPRef.current - hit()));
    if (oHPRef.current <= 0) {
      await say(`Wild ${opp.name} fainted!`);
      setFainted('o');
      await sleep(1000);
      setPhase('victory');
      busy.current = false;
      return;
    }
    await sleep(250);
    await say(`Wild ${opp.name} used ${opp.moves[Math.floor(Math.random() * 2)]}!`);
    setFlash('p');
    setShake(true);
    await sleep(650);
    setFlash(null);
    setShake(false);
    await drainTo(pHPRef, setPHP, Math.max(0, pHPRef.current - hit()));
    if (pHPRef.current <= 0) {
      await say(`${playerName.toUpperCase()} fainted!`);
      setFainted('p');
      await sleep(1000);
      setPhase('defeat');
      busy.current = false;
      return;
    }
    await sleep(200);
    busy.current = false;
    setCursor(0);
    setPhase('menu');
  };

  // intro message
  useEffect(() => {
    void (async () => {
      busy.current = true;
      await say(`A wild ${opp.name} appeared!\nIt guards the ${symbol} stock (+${drop}/catch).`);
      busy.current = false;
      setPhase('menu');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keyboard: navigate / confirm / skip typing
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      if (
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'z', 'Z', 'Enter', 'Escape', 'x', 'X', 'Backspace'].includes(k)
      )
        e.preventDefault();
      if (phase === 'victory' || phase === 'defeat') {
        if (k === 'z' || k === 'Z' || k === 'Enter' || k === ' ')
          finish(phase === 'victory' ? 'win' : 'lose');
        return;
      }
      if (busy.current) {
        skip.current = true;
        return;
      }
      const confirm = k === 'z' || k === 'Z' || k === 'Enter' || k === ' ';
      const nav = k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowRight';
      if (phase === 'menu') {
        if (nav) setCursor((c) => (c === 0 ? 1 : 0));
        else if (confirm) {
          if (cursor === 0) {
            setPhase('moves');
            setCursor(0);
          } else finish('flee');
        }
      } else if (phase === 'moves') {
        if (k === 'Escape' || k === 'x' || k === 'X' || k === 'Backspace') {
          setPhase('menu');
          setCursor(0);
        } else if (nav) setCursor((c) => (c === 0 ? 1 : 0));
        else if (confirm) void doTurn(pMoves[cursor]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, cursor]);

  const infoBox = (name: string, hp: number) => (
    <div className="w-[300px] rounded-md border-4 border-[#303860] bg-[#f8f8e8] px-4 py-3 shadow-lg">
      <div className="flex justify-between text-lg font-bold text-[#303860]" style={{ fontFamily: FONT }}>
        <span>{name}</span>
        <span>Lv100</span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="text-sm font-bold text-[#c89038]" style={{ fontFamily: FONT }}>
          HP
        </span>
        <div className="h-3.5 flex-1 overflow-hidden rounded-sm bg-[#585048]">
          <div
            className="h-full rounded-sm transition-all duration-500"
            style={{ width: `${(hp / MAX_HP) * 100}%`, background: hpColor(hp) }}
          />
        </div>
      </div>
      <div className="mt-1 text-right text-sm font-bold text-[#303860]" style={{ fontFamily: FONT }}>
        {hp}/ {MAX_HP}
      </div>
    </div>
  );

  const sprite = (src: string | null, who: 'p' | 'o', className: string) =>
    src ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={who === 'p' ? playerName : opp.name}
        className={`${className} ${fainted === who ? 'animate-[faint_0.65s_ease-in_forwards]' : ''} ${
          flash === who ? 'animate-[hitflash_0.65s]' : ''
        }`}
        style={{ imageRendering: 'pixelated' }}
        draggable={false}
      />
    ) : null;

  return (
    <div
      className="absolute inset-0 z-50 select-none overflow-hidden"
      style={{
        background: 'linear-gradient(to bottom, #98c8f8 0%, #c8e0f8 55%, #b8dc98 55%, #88b868 100%)',
        animation: shake ? 'shake 0.4s' : undefined,
      }}
    >
      <style>{`
        @keyframes faint { to { transform: translateY(115%); } }
        @keyframes hitflash { 0%,100% { opacity: 1; } 20%,60% { opacity: 0.15; } 40%,80% { opacity: 1; } }
        @keyframes shake { 0%,100% { transform: translate(0,0); } 25% { transform: translate(-6px,2px); } 50% { transform: translate(5px,-2px); } 75% { transform: translate(-3px,1px); } }
      `}</style>

      {/* opponent column (right): HP box above sprite, standing on pavement.
          The overflow-hidden wrapper clips the faint drop at the pavement line. */}
      <div className="absolute right-[6%] top-[4%] flex flex-col items-center">
        {infoBox(opp.name, oHP)}
        <div className="mt-3 flex items-end justify-center overflow-hidden" style={{ height: '28vh' }}>
          {sprite(oppGif, 'o', 'max-h-full object-contain')}
        </div>
        <Pavement width={260} />
      </div>

      {/* player column (left): HP box above sprite, standing on pavement */}
      <div className="absolute bottom-[24%] left-[6%] flex flex-col items-center">
        {infoBox(playerName.toUpperCase(), pHP)}
        <div className="mt-3 flex items-end justify-center overflow-hidden" style={{ height: '30vh' }}>
          {sprite(playerGif, 'p', 'max-h-full object-contain')}
        </div>
        <Pavement width={300} />
      </div>

      {/* textbox + menu */}
      <div className="absolute bottom-0 left-0 right-0 h-[24%]">
        <div
          className="h-full border-t-4 border-[#303860] bg-[#f8f8e8] p-5"
          style={{ fontFamily: FONT }}
        >
          {phase === 'menu' && (
            <div className="text-xl font-bold text-[#303860]">What will {playerName.toUpperCase()} do?</div>
          )}
          {(phase === 'intro' || phase === 'msg' || phase === 'victory' || phase === 'defeat') && (
            <pre className="whitespace-pre-wrap text-xl font-bold leading-relaxed text-[#303860]">{msg}</pre>
          )}
          {phase === 'moves' && (
            <div className="text-xl font-bold text-[#303860]">Choose a move…</div>
          )}
        </div>
        {(phase === 'menu' || phase === 'moves') && (
          <div
            className="absolute bottom-0 right-0 h-full w-[45%] border-l-4 border-t-4 border-[#303860] bg-[#f8f8e8] p-4"
            style={{ fontFamily: FONT }}
          >
            {(phase === 'menu' ? ['FIGHT', 'LEAVE'] : pMoves).map((m, i) => (
              <div
                key={m}
                onClick={() => {
                  if (busy.current) return;
                  if (phase === 'menu') {
                    if (i === 0) {
                      setPhase('moves');
                      setCursor(0);
                    } else finish('flee');
                  } else void doTurn(pMoves[i]);
                }}
                className="flex cursor-pointer items-center gap-3 py-1.5 text-lg font-bold text-[#303860] hover:bg-black/5"
              >
                <span className={cursor === i ? 'text-[#e3350d]' : 'invisible'}>▶</span>
                {m}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* victory / defeat popup */}
      {(phase === 'victory' || phase === 'defeat') && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50">
          <div
            className="w-[420px] rounded-xl border-4 border-[#303860] bg-[#f8f8e8] p-8 text-center shadow-2xl"
            style={{ fontFamily: FONT }}
          >
            {phase === 'victory' ? (
              <>
                <div className="text-4xl font-bold text-[#c89038]">🏆 VICTORY!</div>
                <div className="mt-4 text-lg font-bold text-[#303860]">You claimed the stock</div>
                <div className="mt-2 text-5xl font-bold text-[#e3350d]">{symbol}</div>
                <div className="mt-2 text-lg font-bold text-[#58c858]">+{drop} / catch</div>
              </>
            ) : (
              <>
                <div className="text-4xl font-bold text-[#f05858]">DEFEAT…</div>
                <div className="mt-4 text-lg font-bold text-[#303860]">
                  {playerName.toUpperCase()} blacked out!
                </div>
                <div className="mt-2 text-lg font-bold text-[#303860]">
                  The {symbol} stock was left behind.
                </div>
              </>
            )}
            <button
              onClick={() => finish(phase === 'victory' ? 'win' : 'lose')}
              className="mt-6 cursor-pointer rounded border-2 border-[#303860] bg-[#f8f8f8] px-6 py-2 text-base font-bold text-[#303860] hover:bg-white"
            >
              CONTINUE
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
