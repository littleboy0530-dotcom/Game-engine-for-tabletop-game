import { describe, expect, it } from 'vitest';
import { loadGame } from '../src/engine';
import { actionScript, phaseScript, readRecipe, type RecipeContext } from '../src/web/editor/recipes';
import { TEMPLATES } from '../src/web/projects';
import { pick, play, startGame } from './helpers';

describe('templates', () => {
  it.each(TEMPLATES.map((t) => [t.id, t]))('%s loads and plays a few turns', async (_, t) => {
    const files = t.files();
    expect(() => loadGame(files)).not.toThrow();
    const e = await startGame(files, 3);
    expect(e.error).toBeNull();
    for (let i = 0; i < 12 && e.pending; i++) {
      const p = e.pending;
      if (p.kind === 'action') e.input({ kind: 'action', node: p.actions[0]!.path.at(-1)!, option: 0 });
      else e.input({ kind: 'choose', option: 0 });
      expect(e.error?.message ?? null).toBeNull();
    }
  });
});

describe('recipes', () => {
  const ctx: RecipeContext = { zones: [] };

  it('reads its own settings back, and not after a hand edit', () => {
    const config = { kind: 'phase' as const, steps: [{ id: 'lineWin', values: { n: '4' } }], whenOver: 'end', otherwise: 'turn' };
    const script = phaseScript(config, ctx);
    expect(readRecipe(script, ctx)).toEqual(config);
    expect(readRecipe(script.replace('game:win', 'game:draw'), ctx)).toBeNull();
  });

  it('tic-tac-toe made only from recipes', async () => {
    const files = TEMPLATES.find((t) => t.id === 'grid')!.files();
    files['loop/judge.lua'] = phaseScript({
      kind: 'phase',
      steps: [{ id: 'lineWin', values: { n: '3' } }, { id: 'fullDraw', values: {} }, { id: 'nextPlayer', values: {} }],
      whenOver: 'end', otherwise: 'turn',
    }, ctx);
    const e = await startGame(files);
    // p1: 0,0 1,1 2,2 diagonal; p2: 1,0 2,0
    play(e, '0,0', '1,0', '1,1', '2,0', '2,2');
    expect(e.state.result).toEqual({ winner: 'p1', reason: '한 줄로 3개' });

    const draw = await startGame(files);
    // X O X / X O O / O X X  -> no line
    play(draw, '0,0', '1,0', '2,0', '1,1', '0,1', '2,1', '1,2', '0,2', '2,2');
    expect(draw.state.result).toEqual({ winner: null, reason: '빈 칸이 없음' });
  });

  it('moving to a neighbour captures when allowed', async () => {
    const files = TEMPLATES.find((t) => t.id === 'grid')!.files();
    files['game.yaml'] += 'setup:\n  - { type: stone, owner: p1, at: [0, 0] }\n  - { type: stone, owner: p2, at: [1, 1] }\n';
    files['loop/place.lua'] = actionScript({ kind: 'action', id: 'moveToNeighbor', values: { capture: '예' } }, ctx);
    const e = await startGame(files);
    play(e, '● (0,0)');
    e.input(pick(e, '1,1'));
    expect(Object.values(e.state.pieces).filter((p) => p.zone)).toHaveLength(1);
  });
});
