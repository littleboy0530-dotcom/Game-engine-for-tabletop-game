import { describe, expect, it } from 'vitest';
import type { Engine } from '../src/engine';
import { replay } from '../src/engine';
import { gameDir, play, readGameFolder, startGame } from './helpers';

const files = readGameFolder(gameDir('castletown'));

/** Draw tiles in a fixed order (by tile type) instead of from the shuffled bag. */
const fixedDraws = (types: string[]) => ({
  ...files,
  'loop/draw.lua': `
local ORDER = { ${types.map((t) => `"${t}"`).join(', ')} }
return {
  onEnter = function(game)
    local i = (game.vars.drawIndex or 0) + 1
    game.vars.drawIndex = i
    game.vars.noTile = ORDER[i] == nil
    if game.vars.noTile then return end
    for _, t in ipairs(game:zone("bag"):components()) do
      if t.type == ORDER[i] then game:move(t, game:zone("drawn")) return end
    end
  end,
  next = function(game) if game.vars.noTile then return "end" end return "ready" end,
}`,
});

const placeAt = (e: Engine, name: string) => {
  const p = e.pending!;
  if (p.kind !== 'action') throw new Error('expected place action');
  const a = p.actions.find((x) => x.label === '타일 놓기')!;
  const i = a.options.findIndex((o) => o.label === name);
  if (i < 0) throw new Error(`${name} not offered: ${a.options.map((o) => o.label).join(' ')}`);
  e.input({ kind: 'action', node: 'place', option: i });
};

const score = (e: Engine, p: string) => e.state.playerVars[p]!.score;

describe('castle town (tiles on an open board)', () => {
  it('starts with the start tile, its parts, and four empty spots around it', async () => {
    const e = await startGame(files);
    expect(e.error).toBeNull();
    const zones = e.boardZones('land').filter((z) => !z.parent && z.x !== null);
    expect(zones.map((z) => z.name).sort()).toEqual(['-1,0', '0,-1', '0,0', '0,1', '1,0']);
    const parts = Object.values(e.state.zones).filter((z) => z.parent === 'land:0,0').map((z) => z.name).sort();
    expect(parts).toEqual(['길', '도시']);
    expect(e.state.contents.drawn).toHaveLength(1);
    expect(e.pending?.kind).toBe('action');
  });

  it('only offers spots where the edges match, and turns the tile to fit', async () => {
    const e = await startGame(fixedDraws(['cityCap']));
    const offered = e.pending?.kind === 'action' ? e.pending.actions[0]!.options.map((o) => o.label).sort() : [];
    // east and west of the start tile are road edges, which a city cap does not have
    expect(offered).toEqual(['0,-1', '0,1']);
    placeAt(e, '0,1');
    const cap = Object.values(e.state.pieces).find((p) => p.type === 'cityCap')!;
    expect(cap.rot).toBe(2);
    expect(e.tileInfo(cap.id).edges.S).toBe('도시');
  });

  it('asks for a direction when several fit', async () => {
    const e = await startGame(fixedDraws(['road']));
    placeAt(e, '1,0'); // a straight road east of the start: horizontal fits (0° and 180°)
    expect(e.pending?.kind).toBe('choose');
    expect(e.pending?.kind === 'choose' && e.pending.options.map((o) => o.label)).toEqual(['그대로', '180°']);
  });

  it('scores a finished city for its worker and gives the worker back', async () => {
    const e = await startGame(fixedDraws(['cityCap', 'road']));
    placeAt(e, '0,1');
    // place a worker on the cap's city: the city (start + cap) is closed at once
    const p = e.pending!;
    const put = p.kind === 'action' ? p.actions.find((a) => a.label === '일꾼 놓기')! : null;
    expect(put!.options.map((o) => o.label)).toEqual(['도시']);
    e.input({ kind: 'action', node: 'put', option: 0 });
    expect(score(e, 'a')).toBe(4); // 2 tiles x 2
    expect(e.state.playerVars.a!.workers).toBe(7);
    expect(e.state.current).toBe('b');
  });

  it('cannot put a worker on a region someone already holds', async () => {
    const e = await startGame(fixedDraws(['road', 'road']));
    placeAt(e, '1,0');
    play(e, '그대로', '길'); // a: worker on the road
    expect(e.state.playerVars.a!.workers).toBe(6);
    placeAt(e, '-1,0');
    play(e, '그대로');
    // b's new road joins a's road, so only skipping is possible
    expect(e.pending?.kind === 'action' && e.pending.actions.map((x) => x.label)).toEqual(['일꾼 안 놓기']);
  });

  it('random full games place every tile legally, finish, and replay', async () => {
    for (const seed of [1, 2]) {
      const e = await startGame(files, seed);
      let r = seed;
      const rand = () => ((r = (r * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
      for (let i = 0; i < 600 && e.pending; i++) {
        const p = e.pending;
        if (p.kind === 'action') {
          const a = p.actions[Math.floor(rand() * p.actions.length)]!;
          e.input({ kind: 'action', node: a.path.at(-1)!, option: Math.floor(rand() * a.options.length) });
        } else e.input({ kind: 'choose', option: Math.floor(rand() * p.options.length) });
        expect(e.error?.message ?? null).toBeNull();
      }
      expect(e.state.finished).toBe(true);
      // every placed tile matches all its neighbours
      const placed = e.boardZones('land').filter((z) => !z.parent && z.x !== null && e.state.contents[z.id]!.some((id) => e.def.pieceTypes[e.state.pieces[id]!.type]!.kind === 'tile'));
      const tileAt = new Map(placed.map((z) => [`${z.x},${z.y}`, e.state.contents[z.id]!.find((id) => e.def.pieceTypes[e.state.pieces[id]!.type]!.kind === 'tile')!]));
      for (const z of placed) {
        const me = e.tileInfo(tileAt.get(`${z.x},${z.y}`)!).edges;
        const east = tileAt.get(`${z.x! + 1},${z.y}`);
        const north = tileAt.get(`${z.x},${z.y! + 1}`);
        if (east) expect(e.tileInfo(east).edges.W).toBe(me.E);
        if (north) expect(e.tileInfo(north).edges.S).toBe(me.N);
      }
      expect(placed.length + e.state.contents.discarded!.length).toBe(54);
      const again = await replay(e.def, seed, e.inputs);
      expect(again.state).toEqual(e.state);
    }
  });
});
