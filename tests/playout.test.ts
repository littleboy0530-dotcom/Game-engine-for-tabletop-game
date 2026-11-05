// Random playouts: pick random legal inputs and make sure the engine and the
// game scripts never error, and that replay reproduces the exact same state.
import { describe, expect, it } from 'vitest';
import { replay, type Engine } from '../src/engine';
import { gameDir, readGameFolder, startGame } from './helpers';

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function randomPlay(e: Engine, plies: number, seed: number) {
  const r = rng(seed);
  let steps = 0;
  while (e.pending && steps < plies * 3) {
    const p = e.pending;
    if (p.kind === 'action') {
      // never resign in playouts
      const moves = p.actions.filter((a) => a.label !== '기권');
      const a = moves[Math.floor(r() * moves.length)]!;
      e.input({ kind: 'action', node: a.path[a.path.length - 1]!, option: Math.floor(r() * a.options.length) });
    } else {
      e.input({ kind: 'choose', option: Math.floor(r() * p.options.length) });
    }
    steps++;
    if (e.error) throw new Error(`step ${steps}: ${e.error.message}`);
  }
}

describe.each(['chess', 'janggi'])('%s random playouts', (name) => {
  const files = readGameFolder(gameDir(name));
  it.each([1, 2, 3])('seed %i plays 40 plies without errors and replays exactly', async (seed) => {
    const e = await startGame(files, seed);
    randomPlay(e, 40, seed);
    expect(e.error).toBeNull();
    const again = await replay(e.def, seed, e.inputs);
    expect(again.state).toEqual(e.state);
  });
});
