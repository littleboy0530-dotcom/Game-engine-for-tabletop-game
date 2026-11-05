import { describe, expect, it } from 'vitest';
import type { Engine } from '../src/engine';
import { replay } from '../src/engine';
import { gameDir, pick, play, readGameFolder, startGame } from './helpers';

const files = readGameFolder(gameDir('mahjong'));

/** Deal fixed hands (tile type ids), shuffle the rest into the wall. */
const dealt = (hands: Record<string, string[]>) => ({
  ...files,
  'loop/deal.lua': `
local tiles = use("lib/tiles.lua")
local HANDS = { ${Object.entries(hands).map(([p, h]) => `${p} = { ${h.map((t) => `"${t}"`).join(', ')} }`).join(', ')} }
return { onEnter = function(game)
  local wall = game:zone("wall")
  for _, p in ipairs(game:players()) do
    for _, t in ipairs(HANDS[p.id]) do
      local found = nil
      for _, c in ipairs(wall:cards()) do if c.type == t then found = c break end end
      game:move(found, p:zone("hand"))
    end
    tiles.sort(game, p)
    p.vars.melds = 0
  end
  game:shuffle(wall)
  game.vars.skipDraw = false
  game.vars.wallLeft = wall:count()
end }`,
});

const NORTH = ['m9', 'm9', 'p9', 'p9', 's9', 's9', 'E', 'S', 'W', 'N', 'P', 'F', 'C'];
const scenario = {
  e: ['m5', 'p1', 'p4', 'p7', 's2', 's5', 's8', 'E', 'S', 'W', 'N', 'P', 'F'],
  s: ['m5', 'm5', 'p2', 'p5', 'p8', 's1', 's4', 's7', 'E', 'S', 'W', 'N', 'C'],
  w: ['m1', 'm2', 'm3', 'm4', 'm6', 'p3', 'p3', 'p3', 's3', 's3', 's3', 'C', 'C'], // waits on m5
  n: NORTH,
};

const handTypes = (e: Engine, p: string, zone = 'hand') => e.state.contents[`${zone}@${p}`]!.map((id) => e.state.pieces[id]!.type);

/** East discards its 5만 (whatever it drew). */
function eastDiscardsM5(e: Engine) {
  const p = e.pending!;
  if (p.kind !== 'action') throw new Error('expected east to act');
  const discard = p.actions.find((a) => a.label === '버리기')!;
  const i = discard.options.findIndex((o) => o.label === '5만');
  e.input({ kind: 'action', node: 'discard', option: i });
}

describe('mahjong (response window)', () => {
  it('deals 13 tiles each and lets east draw first', async () => {
    const e = await startGame(files);
    expect(e.error).toBeNull();
    expect(e.state.contents['hand@e']).toHaveLength(14);
    for (const p of ['s', 'w', 'n']) expect(e.state.contents[`hand@${p}`]).toHaveLength(13);
    expect(e.state.vars.wallLeft).toBe(136 - 52 - 1);
    expect(e.pending?.player).toBe('e');
  });

  it('ron beats pon: both are asked, ron wins', async () => {
    const e = await startGame(dealt(scenario));
    eastDiscardsM5(e);
    // south (pon) is asked first, then west (ron); north has nothing to claim
    expect(e.pending).toMatchObject({ kind: 'choose', player: 's' });
    expect(e.pending?.kind === 'choose' && e.pending.options.map((o) => o.label)).toEqual(['퐁 5만', '패스']);
    play(e, '퐁 5만');
    expect(e.pending).toMatchObject({ kind: 'choose', player: 'w' });
    play(e, '론');
    expect(e.state.result).toEqual({ winner: 'w', reason: '론 (동의 5만)' });
    expect(e.state.finished).toBe(true);
  });

  it('pon takes the tile, reveals the set, and the claimer discards without drawing', async () => {
    const e = await startGame(dealt(scenario));
    eastDiscardsM5(e);
    play(e, '퐁 5만', '패스');
    expect(handTypes(e, 's', 'melds')).toEqual(['m5', 'm5', 'm5']);
    expect(e.state.contents['hand@s']).toHaveLength(11);
    expect(e.pending).toMatchObject({ kind: 'action', player: 's' });
    expect(e.pending?.kind === 'action' && e.pending.actions.map((a) => a.label)).toEqual(['버리기']);
    expect(e.state.playerVars.s!.melds).toBe(1);
  });

  it('only the next player can chi', async () => {
    const e = await startGame(dealt({
      ...scenario,
      s: ['m3', 'm4', 'p2', 'p5', 'p8', 's1', 's4', 's7', 'E', 'S', 'W', 'N', 'C'],
      w: ['m1', 'm2', 'm8', 'p3', 'p3', 'p6', 's3', 's3', 's6', 'C', 'C', 'P', 'F'],
    }));
    eastDiscardsM5(e);
    expect(e.pending).toMatchObject({ kind: 'choose', player: 's' });
    play(e, '치 3-4-5');
    expect(handTypes(e, 's', 'melds')).toEqual(['m3', 'm5', 'm4']);
    expect(e.pending?.player).toBe('s');
  });

  it('nobody is asked when nobody can claim', async () => {
    const e = await startGame(dealt({
      ...scenario,
      s: ['m1', 'm9', 'p2', 'p5', 'p8', 's1', 's4', 's7', 'E', 'S', 'W', 'N', 'C'],
      w: ['m1', 'm2', 'm8', 'p3', 'p3', 'p6', 's3', 's3', 's6', 'C', 'C', 'P', 'F'],
    }));
    eastDiscardsM5(e);
    expect(e.pending).toMatchObject({ kind: 'action', player: 's' });
    expect(e.state.contents['hand@s']).toHaveLength(14); // south drew
  });

  it('random hands play to an end, keep 136 tiles, and replay', async () => {
    for (const seed of [1, 2, 3]) {
      const e = await startGame(files, seed);
      let r = seed;
      const rand = () => ((r = (r * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
      for (let i = 0; i < 1500 && e.pending; i++) {
        const p = e.pending;
        if (p.kind === 'action') {
          const win = p.actions.find((a) => a.label === '쯔모');
          const a = win ?? p.actions[0]!;
          e.input({ kind: 'action', node: a.path.at(-1)!, option: Math.floor(rand() * a.options.length) });
        } else {
          const ron = p.options.findIndex((o) => o.label === '론');
          e.input(ron >= 0 ? { kind: 'choose', option: ron } : pick(e, rand() < 0.3 ? p.options[0]!.label : '패스'));
        }
        expect(e.error?.message ?? null).toBeNull();
      }
      expect(e.state.finished).toBe(true);
      const total = Object.values(e.state.contents).reduce((s, l) => s + l.length, 0);
      expect(total).toBe(136);
      const again = await replay(e.def, seed, e.inputs);
      expect(again.state).toEqual(e.state);
    }
  });
});
