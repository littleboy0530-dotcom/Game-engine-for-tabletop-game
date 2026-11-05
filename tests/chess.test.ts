import { describe, expect, it } from 'vitest';
import type { Engine } from '../src/engine';
import { replay } from '../src/engine';
import { gameDir, readGameFolder, startGame } from './helpers';

const files = readGameFolder(gameDir('chess'));

/** Play "e2-e4" style moves; optional promotion label after '='. */
function moves(e: Engine, ...list: string[]) {
  for (const m of list) {
    const [, from, to, promo] = /^([a-h][1-8])-([a-h][1-8])(?:=(.+))?$/.exec(m)!;
    const p = e.pending;
    if (p?.kind !== 'action') throw new Error(`${m}: expected action request, got ${p?.kind} (${e.error?.message})`);
    const move = p.actions.find((a) => a.label === '말 이동')!;
    const idx = move.options.findIndex((o) => o.label.endsWith(`(${from})`));
    if (idx < 0) throw new Error(`${m}: no movable piece on ${from}`);
    e.input({ kind: 'action', node: 'move', option: idx });
    const c = e.pending;
    if (c?.kind !== 'choose') throw new Error(`${m}: expected destination choice`);
    const t = c.options.findIndex((o) => o.label === to);
    if (t < 0) throw new Error(`${m}: ${to} not legal, options: ${c.options.map((o) => o.label).join(' ')}`);
    e.input({ kind: 'choose', option: t });
    if (promo) {
      const q = e.pending;
      if (q?.kind !== 'choose') throw new Error(`${m}: expected promotion choice`);
      e.input({ kind: 'choose', option: q.options.findIndex((o) => o.label === promo) });
    }
    if (e.error) throw new Error(`${m}: ${e.error.message}`);
  }
}

const at = (e: Engine, square: string) => {
  const zone = Object.values(e.def.zones).find((z) => z.name === square)!;
  const id = e.state.contents[zone.id]![0];
  return id ? `${e.state.pieces[id]!.owner}:${e.state.pieces[id]!.type}` : null;
};

function destinations(e: Engine, from: string): string[] {
  const p = e.pending;
  if (p?.kind !== 'action') throw new Error('not at action');
  const idx = p.actions[0]!.options.findIndex((o) => o.label.endsWith(`(${from})`));
  if (idx < 0) return [];
  e.input({ kind: 'action', node: 'move', option: idx });
  const out = e.pending?.kind === 'choose' ? e.pending.options.map((o) => o.label) : [];
  e.undo();
  return out;
}

function countLegalMoves(e: Engine) {
  const p = e.pending;
  if (p?.kind !== 'action') throw new Error('not at action');
  const move = p.actions.find((a) => a.label === '말 이동')!;
  let n = 0;
  move.options.forEach((_, i) => {
    e.input({ kind: 'action', node: 'move', option: i });
    if (e.pending?.kind === 'choose') n += e.pending.options.length;
    e.undo();
  });
  return n;
}

describe('chess', () => {
  it('starts with 20 legal moves for white', async () => {
    const e = await startGame(files);
    expect(e.error).toBeNull();
    expect(e.pending?.player).toBe('white');
    expect(countLegalMoves(e)).toBe(20);
  });

  it("fool's mate ends the game by checkmate", async () => {
    const e = await startGame(files);
    moves(e, 'f2-f3', 'e7-e5', 'g2-g4', 'd8-h4');
    expect(e.state.finished).toBe(true);
    expect(e.state.result).toEqual({ winner: 'black', reason: '체크메이트' });
    expect(e.currentPath).toEqual(['end']);
  });

  it('castles king side', async () => {
    const e = await startGame(files);
    moves(e, 'e2-e4', 'e7-e5', 'g1-f3', 'b8-c6', 'f1-c4', 'g8-f6', 'e1-g1');
    expect(at(e, 'g1')).toBe('white:king');
    expect(at(e, 'f1')).toBe('white:rook');
    expect(at(e, 'h1')).toBeNull();
  });

  it('does not castle through an attacked square', async () => {
    const e = await startGame(files);
    // black bishop on a6 attacks f1 once e2 and f1 are empty
    moves(e, 'e2-e4', 'b7-b6', 'g2-g3', 'c8-a6', 'f1-g2', 'b8-c6', 'g1-f3', 'g8-f6');
    expect(destinations(e, 'e1')).not.toContain('g1');
    expect(destinations(e, 'e1')).not.toContain('f1');
  });

  it('captures en passant', async () => {
    const e = await startGame(files);
    moves(e, 'e2-e4', 'a7-a6', 'e4-e5', 'd7-d5', 'e5-d6');
    expect(at(e, 'd6')).toBe('white:pawn');
    expect(at(e, 'd5')).toBeNull();
    expect(e.state.contents.captured_white).toHaveLength(1);
  });

  it('promotes a pawn by choice', async () => {
    const e = await startGame(files);
    moves(e, 'a2-a4', 'b7-b5', 'a4-b5', 'a7-a6', 'b5-a6', 'c8-b7', 'a6-b7', 'b8-c6', 'b7-a8=나이트');
    expect(at(e, 'a8')).toBe('white:knight');
  });

  it('a pinned piece cannot move', async () => {
    const e = await startGame(files);
    // Bb4 pins the c3 knight against the king on e1
    moves(e, 'd2-d4', 'e7-e6', 'b1-c3', 'f8-b4');
    const p = e.pending;
    const movable = p?.kind === 'action' ? p.actions[0]!.options.map((o) => o.label) : [];
    expect(movable.some((l) => l.endsWith('(c3)'))).toBe(false);
    expect(movable.some((l) => l.endsWith('(g1)'))).toBe(true);
  });

  it('replays a full game to the same position', async () => {
    const e = await startGame(files, 5);
    moves(e, 'e2-e4', 'e7-e5', 'g1-f3', 'b8-c6', 'f1-c4', 'g8-f6', 'e1-g1');
    const again = await replay(e.def, 5, e.inputs);
    expect(again.state).toEqual(e.state);
  });

  it('resign ends the game', async () => {
    const e = await startGame(files);
    const p = e.pending;
    expect(p?.kind === 'action' && p.actions.map((a) => a.label)).toEqual(['말 이동', '기권']);
    e.input({ kind: 'action', node: 'resign', option: 0 });
    expect(e.state.result).toEqual({ winner: 'black', reason: '백 기권' });
  });
});
