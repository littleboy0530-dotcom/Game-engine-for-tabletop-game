// Form tabs of the editor: game info, components and setup, board.
import { useState } from 'react';
import { asList, asMap, freshId, readDoc, writeDoc, type Doc } from './yamlDoc';

export interface TabProps {
  files: Record<string, string>;
  setFiles: (f: Record<string, string>) => void;
}

function useDoc(files: Record<string, string>, setFiles: TabProps['setFiles'], path: string) {
  const doc = readDoc(files, path);
  const save = (d: Doc) => setFiles({ ...files, [path]: writeDoc(d) });
  return [doc, save] as const;
}

const BROKEN = (path: string) => (
  <div className="error-box">
    <strong>{path}의 문법이 깨져 있어서 이 화면에서 고칠 수 없어요.</strong>
    <span>파일 탭에서 직접 고쳐 주세요.</span>
  </div>
);

/** A small key: value list editor for display settings and props. */
function PairList({ value, onChange, keyLabel, valueLabel }: {
  value: Doc; onChange: (v: Doc) => void; keyLabel: string; valueLabel: string;
}) {
  const entries = Object.entries(value);
  const set = (list: [string, unknown][]) => onChange(Object.fromEntries(list.filter(([k]) => k !== '')));
  return (
    <div className="pairs">
      {entries.map(([k, v], i) => (
        <div key={i} className="pair-row">
          <input aria-label={keyLabel} placeholder={keyLabel} value={k}
            onChange={(e) => set(entries.map((x, j) => (j === i ? [e.target.value, x[1]] : x)))} />
          <input aria-label={valueLabel} placeholder={valueLabel} value={String(v ?? '')}
            onChange={(e) => {
              const raw = e.target.value;
              const val = raw !== '' && !Number.isNaN(Number(raw)) ? Number(raw) : raw;
              set(entries.map((x, j) => (j === i ? [x[0], val] : x)));
            }} />
          <button className="btn btn-small" onClick={() => set(entries.filter((_, j) => j !== i))} aria-label="지우기">✕</button>
        </div>
      ))}
      <button className="btn btn-small" onClick={() => set([...entries, [freshId('값', entries.map(([k]) => k)), '']])}>+ 추가</button>
    </div>
  );
}

// ---------------------------------------------------------------- info

