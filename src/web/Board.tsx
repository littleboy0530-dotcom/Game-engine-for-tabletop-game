import type { BoardDef, Engine } from '../engine';
import type { Choice } from './choices';

interface Props {
  engine: Engine;
  board: BoardDef;
  targets: Map<string, Choice[]>;
  onPick: (choices: Choice[], e: React.MouseEvent) => void;
}

const CELL = 60;
const POINT_GAP = 56;
const MARGIN = 34;

/** Readable text colour on top of a fill colour. */
export function inkOn(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#111';
  const n = parseInt(m[1]!, 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#1d1b18' : '#fbf8f1';
}

export function Board({ engine, board, targets, onPick }: Props) {
  const { def } = engine;
  const state = engine.view;
  const points = board.style === 'points';
  const gap = points ? POINT_GAP : CELL;
  const margin = points ? MARGIN : 0;
  const w = points ? margin * 2 + (board.width - 1) * gap : board.width * gap;
  const h = points ? margin * 2 + (board.height - 1) * gap : board.height * gap;

  const center = (zid: string) => {
    const z = def.zones[zid]!;
    const x = z.x!, y = z.y!;
    return points
      ? { cx: margin + x * gap, cy: margin + (board.height - 1 - y) * gap }
      : { cx: x * gap + gap / 2, cy: (board.height - 1 - y) * gap + gap / 2 };
  };

  const gridZones = board.grid.filter((z): z is string => !!z);
  const pick = (choices: Choice[] | undefined) => (e: React.MouseEvent) => {
    if (!choices?.length) return;
    e.stopPropagation();
    onPick(choices, e);
  };

  return (
    <svg className={`board board-${board.style}`} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="게임 보드">
      <rect className="board-bg" x={0} y={0} width={w} height={h} rx={points ? 10 : 6} />

      {!points &&
        gridZones.map((zid) => {
          const z = def.zones[zid]!;
          const { cx, cy } = center(zid);
          const dark = (z.x! + z.y!) % 2 === 0;
          return <rect key={zid} className={dark ? 'cell cell-dark' : 'cell cell-light'} x={cx - gap / 2} y={cy - gap / 2} width={gap} height={gap} />;
        })}

      {points &&
        board.edges.map(([a, b]) => {
          if (def.zones[a]!.x === null || def.zones[b]!.x === null) return null;
          const p = center(a), q = center(b);
          return <line key={`${a}-${b}`} className="grid-line" x1={p.cx} y1={p.cy} x2={q.cx} y2={q.cy} />;
        })}

      {!points && board.width <= 26 && !gridZones.some((z) => def.zones[z]!.name.includes(',')) && (
        <g className="coords" aria-hidden>
          {gridZones.filter((z) => def.zones[z]!.y === 0).map((zid) => {
            const { cx } = center(zid);
            return <text key={zid} x={cx + gap / 2 - 4} y={h - 4} textAnchor="end">{def.zones[zid]!.name.replace(/\d+$/, '')}</text>;
          })}
          {gridZones.filter((z) => def.zones[z]!.x === 0).map((zid) => {
            const { cy } = center(zid);
            return <text key={zid} x={4} y={cy - gap / 2 + 13}>{def.zones[zid]!.name.replace(/^\D+/, '')}</text>;
          })}
        </g>
      )}

      {/* zones the player can pick */}
      {gridZones.map((zid) => {
        const choices = targets.get(`zone:${zid}`);
        if (!choices) return null;
        const { cx, cy } = center(zid);
        const occupied = (state.contents[zid]?.length ?? 0) > 0;
        return (
          <g key={`t-${zid}`} className="zone-target" onClick={pick(choices)}>
            <rect x={cx - gap / 2} y={cy - gap / 2} width={gap} height={gap} fill="transparent" />
            {occupied
              ? <circle cx={cx} cy={cy} r={gap * 0.46} className="capture-ring" />
              : <circle cx={cx} cy={cy} r={gap * 0.14} className="move-dot" />}
          </g>
        );
      })}

      {/* pieces */}
      {gridZones.flatMap((zid) =>
        (state.contents[zid] ?? []).map((pid, i) => {
          const piece = state.pieces[pid]!;
          const owner = def.players.find((p) => p.id === piece.owner);
          const fill = owner?.color ?? '#999';
          const { cx, cy } = center(zid);
          const own = targets.get(`piece:${pid}`);
          const viaZone = targets.get(`zone:${zid}`);
          const choices = own ?? viaZone;
          const r = gap * (points ? 0.4 : 0.38);
          return (
            <g
              key={pid}
              className={`piece${own ? ' piece-selectable' : ''}${choices ? ' clickable' : ''}`}
              transform={`translate(${cx + i * 3}, ${cy - i * 3})`}
              onClick={pick(choices)}
            >
              <circle r={r} fill={fill} className="piece-body" />
              <text className="piece-label" fill={inkOn(fill)} dy="0.36em" fontSize={r * (points ? 0.95 : 1.15)}>
                {engine.pieceLabel(pid)}
              </text>
            </g>
          );
        }),
      )}
    </svg>
  );
}
