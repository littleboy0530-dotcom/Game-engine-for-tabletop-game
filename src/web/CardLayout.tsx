// style: cards — card slots laid out by board coordinates. One x step is half a card,
// so neighbouring rows overlap like a pyramid. Row y=0 is in front (bottom, drawn last).
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

const STEP_X = 38;
const STEP_Y = 72;
const CARD_W = 72;
const CARD_H = 100;

export function CardLayout({ engine, board, viewer, targets, onPick }: Props) {
  const slots = board.grid
    .filter((id): id is string => !!id)
    .map((id) => engine.zone(id)!)
    .filter((z) => z.tags.length > 0 || (engine.view.contents[z.id]?.length ?? 0) > 0);
  const w = (board.width - 1) * STEP_X + CARD_W;
  const h = (board.height - 1) * STEP_Y + CARD_H;
  // back rows first so the front row overlaps them
  const ordered = [...slots].sort((a, b) => b.y! - a.y!);

  return (
    <div className="card-layout-wrap">
      <div className="card-layout" style={{ width: w, height: h }}>
        {ordered.map((z) => {
          const ids = engine.view.contents[z.id] ?? [];
          const top = ids[ids.length - 1];
          const style = { left: z.x! * STEP_X, top: (board.height - 1 - z.y!) * STEP_Y };
          if (!top) return <div key={z.id} className="card-view card-empty card-slot" style={style} />;
          const choices = targets.get(`piece:${top}`) ?? targets.get(`zone:${z.id}`);
          return (
            <div key={z.id} className="card-slot" style={style}>
              <ComponentView
                engine={engine}
                id={top}
                visible={engine.isVisible(top, viewer)}
                selectable={!!choices}
                onClick={choices ? (e) => { e.stopPropagation(); onPick(choices, e); } : undefined}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