export function InfoTab({ files, setFiles }: TabProps) {
  const [g, save] = useDoc(files, setFiles, 'game.yaml');
  if (!g) return BROKEN('game.yaml');
  const players = asList<Doc>(g.players);
  const setPlayers = (list: Doc[]) => save({ ...g, players: list });
  const display = asMap(g.display);
  const setDisplay = (k: string, v: Doc) => save({ ...g, display: { ...display, [k]: v } });

  return (
    <div className="form">
      <label className="field">
        <span>게임 이름</span>
        <input value={String(g.name ?? '')} onChange={(e) => save({ ...g, name: e.target.value })} />
      </label>

      <h3>플레이어</h3>
      <p className="muted">게임에 참여하는 사람들이에요. 차례는 위에서부터 돌아가요.</p>
      {players.map((p, i) => (
        <div key={i} className="row">
          <input aria-label="이름" value={String(p.name ?? '')} onChange={(e) => setPlayers(players.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
          <input aria-label="색" type="color" value={String(p.color ?? '#888888')} onChange={(e) => setPlayers(players.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)))} />
          <span className="muted">id: {String(p.id)}</span>
          <button className="btn btn-small" disabled={players.length <= 1} onClick={() => setPlayers(players.filter((_, j) => j !== i))}>빼기</button>
        </div>
      ))}
      <button className="btn btn-small" onClick={() => {
        const id = freshId('p', players.map((p) => String(p.id)));
        setPlayers([...players, { id, name: `${players.length + 1}번`, color: '#3c8c4a' }]);
      }}>+ 플레이어 추가</button>

      <h3>화면에 보일 값</h3>
      <p className="muted">스크립트에서 <code>player.vars.score</code>처럼 저장한 값을 오른쪽 표에 보여줘요. 왼쪽은 이름(키), 오른쪽은 화면에 쓸 말.</p>
      <div className="two-col">
        <div>
          <strong>플레이어마다</strong>
          <PairList value={asMap(display.player)} onChange={(v) => setDisplay('player', v)} keyLabel="키 (예: score)" valueLabel="보일 이름 (예: 점수)" />
        </div>
        <div>
          <strong>게임 전체</strong>
          <PairList value={asMap(display.game)} onChange={(v) => setDisplay('game', v)} keyLabel="키" valueLabel="보일 이름" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- components and setup

const KINDS = [
  { key: 'pieceTypes', label: '말', base: 'piece' },
  { key: 'cardTypes', label: '카드', base: 'card' },
  { key: 'diceTypes', label: '주사위', base: 'die' },
] as const;

function zoneOptions(files: Record<string, string>) {
  const b = readDoc(files, 'board.yaml') ?? {};
  return asList<Doc>(b.zones).map((z) => ({ id: String(z.id), name: String(z.name ?? z.id), perPlayer: !!z.perPlayer }));
}

export function ComponentsTab({ files, setFiles }: TabProps) {
  const [g, save] = useDoc(files, setFiles, 'game.yaml');
  if (!g) return BROKEN('game.yaml');
  const players = asList<Doc>(g.players);
  const allTypes = KINDS.flatMap((k) => Object.keys(asMap(g[k.key])));
  const zones = zoneOptions(files);
  const board = readDoc(files, 'board.yaml') ?? {};
  const coords = String(board.coords ?? 'square');
  const setup = asList<Doc>(g.setup);
  const setSetup = (list: Doc[]) => save({ ...g, setup: list });

  return (
    <div className="form">
      {KINDS.map((kind) => {
        const types = asMap(g[kind.key]);
        const setTypes = (t: Doc) => save({ ...g, [kind.key]: t });
        return (
          <section key={kind.key}>
            <h3>{kind.label} 종류</h3>
            {Object.entries(types).map(([id, raw]) => {
              const t = asMap(raw);
              const update = (patch: Doc) => setTypes({ ...types, [id]: { ...t, ...patch } });
              const perPlayer = typeof t.label === 'object' && t.label !== null;
              return (
                <div key={id} className="type-card">
                  <div className="row">
                    <strong className="type-id">{id}</strong>
                    {kind.key === 'pieceTypes' && (
                      <label className="check">
                        <input type="checkbox" checked={perPlayer} onChange={(e) => update({
                          label: e.target.checked ? Object.fromEntries(players.map((p) => [p.id, String(t.label ?? id)])) : id,
                        })} />
                        플레이어마다 다르게 보이기
                      </label>
                    )}
                    <button className="btn btn-small" onClick={() => {
                      const { [id]: _, ...rest } = types;
                      setTypes(rest);
                    }}>지우기</button>
                  </div>
                  {perPlayer ? (
                    <div className="row">
                      {players.map((p) => (
                        <label key={String(p.id)} className="field small">
                          <span>{String(p.name)}에게</span>
                          <input value={String(asMap(t.label)[String(p.id)] ?? '')} onChange={(e) => update({ label: { ...asMap(t.label), [String(p.id)]: e.target.value } })} />
                        </label>
                      ))}
                    </div>
                  ) : (
                    <label className="field small">
                      <span>보이는 글자</span>
                      <input value={String(t.label ?? '')} onChange={(e) => update({ label: e.target.value })} />
                    </label>
                  )}
                  {kind.key === 'cardTypes' && (
                    <label className="field small">
                      <span>설명</span>
                      <input value={String(t.text ?? '')} onChange={(e) => update({ text: e.target.value })} />
                    </label>
                  )}
                  {kind.key === 'diceTypes' && (
                    <label className="field small">
                      <span>면 (쉼표로 구분)</span>
                      <input value={asList(t.faces ?? [1, 2, 3, 4, 5, 6]).join(', ')} onChange={(e) => update({
                        faces: e.target.value.split(',').map((x) => x.trim()).filter(Boolean).map((x) => (Number.isNaN(Number(x)) ? x : Number(x))),
                      })} />
                    </label>
                  )}
                  <label className="field small">
                    <span>태그 (쉼표로 구분)</span>
                    <input value={asList(t.tags).join(', ')} onChange={(e) => update({ tags: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} />
                  </label>
                  {kind.key !== 'diceTypes' && (
                    <div>
                      <span className="muted">값 (props): 스크립트에서 <code>card.props.value</code>처럼 읽어요</span>
                      <PairList value={asMap(t.props)} onChange={(v) => update({ props: v })} keyLabel="이름 (예: value)" valueLabel="값" />
                    </div>
                  )}
                </div>
              );
            })}
            <button className="btn btn-small" onClick={() => {
              const id = freshId(kind.base, allTypes);
              setTypes({ ...types, [id]: kind.key === 'diceTypes' ? {} : { label: kind.label } });
            }}>+ {kind.label} 종류 추가</button>
          </section>
        );
      })}

      <h3>처음 배치</h3>
      <p className="muted">게임을 시작할 때 컴포넌트를 어디에 몇 개 놓을지 정해요.</p>
      {setup.map((s, i) => {
        const update = (patch: Doc) => setSetup(setup.map((x, j) => (j === i ? { ...x, ...patch } : x)));
        const usesCoord = s.at !== undefined;
        return (
          <div key={i} className="row setup-row">
            <select aria-label="종류" value={String(s.type ?? '')} onChange={(e) => update({ type: e.target.value })}>
              {allTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select aria-label="놓을 곳" value={usesCoord ? '__at' : String(s.zone ?? '')} onChange={(e) => {
              if (e.target.value === '__at') {
                const { zone: _, perPlayer: __, ...rest } = s;
                setSetup(setup.map((x, j) => (j === i ? { ...rest, at: coords === 'track' ? 0 : [0, 0] } : x)));
              } else {
                const { at: _, ...rest } = s;
                const z = zones.find((x) => x.id === e.target.value);
                setSetup(setup.map((x, j) => (j === i ? { ...rest, zone: e.target.value, ...(z?.perPlayer ? { perPlayer: true } : {}) } : x)));
              }
            }}>
              {zones.map((z) => <option key={z.id} value={z.id}>{z.name}{z.perPlayer ? ' (플레이어마다)' : ''}</option>)}
              {coords !== 'none' && <option value="__at">보드 칸</option>}
            </select>
            {usesCoord && (
              <input aria-label="칸" className="narrow" value={Array.isArray(s.at) ? s.at.join(',') : String(s.at)} onChange={(e) => {
                const parts = e.target.value.split(',').map((x) => Number(x.trim()));
                update({ at: coords === 'track' ? parts[0] ?? 0 : [parts[0] ?? 0, parts[1] ?? 0] });
              }} />
            )}
            <label className="field inline">
              <span>개수</span>
              <input className="narrow" type="number" min={0} value={Number(s.count ?? 1)} onChange={(e) => update({ count: Number(e.target.value) })} />
            </label>
            {!s.perPlayer && (
              <select aria-label="주인" value={String(s.owner ?? '')} onChange={(e) => update({ owner: e.target.value || undefined })}>
                <option value="">주인 없음</option>
                {players.map((p) => <option key={String(p.id)} value={String(p.id)}>{String(p.name)}</option>)}
              </select>
            )}
            {s.perPlayer && <span className="muted">플레이어마다</span>}
            <button className="btn btn-small" onClick={() => setSetup(setup.filter((_, j) => j !== i))}>지우기</button>
          </div>
        );
      })}
      <button className="btn btn-small" disabled={!allTypes.length} onClick={() => setSetup([...setup, {
        type: allTypes[0], ...(zones[0] ? { zone: zones[0].id, ...(zones[0].perPlayer ? { perPlayer: true } : {}) } : { at: coords === 'track' ? 0 : [0, 0] }), count: 1,
      }])}>+ 배치 추가</button>
      {typeof g.cards === 'string' && <p className="muted">카드 목록 파일({g.cards})의 카드는 파일 탭에서 고쳐요.</p>}
    </div>
  );
}

// ---------------------------------------------------------------- board

export function BoardTab({ files, setFiles }: TabProps) {
  const [b, save] = useDoc(files, setFiles, 'board.yaml');
  const [tag, setTag] = useState('');
  if (!b) return BROKEN('board.yaml');
  const coords = String(b.coords ?? 'square');
  const zones = asList<Doc>(b.zones);
  const setZones = (list: Doc[]) => save({ ...b, zones: list });
  const [w, h] = asList<number>(b.size).length === 2 ? asList<number>(b.size) : [3, 3];
  const tags = asMap(b.tags);
  const tagged = (x: number, y: number) => asList<number[]>(tags[tag]).some((c) => c[0] === x && c[1] === y);
  const toggle = (x: number, y: number) => {
    if (!tag) return;
    const list = asList<number[]>(tags[tag]);
    const next = tagged(x, y) ? list.filter((c) => !(c[0] === x && c[1] === y)) : [...list, [x, y]];
    save({ ...b, tags: { ...tags, [tag]: next } });
  };
  const spaces = asList<Doc>(b.spaces);

  return (
    <div className="form">
      <label className="field">
        <span>보드 모양</span>
        <select value={coords} onChange={(e) => {
          const c = e.target.value;
          const base: Doc = { id: b.id ?? 'board', coords: c, zones };
          if (c === 'square') Object.assign(base, { size: [3, 3], style: 'cells', adjacency: 'all' });
          if (c === 'track') Object.assign(base, { closed: false, spaces: Array.from({ length: 10 }, (_, i) => ({ name: i === 0 ? '출발' : String(i) })) });
          if (c === 'open') Object.assign(base, { start: [[0, 0]] });
          save(base);
        }}>
          <option value="square">격자 (체스판, 바둑판)</option>
          <option value="track">트랙 (한 줄로 이어진 칸)</option>
          <option value="open">열린 보드 (타일을 놓을 때마다 커짐)</option>
          <option value="none">보드 없음 (카드 게임)</option>
        </select>
      </label>

      {coords === 'square' && (
        <>
          <div className="row">
            <label className="field inline"><span>가로</span>
              <input className="narrow" type="number" min={1} max={26} value={w} onChange={(e) => save({ ...b, size: [Number(e.target.value), h] })} /></label>
            <label className="field inline"><span>세로</span>
              <input className="narrow" type="number" min={1} max={26} value={h} onChange={(e) => save({ ...b, size: [w, Number(e.target.value)] })} /></label>
            <label className="field inline"><span>놓는 곳</span>
              <select value={String(b.style ?? 'cells')} onChange={(e) => save({ ...b, style: e.target.value })}>
                <option value="cells">칸 안 (체스)</option>
                <option value="points">교차점 (바둑, 장기)</option>
                <option value="cards">카드 자리 (피라미드)</option>
              </select></label>
            <label className="field inline"><span>이웃</span>
              <select value={String(b.adjacency ?? 'orthogonal')} onChange={(e) => save({ ...b, adjacency: e.target.value })}>
                <option value="orthogonal">상하좌우</option>
                <option value="all">대각선 포함</option>
                <option value="none">없음</option>
              </select></label>
          </div>
          <h3>칸에 태그 붙이기</h3>
          <p className="muted">태그 이름을 쓰고 칸을 누르면 붙었다 떨어졌다 해요. 스크립트에서 <code>zone:hasTag("이름")</code>으로 확인해요.</p>
          <div className="row">
            <input placeholder="태그 이름 (예: 궁성)" value={tag} onChange={(e) => setTag(e.target.value)} />
            {Object.keys(tags).map((t) => <button key={t} className={`btn btn-small${t === tag ? ' btn-primary' : ''}`} onClick={() => setTag(t)}>{t}</button>)}
          </div>
          <div className="tag-grid" style={{ gridTemplateColumns: `repeat(${w}, 32px)` }}>
            {Array.from({ length: h }, (_, ry) => h - 1 - ry).flatMap((y) =>
              Array.from({ length: w }, (_, x) => (
                <button key={`${x},${y}`} className={`tag-cell${tag && tagged(x, y) ? ' is-on' : ''}`} onClick={() => toggle(x, y)} title={`${x},${y}`}>
                  {x},{y}
                </button>
              )))}
          </div>
        </>
      )}

      {coords === 'track' && (
        <>
          <label className="check">
            <input type="checkbox" checked={b.closed !== false} onChange={(e) => save({ ...b, closed: e.target.checked })} />
            마지막 칸이 첫 칸과 이어짐 (한 바퀴 도는 트랙)
          </label>
          <h3>칸</h3>
          {spaces.map((sp, i) => (
            <div key={i} className="row">
              <span className="muted narrow">{i}</span>
              <input aria-label="칸 이름" value={String(sp.name ?? '')} onChange={(e) => save({ ...b, spaces: spaces.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
              <input aria-label="태그" placeholder="태그 (쉼표)" value={asList(sp.tags).join(', ')} onChange={(e) => save({
                ...b, spaces: spaces.map((x, j) => (j === i ? { ...x, tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) } : x)),
              })} />
              <button className="btn btn-small" onClick={() => save({ ...b, spaces: spaces.filter((_, j) => j !== i) })}>지우기</button>
            </div>
          ))}
          <button className="btn btn-small" onClick={() => save({ ...b, spaces: [...spaces, { name: String(spaces.length) }] })}>+ 칸 추가</button>
        </>
      )}

      <h3>보드 밖의 존</h3>
      <p className="muted">덱, 손패, 버린 카드처럼 컴포넌트를 모아 두는 곳이에요.</p>
      {zones.map((z, i) => {
        const update = (patch: Doc) => setZones(zones.map((x, j) => (j === i ? { ...x, ...patch } : x)));
        return (
          <div key={i} className="row zone-row">
            <input aria-label="존 id" className="narrow-id" value={String(z.id ?? '')} onChange={(e) => update({ id: e.target.value.replace(/\s/g, '') })} />
            <input aria-label="존 이름" value={String(z.name ?? '')} onChange={(e) => update({ name: e.target.value })} />
            <select aria-label="모양" value={String(z.layout ?? 'row')} onChange={(e) => update({ layout: e.target.value })}>
              <option value="row">펼쳐 놓기</option>
              <option value="pile">더미 (맨 위만)</option>
            </select>
            <select aria-label="보이는 사람" value={String(z.visibility ?? 'public')} onChange={(e) => update({ visibility: e.target.value })}>
              <option value="public">모두에게 보임</option>
              <option value="owner">주인만 보임</option>
              <option value="hidden">아무도 못 봄</option>
              <option value="topOnly">맨 위만 보임</option>
            </select>
            <label className="check">
              <input type="checkbox" checked={!!z.perPlayer} onChange={(e) => update({ perPlayer: e.target.checked })} />
              플레이어마다
            </label>
            <button className="btn btn-small" onClick={() => setZones(zones.filter((_, j) => j !== i))}>지우기</button>
          </div>
        );
      })}
      <button className="btn btn-small" onClick={() => {
        const id = freshId('zone', zones.map((z) => String(z.id)));
        setZones([...zones, { id, name: '새 존', layout: 'row' }]);
      }}>+ 존 추가</button>
    </div>
  );
}
