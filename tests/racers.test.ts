import { describe, expect, it } from 'vitest';
import type { Engine } from '../src/engine';
import { replay } from '../src/engine';
import { gameDir, play, readGameFolder, startGame } from './helpers';

const files = readGameFolder(gameDir('racers'));

/** Fixed rolls that still go through the "rolled" event, so abilities can change them. */
const fixed = (rolls: number[]) => ({
  ...files,
  'loop/roll.lua': `
local race = use("lib/race.lua")
local ROLLS = { ${rolls.join(', ')} }
return { execute = function(game, player)
  local i = (game.vars.rollIndex or 0) + 1
  game.vars.rollIndex = i
  local e = game:emit("rolled", { value = ROLLS[i], player = player })
  race.move(game, race.racer(game, player), e.value)
end }`,
});

const POOL = {
  turtle: '🐢 거북: 1이나 2를 굴리면 +2',
  rabbit: '🐇 토끼: 지나갈 때마다 1칸 더',
  hedgehog: '🦔 고슴도치: 나를 지나간 레이서 1칸 뒤로',
  frog: '🐸 개구리: 6을 굴리면 2칸 더',
  fox: '🦊 여우: 남이 6을 굴리면 1칸 앞으로',
  squirrel: '🐿 다람쥐: 같은 칸에 멈추면 1칸 더',
};

const pos = (e: Engine, type: string) => {
  const r = Object.values(e.state.pieces).find((p) => p.type === type)!;
  return e.def.zones[r.zone!]!.x;
};

async function race(picks: (keyof typeof POOL)[], rolls: number[]) {
  const e = await startGame(fixed(rolls));
  play(e, ...picks.map((p) => POOL[p]));
  return e;
}

describe('racers (abilities as triggers)', () => {
  it('drafts racers in turn and removes picked ones', async () => {
    const e = await startGame(files);
    expect(e.pending?.kind === 'choose' && e.pending.options).toHaveLength(6);
    play(e, POOL.turtle);
    expect(e.pending?.kind === 'choose' && e.pending.options.map((o) => o.label)).not.toContain(POOL.turtle);
    play(e, POOL.rabbit, POOL.fox);
    expect(e.state.playerVars.p1!.racer).toBe('🐢');
    expect(pos(e, 'fox')).toBe(0);
    expect(e.pending?.kind).toBe('action');
  });

  it('turtle adds 2 to a low roll', async () => {
    const e = await race(['turtle', 'rabbit', 'fox'], [1]);
    play(e, '주사위 굴리기');
    expect(pos(e, 'turtle')).toBe(3);
  });

  it('rabbit and hedgehog trigger in first-in first-out order', async () => {
    // rabbit 3; hedgehog 4 (passes rabbit); turtle 1+2=3; rabbit 3 -> 6 passes hedgehog:
    // rabbit's trigger (+1 to 7) runs first, then hedgehog's (-1 back to 6)
    const e = await race(['rabbit', 'hedgehog', 'turtle'], [3, 4, 1, 3]);
    play(e, '주사위 굴리기', '주사위 굴리기', '주사위 굴리기');
    expect([pos(e, 'rabbit'), pos(e, 'hedgehog'), pos(e, 'turtle')]).toEqual([3, 4, 3]);
    play(e, '주사위 굴리기');
    expect(pos(e, 'rabbit')).toBe(6);
    const log = e.state.log.join('\n');
    expect(log.indexOf('🐇 토끼')).toBeLessThan(log.indexOf('🦔 고슴도치'));
  });

  it('fox moves when someone else rolls a 6, frog leaps after its own 6', async () => {
    const e = await race(['frog', 'fox', 'turtle'], [6]);
    play(e, '주사위 굴리기');
    expect(pos(e, 'fox')).toBe(1);
    expect(pos(e, 'frog')).toBe(8); // 6 + 2
  });

  it('squirrel hops off a shared space', async () => {
    const e = await race(['turtle', 'squirrel', 'fox'], [4, 4]);
    play(e, '주사위 굴리기', '주사위 굴리기');
    expect(pos(e, 'turtle')).toBe(4);
    expect(pos(e, 'squirrel')).toBe(5);
  });

  it('random races finish and replay exactly', async () => {
    for (const seed of [1, 2, 3, 4]) {
      const e = await startGame(files, seed);
      const picks = Object.values(POOL);
      play(e, picks[seed % 6]!, picks[(seed + 2) % 6]!, picks[(seed + 4) % 6]!);
      for (let i = 0; i < 200 && e.pending; i++) play(e, '주사위 굴리기');
      expect(e.error).toBeNull();
      expect(e.state.finished).toBe(true);
      expect(e.state.result?.reason).toContain('결승선');
      const again = await replay(e.def, seed, e.inputs);
      expect(again.state).toEqual(e.state);
    }
  });
});
