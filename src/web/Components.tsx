// Small views for components outside the grid: cards, dice, pieces.
import type { Engine } from '../engine';
import { inkOn } from './Board';

interface Props {
  engine: Engine;
  id: string;
  visible: boolean;
  selectable?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  small?: boolean;
}

export function ComponentView({ engine, id, visible, selectable, onClick, small }: Props) {
  const pc = engine.view.pieces[id]!;
  const t = engine.def.pieceTypes[pc.type]!;
  const cls = `${selectable ? ' is-selectable' : ''}${onClick ? ' is-clickable' : ''}${small ? ' is-small' : ''}`;

  if (t.kind === 'card') {
    if (!visible) {
      return (
        <div className={`card-view card-back${cls}`} onClick={onClick} title="뒷면">
          <span>{t.back || ' '}</span>
        </div>
      );
    }
    const color = typeof t.props.color === 'string' && t.props.color ? t.props.color : undefined;
    const cost = t.props.cost;
    return (
      <div className={`card-view${cls}`} onClick={onClick} style={color ? { borderTopColor: color } : undefined} title={t.text || undefined}>
        {typeof cost === 'number' && <span className="card-cost">{cost}</span>}
        <span className="card-label" style={color ? { color } : undefined}>{engine.pieceLabel(id)}</span>
        {t.text && !small && <span className="card-text">{t.text}</span>}
      </div>
    );
  }

  const owner = engine.def.players.find((p) => p.id === pc.owner);
  if (t.kind === 'die') {
    return (
      <div className={`die-view${cls}`} onClick={onClick} style={owner ? { background: owner.color, color: inkOn(owner.color) } : undefined}>
        {engine.pieceLabel(id)}
      </div>
    );
  }
  const color = owner?.color ?? '#999';
  return (
    <span className={`mini-piece${cls}`} onClick={onClick} style={{ background: color, color: inkOn(color) }}>
      {engine.pieceLabel(id)}
    </span>
  );
}
