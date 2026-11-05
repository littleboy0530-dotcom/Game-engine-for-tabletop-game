// A track board drawn as a ring of spaces around a rectangle (start at bottom right).
import type { BoardDef, Engine } from '../engine';
import type { Choice } from './choices';
import { ComponentView } from './Components';

interface Props {
  engine: Engine;
  board: BoardDef;
  viewer: string | null;
  targets: Map<string, Choice[]>;
  onPick: (choices: Choice[], e: React.MouseEvent) => void;
}

const NAMED: Record<string, string> = {
  갈색: '#8b5a2b', 하늘: '#4aa3df', 분홍: '#d96aa7', 초록: '#3c8c4a', 빨강: '#c0392b',
  노랑: '#d4a017', 주황: '#e07a2b', 파랑: '#2f6fb5', 보라: '#7b4fb5', 정류장: '#555555',
};
const PALETTE = ['#2f6fb5', '#b5562b', '#3c8c4a', '#7b4fb5', '#d4a017', '#c0392b'];

function groupColor(v: unknown): string | null {
  if (typeof v !== 'string' || !v) return null;
  if (v.startsWith('#')) return v;
  if (NAMED[v]) return NAMED[v]!;
  let h = 0;
  for (const ch of v) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

/** Grid position (col,row) of each space on the ring, clockwise from bottom right. */
function ringCells(n: number) {
  const side = Math.max(3, Math.ceil(n / 4) + 1);
  const cells: [number, number][] = [];
  for (let c = side - 1; c >= 0; c--) cells.push([c, side - 1]); // bottom, right to left
  for (let r = side - 2; r >= 0; r--) cells.push([0, r]); // left, bottom to top
  for (let c = 1; c < side; c++) cells.push([c, 0]); // top, left to right
  for (let r = 1; r < side - 1; r++) cells.push([side - 1, r]); // right, top to bottom
  return { side, cells: cells.slice(0, n) };
}

export function RingBoard({ engine, board, viewer, targets, onPick }: Props) {
  const { side, cells } = ringCells(board.width);
  return (
    <div className="ring" style={{ gridTemplateColumns: `repeat(${side}, minmax(0, 1fr))` }}>
      {board.grid.map((zid, i) => {
        const z = engine.def.zones[zid!]!;
        const [c, r] = cells[i]!;
        const color = groupColor(z.props.color ?? z.props.group);
        const choices = targets.get(`zone:${zid}`);
        const ids = engine.view.contents[zid!] ?? [];
        return (
          <div
            key={zid}
            className={`ring-space${choices ? ' is-target' : ''}`}
            style={{ gridColumn: c + 1, gridRow: r + 1 }}
            onClick={choices ? (e) => onPick(choices, e) : undefined}
          >
            {color && <div className="ring-band" style={{ background: color }} />}
            <div className="ring-name">{z.name}</div>
            {typeof z.props.price === 'number' && <div className="ring-price">{z.props.price}</div>}
            <div className="ring-items">
              {ids.map((id) => {
                const own = targets.get(`piece:${id}`);
                return (
                  <ComponentView key={id} engine={engine} id={id} visible={engine.isVisible(id, viewer)} small
                    selectable={!!own} onClick={own ? (e) => { e.stopPropagation(); onPick(own, e); } : undefined} />
                );
              })}
            </div>
          </div>
        );
      })}
      <div className="ring-center" style={{ gridColumn: `2 / ${side}`, gridRow: `2 / ${side}` }}>
        <span>{engine.def.name}</span>
      </div>
    </div>
  );
}
