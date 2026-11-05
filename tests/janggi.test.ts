import { describe, expect, it } from 'vitest';
import type { Engine } from '../src/engine';
import { gameDir, play, readGameFolder, startGame } from './helpers';

const files = readGameFolder(gameDir('janggi'));

function destinations(e: Engine, from: string): string[] {
  const p = e.pending;
  if (p?.kind !== 'action') throw new Error(`not at action: ${e.error?.message}`);
  const move = p.actions.find((a) => a.label === '말 이동')!;
  const idx = move.options.findIndex((o) => o.label.endsWith(`(${from})`));
  if (idx < 0) return [];
  e.input({ kind: 'action', node: 'move', option: idx });
  const out = e.pending?.kind === 'choose' ? e.pending.options.map((o) => o.label).sort() : [];
  e.undo();
  return out;
}

function mv(e: Engine, from: string, to: string) {
  const p = e.pending;
  if (p?.kind !== 'action') throw new Error('not at action');
  const move = p.actions.find((a) => a.label === '말 이동')!;
  const idx = move.options.findIndex((o) => o.label.endsWith(`(${from})`));
  if (idx < 0) throw new Error(`no movable piece at ${from}`);
  e.input({ kind: 'action', node: 'move', option: idx });
  const c = e.pending;
  if (c?.kind !== 'choose') throw new Error('expected destination');
  const t = c.options.findIndex((o) => o.label === to);
  if (t < 0) throw new Error(`${to} not legal from ${from}: ${c.options.map((o) => o.label).join(' ')}`);
  e.input({ kind: 'choose', option: t });
  if (e.error) throw new Error(e.error.message);
}

/** Start from a custom position: replaces the setup list and skips the arrangement phase. */
async function position(pieces: [string, string, number, number][]) {
  const game = files['game.yaml']!;
  const custom = game.slice(0, game.indexOf('\nsetup:')) + '\nsetup:\n' +
    pieces.map(([t, o, x, y]) => `  - { type: ${t}, owner: ${o}, at: [${x}, ${y}] }`).join('\n') + '\n';
  const e = await startGame({ ...files, 'game.yaml': custom, 'loop/setup.lua': 'return {}' });
  expect(e.error).toBeNull();
  return e;
}

async function started(cho = '마상마상', han = '마상마상') {
  const e = await startGame(files);
  expect(e.error).toBeNull();
  expect(e.pending).toMatchObject({ kind: 'choose', player: 'cho' });
  play(e, cho);
  expect(e.pending).toMatchObject({ kind: 'choose', player: 'han' });
  play(e, han);
  return e;
}

describe('janggi', () => {
  it('places horses and elephants by each player\'s arrangement', async () => {
    const e = await started('마상마상', '상마상마');
    const typeAt = (x: number, y: number) => {
      const id = e.state.contents[`board:${x},${y}`]![0];
      return id ? e.state.pieces[id]!.type : null;
    };
    expect([1, 2, 6, 7].map((x) => typeAt(x, 0))).toEqual(['horse', 'elephant', 'horse', 'elephant']);
    // han's left is x=7, seen from the top
    expect([7, 6, 2, 1].map((x) => typeAt(x, 9))).toEqual(['elephant', 'horse', 'elephant', 'horse']);
    expect(e.pending).toMatchObject({ kind: 'action', player: 'cho' });
    expect(e.currentPath).toEqual(['turn']);
  });

  it('moves general and guards along palace lines only', async () => {
    const e = await started();
    expect(destinations(e, '4,1')).toEqual(['3,1', '3,2', '4,0', '4,2', '5,1', '5,2']);
    expect(destinations(e, '3,0')).toEqual(['3,1', '4,0']);
  });

  it('blocks the horse when the straight step is occupied', async () => {
    const e = await started('마상마상');
    // horse on (1,0): left is the chariot, right is the elephant -> only via (1,1)
    expect(destinations(e, '1,0')).toEqual(['0,2', '2,2']);
  });

  it('blocks the elephant when its path is occupied', async () => {
    const e = await started('상마상마');
    // elephant (1,0): up (1,1) -> (0,2)?/(2,2) -> (−1,3) off board / (3,3) empty
    expect(destinations(e, '1,0')).toEqual(['3,3']);
  });

  it('cannon needs a non-cannon screen and cannot capture cannons', async () => {
    const e = await started();
    expect(destinations(e, '1,2')).toEqual([]);
    mv(e, '2,3', '1,3'); // cho soldier steps sideways in front of the cannon
    mv(e, '0,6', '0,5'); // han
    // jump over the soldier, stop before han's cannon on (1,7)
    expect(destinations(e, '1,2')).toEqual(['1,4', '1,5', '1,6']);
  });

  it('soldiers never move backwards', async () => {
    const e = await started();
    expect(destinations(e, '4,3')).toEqual(['3,3', '4,4', '5,3']);
  });

  it('chariot follows the palace diagonal through the centre', async () => {
    const e = await position([
      ['general', 'cho', 4, 1], ['general', 'han', 5, 9], ['chariot', 'cho', 3, 7],
    ]);
    const d = destinations(e, '3,7');
    expect(d).toContain('4,8');
    expect(d).toContain('5,9'); // captures through the empty centre
    expect(d).not.toContain('2,8');
  });

  it('soldier goes diagonally forward only along palace lines', async () => {
    const e = await position([
      ['general', 'cho', 4, 1], ['general', 'han', 3, 9], ['soldier', 'cho', 3, 7], ['soldier', 'cho', 0, 5],
    ]);
    expect(destinations(e, '3,7')).toEqual(['2,7', '3,8', '4,7', '4,8']);
    expect(destinations(e, '0,5')).toEqual(['0,6', '1,5']);
  });

  it('a piece that would expose its general cannot move', async () => {
    // han chariot on (4,9) pins cho's guard on (4,2) against cho's general on (4,1)
    const e = await position([
      ['general', 'cho', 4, 1], ['guard', 'cho', 4, 2], ['general', 'han', 3, 9], ['chariot', 'han', 4, 9],
    ]);
    expect(destinations(e, '4,2')).toEqual([]);
  });

  it('checkmate ends the game', async () => {
    // chariots on files 3 and 5 cut off the corners; the third one checks along file 4
    const e = await position([
      ['general', 'cho', 4, 1], ['general', 'han', 4, 9],
      ['chariot', 'cho', 3, 5], ['chariot', 'cho', 5, 5], ['chariot', 'cho', 8, 4],
    ]);
    mv(e, '8,4', '4,4');
    expect(e.state.result).toEqual({ winner: 'cho', reason: '외통수' });
    expect(e.state.finished).toBe(true);
  });

  it('no legal move without check is a draw', async () => {
    const e = await position([
      ['general', 'cho', 4, 1], ['general', 'han', 4, 9],
      ['chariot', 'cho', 3, 5], ['chariot', 'cho', 5, 5], ['chariot', 'cho', 0, 7],
    ]);
    mv(e, '0,7', '0,8'); // covers rank 8, no check on the general
    expect(e.state.result).toEqual({ winner: null, reason: '둘 수 있는 수가 없음' });
  });

  it('resign ends the game', async () => {
    const e = await started();
    e.input({ kind: 'action', node: 'resign', option: 0 });
    expect(e.state.result).toEqual({ winner: 'han', reason: '초 기권' });
    expect(e.state.finished).toBe(true);
  });
});
