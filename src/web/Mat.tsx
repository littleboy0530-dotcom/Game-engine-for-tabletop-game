// Off-grid zones (decks, hands, supply, trays) laid out as a play mat.
import type { Engine, ZoneDef } from '../engine';
import type { Choice } from './choices';
import { ComponentView } from './Components';
import { inkOn } from './Board';

interface Props {
  engine: Engine;
  viewer: string | null;
  targets: Map<string, Choice[]>;
  onPick: (choices: Choice[], e: React.MouseEvent) => void;
}

function ZoneView({ engine, zone, viewer, targets, onPick }: Props & { zone: ZoneDef }) {
  const ids = engine.view.contents[zone.id] ?? [];
  const zoneChoices = targets.get(`zone:${zone.id}`);
  const click = (choices: Choice[] | undefined) => (choices?.length ? (e: React.MouseEvent) => { e.stopPropagation(); onPick(choices, e); } : undefined);

  let body: React.ReactNode;
  if (zone.layout === 'pile') {
    const top = ids[ids.length - 1];
    const topChoices = top ? targets.get(`piece:${top}`) : undefined;
    body = (
      <div className="pile">
        {top ? (
          <ComponentView engine={engine} id={top} visible={engine.isVisible(top, viewer)} selectable={!!topChoices} onClick={click(topChoices)} small />
        ) : (
          <div className="card-view card-empty is-small" />
        )}
        <span className="pile-count">{ids.length}장</span>
      </div>
    );
  } else {
    body = (
      <div className="row-zone">
        {ids.map((id) => {
          const choices = targets.get(`piece:${id}`);
          return (
            <ComponentView key={id} engine={engine} id={id} visible={engine.isVisible(id, viewer)} selectable={!!choices} onClick={click(choices)} />
          );
        })}
        {!ids.length && <span className="muted">비어 있음</span>}
      </div>
    );
  }

  return (
    <div className={`zone-box zone-${zone.layout}${zoneChoices ? ' is-target' : ''}`} onClick={click(zoneChoices)}>
      <div className="zone-name">{zone.owner ? zone.name.replace(/^.+?의 /, '') : zone.name}</div>
      {body}
    </div>
  );
}

export function Mat(props: Props) {
  const { engine, viewer } = props;
  const zones = Object.values(engine.def.zones).filter((z) => z.x === null);
  if (!zones.length) return null;

  const shared = zones.filter((z) => !z.owner);
  const groups = new Map<string, ZoneDef[]>();
  for (const z of shared) {
    const g = z.group ?? '';
    groups.set(g, [...(groups.get(g) ?? []), z]);
  }
  // the viewer's own area goes last, closest to the bottom of the screen
  const players = [...engine.def.players].sort((a, b) => Number(a.id === viewer) - Number(b.id === viewer));

  return (
    <div className="mat">
      {[...groups.entries()].map(([name, list]) => (
        <section key={name || '_'} className="mat-group">
          {name && <div className="mat-title">{name}</div>}
          <div className="mat-zones">
            {list.map((z) => <ZoneView key={z.id} {...props} zone={z} />)}
          </div>
        </section>
      ))}
      {players.map((p) => {
        const own = zones.filter((z) => z.owner === p.id);
        if (!own.length) return null;
        return (
          <section key={p.id} className={`mat-group mat-player${p.id === viewer ? ' is-viewer' : ''}`}>
            <div className="mat-title">
              <span className="player-chip" style={{ background: p.color, color: inkOn(p.color) }}>{p.name}</span>
              {p.id === viewer && <span className="muted">내 자리</span>}
              {engine.isScripted(p.id) && <span className="muted">자동 (스크립트)</span>}
            </div>
            <div className="mat-zones">
              {own.map((z) => <ZoneView key={z.id} {...props} zone={z} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}
