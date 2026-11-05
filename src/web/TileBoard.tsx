// Open boards that grow during play, and tiles drawn from their edges and parts.
import type { BoardDef, Engine, Side } from '../engine';
import type { Choice } from './choices';
import { inkOn } from './Board';

const CELL = 72;
const MID: Record<Side, [number, number]> = { N: [0.5, 0], E: [1, 0.5], S: [0.5, 1], W: [0, 0.5] };
// a band along each side, used to draw city parts
const BAND: Record<Side, string> = {
  N: '0,0 1,0 0.72,0.3 0.28,0.3',
  E: '1,0 1,1 0.7,0.72 0.7,0.28',
  S: '1,1 0,1 0.28,0.7 0.72,0.7',
  W: '0,1 0,0 0.3,0.28 0.3,0.72',
};

/** Where a part's worker sits inside the tile (0..1 coordinates). */
export function anchorOf(sides: Side[]): [number, number] {
  if (!sides.length) return [0.5, 0.5];
  const x = sides.reduce((s, sd) => s + MID[sd][0], 0) / sides.length;
  const y = sides.reduce((s, sd) => s + MID[sd][1], 0) / sides.length;
  // pull single-side parts a little towards the middle so the worker sits on the tile
  return [0.5 + (x - 0.5) * 0.7, 0.5 + (y - 0.5) * 0.7];
}

/** A tile drawn in a size x size square (SVG group, no outer <svg>). */
export function TileArt({ engine, id, size }: { engine: Engine; id: string; size: number }) {
  const info = engine.tileInfo(id);
  const s = (v: number) => v * size;
  const pts = (p: string) => p.split(' ').map((xy) => xy.split(',').map((n) => s(Number(n))).join(',')).join(' ');
  return (
    <g>
      <rect width={size} height={size} className="tile-field" />
      {info.segments.filter((sg) => sg.kind === '도시').map((sg) => (
        <g key={sg.id} className="tile-city">
          {sg.sides.map((sd) => <polygon key={sd} points={pts(BAND[sd])} />)}
          {sg.sides.length > 1 && <rect x={s(0.28)} y={s(0.28)} width={s(0.44)} height={s(0.44)} />}
        </g>
      ))}
      {info.segments.filter((sg) => sg.kind === '길').map((sg) => {
        const ends = sg.sides.map((sd) => MID[sd]);
        if (ends.length === 1) {
          const [x, y] = ends[0]!;
          return (
            <g key={sg.id} className="tile-road">
              <line x1={s(x)} y1={s(y)} x2={s(0.5 + (x - 0.5) * 0.15)} y2={s(0.5 + (y - 0.5) * 0.15)} />
              <circle cx={s(0.5)} cy={s(0.5)} r={s(0.08)} className="tile-crossing" />
            </g>
          );
        }
        return (
          <g key={sg.id} className="tile-road">
            {ends.map(([x, y], i) => <line key={i} x1={s(x)} y1={s(y)} x2={s(0.5)} y2={s(0.5)} />)}
          </g>
        );
      })}
      {info.segments.some((sg) => sg.kind === '수도원') && (
        <text x={s(0.5)} y={s(0.5)} dy="0.35em" textAnchor="middle" fontSize={s(0.34)} className="tile-monastery">⛪</text>
      )}
      <rect width={size} height={size} className="tile-border" />
    </g>
  );
}

interface Props {
  engine: Engine;
  board: BoardDef;
  targets: Map<string, Choice[]>;
  onPick: (choices: Choice[], e: React.MouseEvent) => void;
}

export function TileBoard({ engine, board, targets, onPick }: Props) {
  const spots = engine.boardZones(board.id).filter((z) => z.x !== null && !z.parent);
  if (!spots.length) return null;
  const xs = spots.map((z) => z.x!), ys = spots.map((z) => z.y!);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = (maxX - minX + 1) * CELL, h = (maxY - minY + 1) * CELL;
  const pos = (x: number, y: number) => ({ px: (x - minX) * CELL, py: (maxY - y) * CELL });
  const isTile = (pid: string) => engine.def.pieceTypes[engine.view.pieces[pid]!.type]!.kind === 'tile';
  const click = (choices: Choice[] | undefined) => (choices ? (e: React.MouseEvent) => { e.stopPropagation(); onPick(choices, e); } : undefined);

  return (
    <div className="tile-board-wrap">
      <svg className="tile-board" viewBox={`-6 -6 ${w + 12} ${h + 12}`} style={{ maxWidth: Math.max(w + 12, 320) }} role="img" aria-label="타일 보드">
        {spots.map((z) => {
          const { px, py } = pos(z.x!, z.y!);
          const ids = engine.view.contents[z.id] ?? [];
          const tile = ids.find(isTile);
          const choices = targets.get(`zone:${z.id}`);
          return (
            <g key={z.id} transform={`translate(${px}, ${py})`}>
              {tile ? (
                <TileArt engine={engine} id={tile} size={CELL} />
              ) : (
                <rect x={3} y={3} width={CELL - 6} height={CELL - 6} rx={6} className={choices ? 'tile-spot is-target' : 'tile-spot'} onClick={click(choices)} />
              )}
              {tile &&
                engine.tileInfo(tile).segments.map((sg) => {
                  const child = engine.boardZones(board.id).find((c) => c.parent === z.id && c.segment === sg.id);
                  if (!child) return null;
                  const [ax, ay] = anchorOf(sg.sides);
                  const workers = engine.view.contents[child.id] ?? [];
                  const childChoices = targets.get(`zone:${child.id}`);
                  return (
                    <g key={sg.id} transform={`translate(${ax * CELL}, ${ay * CELL})`}>
                      {childChoices && <circle r={11} className="part-target" onClick={click(childChoices)} />}
                      {workers.map((wid, i) => {
                        const owner = engine.def.players.find((p) => p.id === engine.view.pieces[wid]!.owner);
                        const color = owner?.color ?? '#999';
                        return (
                          <g key={wid} transform={`translate(${i * 6}, ${-i * 6})`}>
                            <circle r={9} fill={color} className="worker" />
                            <text dy="0.35em" textAnchor="middle" fontSize={11} fill={inkOn(color)}>{engine.pieceLabel(wid)}</text>
                          </g>
                        );
                      })}
                    </g>
                  );
                })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
