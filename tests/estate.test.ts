import { describe, expect, it } from 'vitest';
import type { Engine } from '../src/engine';
import { replay } from '../src/engine';
import { gameDir, pick, play, readGameFolder, startGame } from './helpers';

const files = readGameFolder(gameDir('estate'));

/** Replace dice with a fixed list of step counts. */
const fixedRolls = (steps: number[]) => ({
  ...files,
  'loop/roll.lua': `
local estate = use("lib/estate.lua")
local STEPS = { ${steps.join(', ')} }
return { execute = function(game, player)
  local i = (game.vars.rollIndex or 0) + 1
  game.vars.rollIndex = i
  estate.step(game, player, STEPS[i])
end }`,
});

const money = (e: Engine, p: string) => e.state.playerVars[p]!.money;
const positionOf = (e: Engine, p: string) => {
  const pawn = Object.values(e.state.pieces).find((c) => c.type === 'pawn' && c.owner === p)!;
  return e.def.zones[pawn.zone!]!.name;
};
const actions = (e: Engine) => (e.pending?.kind === 'action' ? e.pending.actions.map((a) => a.label) : []);

describe('estate (roll and move)', () => {
  it('starts with money, pawns on start and two dice', async () => {
    const e = await startGame(files);
    expect(e.error).toBeNull();
    expect(money(e, 'p1')).toBe(150);
    expect(positionOf(e, 'p1')).toBe('출발');
    expect(e.state.contents.dice).toHaveLength(2);
    expect(e.state.contents.events).toHaveLength(9);
    expect(actions(e)).toEqual(['주사위 굴리기']); // nothing to sell yet
  });

  it('buys land, charges rent, doubles rent for a full colour group', async () => {
    const e = await startGame(fixedRolls([1, 1, 3, 2, 2]));
    play(e, '주사위 굴리기');
    expect(positionOf(e, 'p1')).toBe('골목 시장');
    play(e, '골목 시장 사기 (20)');
    expect(money(e, 'p1')).toBe(130);

    play(e, '주사위 굴리기'); // p2 lands on p1's land
    expect(money(e, 'p2')).toBe(146);
    expect(money(e, 'p1')).toBe(134);
    expect(actions(e)).toEqual(['턴 끝']);
    play(e, '턴 끝');

    play(e, '주사위 굴리기', '턴 끝'); // p3 to 작은 공원, does not buy
    play(e, '주사위 굴리기', '작은 공원 사기 (25)'); // p1 1 -> 3 buys the second brown
    play(e, '주사위 굴리기'); // p2 1 -> 3: brown group complete -> rent 5 x 2
    expect(money(e, 'p2')).toBe(146 - 10);
  });

  it('pays a bonus for passing start', async () => {
    const e = await startGame(fixedRolls([19, 10, 10, 2]));
    play(e, '주사위 굴리기', '턴 끝'); // p1 to the last space (쉼터)
    expect(positionOf(e, 'p1')).toBe('쉼터');
    play(e, '주사위 굴리기', '턴 끝', '주사위 굴리기', '턴 끝'); // p2, p3 to 쉼터 on space 10
    play(e, '주사위 굴리기'); // p1 19 -> 1 passes start, lands on unowned land
    expect(positionOf(e, 'p1')).toBe('골목 시장');
    expect(money(e, 'p1')).toBe(150 + 20);
  });

  it('sells land with the common action at any point of the turn', async () => {
    const e = await startGame(fixedRolls([1, 4, 4, 1]));
    play(e, '주사위 굴리기', '골목 시장 사기 (20)');
    play(e, '주사위 굴리기', '턴 끝', '주사위 굴리기', '턴 끝');
    // p1 again, before rolling: can sell
    expect(actions(e)).toEqual(['주사위 굴리기', '땅 팔기']);
    const before = [...e.currentPath];
    e.input(pick(e, '골목 시장'));
    expect(money(e, 'p1')).toBe(130 + 10);
    expect(e.currentPath).toEqual(before);
    expect(actions(e)).toEqual(['주사위 굴리기']);
  });

  it('random games finish without errors, keep money non-negative, and replay', async () => {
    for (const seed of [1, 2, 3]) {
      const e = await startGame(files, seed);
      let r = seed;
      const rand = () => ((r = (r * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
      let steps = 0;
      while (e.pending && steps++ < 2000) {
        const p = e.pending;
        if (p.kind === 'action') {
          // prefer buying, rarely sell
          const buy = p.actions.find((a) => a.label === '땅 사기');
          const others = p.actions.filter((a) => a.label !== '땅 팔기' || rand() < 0.05);
          const a = buy && rand() < 0.8 ? buy : others[Math.floor(rand() * others.length)]!;
          e.input({ kind: 'action', node: a.path.at(-1)!, option: Math.floor(rand() * a.options.length) });
        } else e.input({ kind: 'choose', option: 0 });
        expect(e.error?.message ?? null).toBeNull();
        for (const v of Object.values(e.state.playerVars)) expect(Number(v.money)).toBeGreaterThanOrEqual(0);
      }
      expect(e.state.finished).toBe(true);
      const again = await replay(e.def, seed, e.inputs);
      expect(again.state).toEqual(e.state);
    }
  });
});
