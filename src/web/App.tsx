import { useCallback, useEffect, useMemo, useState } from 'react';
import wasmUrl from 'wasmoon/dist/glue.wasm?url';
import { Engine, loadGame, type GameDef, type Input } from '../engine';
import { Board, inkOn } from './Board';
import { choicesByRef, choicesOf, type Choice } from './choices';
import { GAMES } from './games';
import { LoopGraph } from './LoopGraph';
import { Mat } from './Mat';
import { RingBoard } from './RingBoard';

interface Menu {
  choices: Choice[];
  x: number;
  y: number;
}

function newSeed() {
  return Math.floor(Math.random() * 1_000_000);
}

function loadDef(id: string): { def: GameDef | null; error: string | null } {
  const folder = GAMES.find((g) => g.id === id);
  if (!folder) return { def: null, error: `게임이 없어요: ${id}` };
  try {
    return { def: loadGame(folder.files), error: null };
  } catch (e) {
    return { def: null, error: (e as Error).message };
  }
}

export function App() {
  const [gameId, setGameId] = useState(GAMES.find((g) => g.id === 'chess')?.id ?? GAMES[0]?.id ?? '');
  const [seed, setSeed] = useState(newSeed);
  const [created, setEngine] = useState<Engine | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<Menu | null>(null);
  /** Hot-seat: whose eyes the screen is currently for. */
  const [seenBy, setSeenBy] = useState<string | null>(null);
  const [, setVersion] = useState(0);
  const refresh = () => setVersion((v) => v + 1);

  const { def, error: loadError } = useMemo(() => loadDef(gameId), [gameId]);

  useEffect(() => {
    if (!def) return;
    let alive = true;
    let made: Engine | null = null;
    setEngine(null);
    setMenu(null);
    setSeenBy(null);
    setRunError(null);
    Engine.create(def, { seed, wasmUrl }).then(
      (e) => {
        made = e;
        if (alive) setEngine(e);
        else e.close();
      },
      (err) => alive && setRunError(String(err)),
    );
    return () => {
      alive = false;
      made?.close();
    };
  }, [def, seed]);

  // the engine of the previous game can linger for one render after switching games
  const engine = created && created.def === def && created.seed === seed ? created : null;

  const send = useCallback(
    (input: Input) => {
      if (!engine) return;
      setMenu(null);
      setBusy(true);
      // let the browser paint the busy state before the (synchronous) engine work
      requestAnimationFrame(() => {
        setTimeout(() => {
          engine.input(input);
          setBusy(false);
          refresh();
        }, 0);
      });
    },
    [engine],
  );

  const undo = () => {
    if (!engine) return;
    setMenu(null);
    engine.undoToAction();
    refresh();
  };

  const pending = engine?.pending ?? null;
  const view = engine?.view;
  const hidden = !!engine?.hasHiddenInfo;
  const viewer = pending?.player ?? null;
  const covered = hidden && !!viewer && viewer !== seenBy && !view?.finished;

  const choices = useMemo(() => choicesOf(pending), [pending]);
  const targets = useMemo(() => choicesByRef(choices), [choices]);
  // anything not clickable on the table becomes a button
  const buttons = choices.filter((c) => {
    if (!c.ref || c.ref.kind === 'player') return true;
    if (c.ref.kind === 'piece') return !engine?.isVisible(c.ref.id, viewer) && !onTable(engine, c.ref.id);
    return false;
  });

  const pick = (list: Choice[], e: React.MouseEvent) => {
    if (busy) return;
    if (list.length === 1) send(list[0]!.input);
    else setMenu({ choices: list, x: e.clientX, y: e.clientY });
  };

  const players = def?.players ?? [];
  const current = players.find((p) => p.id === (pending?.player ?? view?.current));
  const winner = view?.result ? players.find((p) => p.id === view.result!.winner) : undefined;
  const board = def?.boards[0];
  const gridBoard = board && board.coords === 'square' ? board : null;
  const ringBoard = board && board.coords === 'track' ? board : null;

  return (
    <div className="app" onClick={() => setMenu(null)}>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden>◆</span>
          <span>Tabletop Engine</span>
        </div>
        <label className="game-select">
          <span>게임</span>
          <select value={gameId} onChange={(e) => setGameId(e.target.value)}>
            {GAMES.map((g) => (
              <option key={g.id} value={g.id}>
                {gameName(g.files) ?? g.id}
              </option>
            ))}
          </select>
        </label>
        <div className="topbar-actions">
          <button className="btn" onClick={undo} disabled={!engine?.canUndo || busy}>
            되돌리기
          </button>
          <button className="btn" onClick={() => setSeed(newSeed())} disabled={busy}>
            새 게임
          </button>
        </div>
      </header>

      {(loadError || runError) && (
        <div className="error-box">
          <strong>게임을 불러오지 못했어요</strong>
          <code>{loadError ?? runError}</code>
        </div>
      )}

      {def && (
        <main className="layout">
          <section className="board-area">
            {!engine || !view ? (
              <div className="loading">엔진 준비 중…</div>
            ) : (
              <div className={`table${busy ? ' is-busy' : ''}${covered ? ' is-covered' : ''}`}>
                {gridBoard && (
                  <div className="board-wrap">
                    <Board engine={engine} board={gridBoard} targets={targets} onPick={pick} />
                  </div>
                )}
                {ringBoard && <RingBoard engine={engine} board={ringBoard} viewer={viewer} targets={targets} onPick={pick} />}
                <Mat engine={engine} viewer={viewer} targets={targets} onPick={pick} />
                {covered && current && (
                  <div className="cover">
                    <div className="cover-box">
                      <span className="player-chip big" style={{ background: current.color, color: inkOn(current.color) }}>{current.name}</span>
                      <p>
                        {current.name}에게 화면을 넘겨주세요.
                        <br />
                        <span className="muted">다른 사람의 손패는 가려져 있어요.</span>
                      </p>
                      <button className="btn btn-primary" onClick={() => setSeenBy(viewer)}>
                        {current.name}입니다, 보여주세요
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          <aside className="side">
            {engine && view && (
              <>
                <div className="status card">
                  {view.finished ? (
                    <div className="result">
                      <div className="result-title">{winner ? `${winner.name} 승리` : '무승부'}</div>
                      <div className="result-reason">{view.result?.reason}</div>
                      <button className="btn btn-primary" onClick={() => setSeed(newSeed())}>
                        한 판 더
                      </button>
                    </div>
                  ) : engine.error ? (
                    <div className="error-inline">
                      <strong>규칙 스크립트 오류</strong>
                      <code>{engine.error.message}</code>
                      {engine.error.path && <div className="muted">위치: {engine.error.path.join(' / ')}</div>}
                      {engine.error.trail && <div className="muted">반복된 노드: {engine.error.trail.slice(-6).join(' → ')}</div>}
                    </div>
                  ) : covered ? (
                    <div className="prompt">화면을 넘겨받을 때까지 기다리는 중</div>
                  ) : (
                    <>
                      <div className="turn">
                        {current && (
                          <span className="player-chip" style={{ background: current.color, color: inkOn(current.color) }}>
                            {current.name}
                          </span>
                        )}
                        <span>의 차례</span>
                        {busy && <span className="spinner" aria-label="계산 중" />}
                      </div>
                      <div className="prompt">
                        {pending?.kind === 'choose'
                          ? pending.prompt
                          : targets.size
                            ? '강조된 것을 눌러서 고르거나, 아래 버튼을 누르세요'
                            : '할 일을 고르세요'}
                      </div>
                      {buttons.length > 0 && (
                        <div className="buttons">
                          {buttons.map((c, i) => (
                            <button key={i} className="btn" onClick={() => send(c.input)} disabled={busy}>
                              {c.label}
                            </button>
                          ))}
                        </div>
                      )}
                      {pending?.kind === 'choose' && (
                        <button className="btn btn-ghost" onClick={undo} disabled={busy}>
                          취소
                        </button>
                      )}
                    </>
                  )}
                </div>

                {(def.display.player.length > 0 || def.display.game.length > 0) && (
                  <div className="card stats">
                    {def.display.game.length > 0 && (
                      <div className="game-vars">
                        {def.display.game.map((d) => (
                          <span key={d.key}>
                            {d.label} <strong>{fmt(view.vars[d.key])}</strong>
                          </span>
                        ))}
                      </div>
                    )}
                    {def.display.player.length > 0 && (
                      <table>
                        <thead>
                          <tr>
                            <th />
                            {def.display.player.map((d) => <th key={d.key}>{d.label}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {players.map((p) => (
                            <tr key={p.id} className={p.id === current?.id ? 'is-current' : ''}>
                              <td>
                                <span className="dot" style={{ background: p.color }} />
                                {p.name}
                              </td>
                              {def.display.player.map((d) => <td key={d.key}>{fmt(view.playerVars[p.id]?.[d.key])}</td>)}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}

                <div className="card log">
                  <div className="card-title">기록</div>
                  <ol reversed>
                    {[...view.log].reverse().slice(0, 80).map((l, i) => (
                      <li key={view.log.length - i}>{l}</li>
                    ))}
                  </ol>
                  <div className="meta">
                    시드 {engine.seed} · 입력 {engine.inputs.length}개
                  </div>
                </div>
              </>
            )}
          </aside>

          <section className="loop-area card">
            <div className="card-title">
              게임 루프 <span className="muted">— 지금 위치가 강조돼요</span>
            </div>
            <LoopGraph
              loop={def.loop}
              current={view?.cursor.path ?? []}
              waiting={!!pending}
              finished={!!view?.finished}
              errorAt={engine?.error?.path ?? null}
              trail={engine?.error?.trail}
              available={new Set(pending?.kind === 'action' ? pending.actions.map((a) => a.path.join('/')) : [])}
            />
          </section>
        </main>
      )}

      {menu && (
        <div className="pick-menu" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
          {menu.choices.map((c, i) => (
            <button key={i} className="btn btn-small" onClick={() => send(c.input)}>
              {c.group}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Is this component drawn somewhere the player can click it? */
function onTable(engine: Engine | null, id: string) {
  if (!engine) return false;
  return !!engine.view.pieces[id]?.zone;
}

function fmt(v: unknown) {
  if (v === undefined || v === null || v === '') return '–';
  if (typeof v === 'boolean') return v ? '예' : '아니요';
  return String(v);
}

function gameName(files: Record<string, string>) {
  return /^name:\s*(.+)$/m.exec(files['game.yaml'] ?? '')?.[1]?.trim();
}
