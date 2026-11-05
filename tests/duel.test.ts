import { describe, expect, it } from 'vitest';
import type { Engine } from '../src/engine';
import { replay } from '../src/engine';
import { gameDir, pick, play, readGameFolder, startGame } from './helpers';

const files = readGameFolder(gameDir('duel'));

type Spot = { hand?: string[]; field?: string[] };
/** Start with chosen cards in hand and on the field (taken from each deck). */
const arranged = (a: Spot, b: Spot) => ({
  ...files,
  'loop/prepare.lua': `
local duel = use("lib/duel.lua")
local SETUP = {
  a = { hand = { ${(a.hand ?? []).map((t) => `"${t}"`).join(', ')} }, field = { ${(a.field ?? []).map((t) => `"${t}"`).join(', ')} } },
  b = { hand = { ${(b.hand ?? []).map((t) => `"${t}"`).join(', ')} }, field = { ${(b.field ?? []).map((t) => `"${t}"`).join(', ')} } },
}
return { onEnter = function(game)
  for _, p in ipairs(game:players()) do
    for _, where in ipairs({ "hand", "field" }) do
      for _, t in ipairs(SETUP[p.id][where]) do
        for _, c in ipairs(p:zone("deck"):cards()) do
          if c.type == t then game:move(c, p:zone(where)) break end
        end
      end
    end
    game:shuffle(p:zone("deck"))
    p.vars.life = duel.START_LIFE
  end
  duel.updateMana(game)
end }`,
});

const zoneTypes = (e: Engine, zone: string) => e.state.contents[zone]!.map((id) => e.state.pieces[id]!.type);
const labels = (e: Engine) => (e.pending?.kind === 'action' ? e.pending.actions.map((a) => a.label) : []);
const prompt = (e: Engine) => (e.pending?.kind === 'choose' ? e.pending.prompt : '');

describe('small duel (TCG: modifiers, tapping, chain)', () => {
  it('deals five cards and lets the first player act', async () => {
    const e = await startGame(files);
    expect(e.error).toBeNull();
    expect(e.state.contents['hand@a']).toHaveLength(5);
    expect(e.state.playerVars.a!.life).toBe(15);
    expect(e.pending?.player).toBe('a');
  });

  it('allows one land per turn and taps lands to pay', async () => {
    const e = await startGame(arranged({ hand: ['forest', 'forest', 'wolf'], field: ['forest'] }, {}));
    play(e, '숲');
    expect(e.state.playerVars.a!.mana).toBe(2);
    expect(labels(e)).not.toContain('땅 내기');
    play(e, '늑대');
    expect(e.state.playerVars.a!.mana).toBe(0);
    const lands = e.state.contents['field@a']!.filter((id) => e.state.pieces[id]!.type === 'forest');
    expect(lands.map((id) => e.state.pieces[id]!.rot)).toEqual([1, 1]);
    // the new wolf is summoning sick: no attack yet
    expect(labels(e)).not.toContain('공격하기');
  });

  it('applies continuous modifiers: banner bearer +1, sword +2', async () => {
    const e = await startGame(arranged(
      { hand: ['sword', 'forest'], field: ['forest', 'wolf', 'bannerman'] },
      { field: ['bear'] },
    ));
    play(e, '숲', '전사의 검', '늑대'); // equip the wolf
    play(e, '공격하기', '늑대', '공격 선언 끝');
    // the defender sees the wolf's power: 2 base + 1 banner + 2 sword
    expect(prompt(e)).toBe('늑대(공격력 5)을 막을까요?');
  });

  it('a replacement effect reduces damage (tortoise takes 1 less)', async () => {
    const e = await startGame(arranged({ hand: ['arrow'], field: ['forest'] }, { field: ['tortoise'] }));
    play(e, '화살');
    e.input(pick(e, '가시 거북'));
    const tortoise = Object.values(e.state.pieces).find((p) => p.type === 'tortoise' && p.owner === 'b')!;
    expect(tortoise.props.damage).toBe(1);
    expect(tortoise.zone).toBe('field@b');
  });

  it('instants in combat resolve newest first (chain)', async () => {
    // a attacks with a wolf and pumps it; b answers with an arrow that kills it first
    const e = await startGame(arranged(
      { hand: ['ambush'], field: ['forest', 'wolf'] },
      { hand: ['arrow'], field: ['forest'] },
    ));
    play(e, '공격하기', '늑대'); // the only ready creature: declaring ends by itself
    // no blockers on b's side, so straight to the spell window: a first
    play(e, '기습', '늑대');
    expect(e.pending).toMatchObject({ kind: 'choose', player: 'b' });
    play(e, '화살', '늑대');
    // both passed after that: arrow resolves first, the wolf dies, the pump does nothing
    expect(zoneTypes(e, 'grave@a')).toContain('wolf');
    expect(e.state.playerVars.b!.life).toBe(15);
    const log = e.state.log.join('\n');
    expect(log.indexOf('늑대 쓰러짐')).toBeGreaterThan(-1);
    expect(log).not.toContain('기습: 늑대 공격력 +2');
  });

  it('a temporary boost ends at the next turn', async () => {
    const e = await startGame(arranged({ hand: ['ambush'], field: ['forest', 'wolf'] }, { field: ['bear'] }));
    play(e, '기습', '늑대');
    const wolf = Object.values(e.state.pieces).find((p) => p.type === 'wolf' && p.owner === 'a')!;
    expect((wolf.props.__boosts as unknown[]).length).toBe(1);
    play(e, '턴 끝');
    expect(e.state.pieces[wolf.id]!.props.__boosts).toBeUndefined();
  });

  it('random games end in a win and replay exactly', async () => {
    for (const seed of [1, 2, 3]) {
      const e = await startGame(files, seed);
      let r = seed;
      const rand = () => ((r = (r * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
      for (let i = 0; i < 3000 && e.pending; i++) {
        const p = e.pending;
        if (p.kind === 'action') {
          // prefer doing things over ending the turn
          const doing = p.actions.filter((a) => a.label !== '턴 끝');
          const a = doing.length && rand() < 0.85 ? doing[Math.floor(rand() * doing.length)]! : p.actions.at(-1)!;
          e.input({ kind: 'action', node: a.path.at(-1)!, option: Math.floor(rand() * a.options.length) });
        } else e.input({ kind: 'choose', option: Math.floor(rand() * p.options.length) });
        expect(e.error?.message ?? null).toBeNull();
      }
      expect(e.state.finished).toBe(true);
      const again = await replay(e.def, seed, e.inputs);
      expect(again.state).toEqual(e.state);
    }
  });
});
