import { describe, expect, it } from 'vitest';
import type { Engine } from '../src/engine';
import { replay } from '../src/engine';
import { gameDir, readGameFolder, startGame } from './helpers';

const files = readGameFolder(gameDir('pyramid'));

const at = (e: Engine, x: number, y: number) => e.state.contents[`pyramid:${x},${y}`]![0];

describe('card pyramid (covered cards)', () => {
  it('deals 15 cards with two face-down rows, and only the front row is available', async () => {
    const e = await startGame(files);
    expect(e.error).toBeNull();
    expect(e.state.contents.deck).toHaveLength(21 - 15);
    expect(e.state.pieces[at(e, 1, 1)!]!.face).toBe('down');
    expect(e.state.pieces[at(e, 2, 2)!]!.face).toBe('up');
    const sell = e.pending?.kind === 'action' ? e.pending.actions.find((a) => a.label === '팔기')! : null;
    const spots = sell!.options.map((o) => e.state.pieces[o.ref!.id]!.zone).sort();
    expect(spots).toEqual(['pyramid:0,0', 'pyramid:2,0', 'pyramid:4,0', 'pyramid:6,0', 'pyramid:8,0']);
  });

  it('uncovers and flips a card when both cards in front of it are gone', async () => {
    const e = await startGame(files);
    const sellAt = (x: number, y: number) => {
      const p = e.pending!;
      if (p.kind !== 'action') throw new Error('expected action');
      const sell = p.actions.find((a) => a.label === '팔기')!;
      const i = sell.options.findIndex((o) => e.state.pieces[o.ref!.id]!.zone === `pyramid:${x},${y}`);
      e.input({ kind: 'action', node: 'sell', option: i });
    };
    sellAt(0, 0);
    expect(e.state.pieces[at(e, 1, 1)!]!.face).toBe('down'); // (2,0) still covers it
    sellAt(2, 0);
    expect(e.state.pieces[at(e, 1, 1)!]!.face).toBe('up');
    expect(e.state.playerVars.a!.coins).toBe(5);
    expect(e.state.playerVars.b!.coins).toBe(5);
  });

  it('random games empty the pyramid or win by symbols, and replay', async () => {
    for (const seed of [1, 2, 3, 4]) {
      const e = await startGame(files, seed);
      let r = seed;
      const rand = () => ((r = (r * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
      for (let i = 0; i < 100 && e.pending; i++) {
        const p = e.pending;
        if (p.kind !== 'action') throw new Error('unexpected choose');
        const a = p.actions[Math.floor(rand() * p.actions.length)]!;
        e.input({ kind: 'action', node: a.path.at(-1)!, option: Math.floor(rand() * a.options.length) });
        expect(e.error?.message ?? null).toBeNull();
      }
      expect(e.state.finished).toBe(true);
      const again = await replay(e.def, seed, e.inputs);
      expect(again.state).toEqual(e.state);
    }
  });
});
