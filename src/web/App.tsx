import { useCallback, useEffect, useMemo, useState } from 'react';
import wasmUrl from 'wasmoon/dist/glue.wasm?url';
import { Engine, loadGame, type GameDef, type Input } from '../engine';
import { Board, inkOn } from './Board';
import { choicesByRef, choicesOf, type Choice } from './choices';
import { GAMES } from './games';
import { LoopGraph } from './LoopGraph';

interface Menu {
  choices: Choice[];
  x: number;
  y: number;
}

function newSeed() {
  return Math.floor(Math.random() * 1_000_000);
}

export function App() {
  const [gameId, setGameId] = useState(GAMES.find((g) => g.id === 'chess')?.id ?? GAMES[0]?.id ?? '');
  const [seed, setSeed] = useState(newSeed);
  const [created, setEngine] = useState<Engine | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [, setVersion] = useState(0);
  const refresh = () => setVersion((v) => v + 1);

  const def: GameDef | null = useMemo(() => {
    const folder = GAMES.find((g) => g.id === gameId);
    if (!folder) return null;
    try {
      setLoadError(null);
      return loadGame(folder.files);
    } catch (e) {
      setLoadError((e as Error).message);
      return null;
    }
  }, [gameId]);

  useEffect(() => {
    if (!def) return;
    let alive = true;
    let created: Engine | null = null;
    setEngine(null);
    setMenu(null);
    Engine.create(def, { seed, wasmUrl }).then(
      (e) => {
        created = e;
        if (alive) setEngine(e);
        else e.close();
      },
      (err) => alive && setLoadError(String(err)),
    );
    return () => {
      alive = false;
      created?.close();
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
  const choices = useMemo(() => choicesOf(pending), [pending]);
  const targets = useMemo(() => choicesByRef(choices), [choices]);
  const buttons = choices.filter((c) => !c.ref || c.ref.kind === 'player' || !onGrid(engine, c));

  const pick = (list: Choice[], at: { x: number; y: number }) => {
    if (busy) return;
    if (list.length === 1) send(list[0]!.input);
    else setMenu({ choices: list, ...at });
  };

  const st = engine?.state;
  const players = def?.players ?? [];
  const current = players.find((p) => p.id === (pending?.player ?? st?.current));
  const winner = st?.result ? players.find((p) => p.id === st.result!.winner) : undefined;
  const offGrid = def ? Object.values(def.zones).filter((z) => z.x === null) : [];

  return (
    <div className="app">
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

      {loadError && (
        <div className="error-box">
          <strong>게임을 불러오지 못했어요</strong>
          <code>{loadError}</code>
        </div>
      )}

      {def && (
        <main className="layout">
          <section className="board-area">
            {!engine ? (
              <div className="loading">엔진 준비 중…</div>
            ) : (
              <div className={`board-wrap${busy ? ' is-busy' : ''}`} onClick={() => setMenu(null)}>
                <Board engine={engine} board={def.boards[0]!} targets={targets} onPick={pick} />
                {menu && (
                  <div className="pick-menu" style={{ left: `${menu.x * 100}%`, top: `${menu.y * 100}%` }} onClick={(e) => e.stopPropagation()}>
                    {menu.choices.map((c, i) => (
                      <button key={i} className="btn btn-small" onClick={() => send(c.input)}>
                        {c.group}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          <aside className="side">
            {engine && st && (
              <>
                <div className="status card">
                  {st.finished ? (
                    <div className="result">
                      <div className="result-title">{winner ? `${winner.name} 승리` : '무승부'}</div>
                      <div className="result-reason">{st.result?.reason}</div>
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
                            ? '보드에서 움직일 말을 고르세요'
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

                {offGrid.length > 0 && (
                  <div className="card trays">
                    {offGrid.map((z) => (
                      <div key={z.id} className="tray">
                        <div className="tray-name">{z.name}</div>
                        <div className="tray-pieces">
                          {(st.contents[z.id] ?? []).map((pid) => {
                            const pc = st.pieces[pid]!;
                            const color = players.find((p) => p.id === pc.owner)?.color ?? '#999';
                            return (
                              <span key={pid} className="mini-piece" style={{ background: color, color: inkOn(color) }}>
                                {engine.pieceLabel(pid)}
                              </span>
                            );
                          })}
                          {!(st.contents[z.id]?.length) && <span className="muted">없음</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="card log">
                  <div className="card-title">기록</div>
                  <ol reversed>
                    {[...st.log].reverse().slice(0, 60).map((l, i) => (
                      <li key={st.log.length - i}>{l}</li>
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
              current={st?.cursor.path ?? []}
              waiting={!!pending}
              finished={!!st?.finished}
              errorAt={engine?.error?.path ?? null}
              trail={engine?.error?.trail}
            />
          </section>
        </main>
      )}
    </div>
  );
}

function onGrid(engine: Engine | null, c: Choice) {
  if (!engine || !c.ref) return false;
  if (c.ref.kind === 'zone') return engine.def.zones[c.ref.id]?.x !== null;
  if (c.ref.kind === 'piece') {
    const z = engine.state.pieces[c.ref.id]?.zone;
    return !!z && engine.def.zones[z]?.x !== null;
  }
  return false;
}

function gameName(files: Record<string, string>) {
  return /^name:\s*(.+)$/m.exec(files['game.yaml'] ?? '')?.[1]?.trim();
}
