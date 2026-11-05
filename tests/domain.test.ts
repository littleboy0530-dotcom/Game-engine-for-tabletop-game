import { describe, expect, it } from 'vitest';
import type { Engine } from '../src/engine';
import { replay } from '../src/engine';
import { gameDir, pick, play, readGameFolder, startGame } from './helpers';

const files = readGameFolder(gameDir('domain'));

const zoneTypes = (e: Engine, zone: string) => e.state.contents[zone]!.map((id) => e.state.pieces[id]!.type);
const actionLabels = (e: Engine) => (e.pending?.kind === 'action' ? e.pending.actions.map((a) => a.label) : []);
const totalCards = (e: Engine) => Object.values(e.state.contents).reduce((s, l) => s + l.length, 0);

/** Start with a given card put into player a's hand. */
async function withCardInHand(card: string, seed = 1) {
  const prepare = `${files['loop/prepare.lua']!.replace(/return \{[\s\S]*$/, '')}
local original = use("loop/prepare_orig.lua")
return { onEnter = function(game, player)
  original.onEnter(game, player)
  game:move(game:zone("supply_${card}"):top(), game:player("a"):zone("hand"))
end }`;
  return startGame({ ...files, 'loop/prepare.lua': prepare, 'loop/prepare_orig.lua': files['loop/prepare.lua']! }, seed);
}

describe('small domain (deckbuilding)', () => {
  it('deals 5 cards from a shuffled 10-card starting deck', async () => {
    const e = await startGame(files);
    expect(e.error).toBeNull();
    for (const p of ['a', 'b']) {
      expect(e.state.contents[`hand@${p}`]).toHaveLength(5);
      expect(e.state.contents[`deck@${p}`]).toHaveLength(5);
      expect(e.state.playerVars[p]!.points).toBe(3);
    }
    expect(e.state.contents.supply_citadel).toHaveLength(8);
    expect(e.currentPath).toEqual(['turn', 'actions']);
    expect(actionLabels(e)).toEqual(['액션 끝']); // no action cards yet
  });

  it('plays treasures automatically and buys what the coins allow', async () => {
    const e = await startGame(files, 2);
    const coppers = zoneTypes(e, 'hand@a').filter((t) => t === 'copper').length;
    play(e, '액션 끝');
    expect(e.state.playerVars.a!.coins).toBe(coppers);
    const p = e.pending!;
    const buyable = p.kind === 'action' ? p.actions.find((a) => a.label === '사기')!.options.map((o) => o.label) : [];
    expect(buyable).toContain('동전');
    if (coppers >= 3) expect(buyable).toContain('은괴');
    expect(buyable).not.toContain('성채');
    e.input(pick(e, '동전'));
    expect(zoneTypes(e, 'discard@a')).toEqual(['copper']);
    expect(e.state.playerVars.a!.buys).toBe(0);
    expect(actionLabels(e)).toEqual(['턴 끝']);
    play(e, '턴 끝');
    expect(e.state.current).toBe('b');
    expect(e.state.contents['hand@a']).toHaveLength(5);
    expect(e.state.contents['play@a']).toHaveLength(0);
  });

  it('reshuffles the discard pile when the deck runs out', async () => {
    const e = await startGame(files, 3);
    for (let t = 0; t < 4; t++) play(e, '액션 끝', '턴 끝');
    // a has drawn 15 cards from 10: the discard was shuffled back in
    expect(e.error).toBeNull();
    expect(e.state.contents['hand@a']).toHaveLength(5);
    expect(totalCards(e)).toBe(30 + 20 + 12 + 8 * 3 + 60 + 20);
  });

  it('raider makes the other player choose discards down to 3', async () => {
    const e = await withCardInHand('raider');
    play(e, '약탈자');
    // while b decides, the screen shows a's two extra cards (the real state is rolled back until done)
    expect(e.view.contents['hand@a']).toHaveLength(5 + 2);
    expect(e.state.contents['hand@a']).toHaveLength(6);
    expect(e.pending).toMatchObject({ kind: 'choose', player: 'b' });
    e.input({ kind: 'choose', option: 0 });
    expect(e.pending).toMatchObject({ kind: 'choose', player: 'b' });
    e.input({ kind: 'choose', option: 0 });
    expect(e.state.contents['hand@a']).toHaveLength(7);
    expect(e.state.contents['hand@b']).toHaveLength(3);
    expect(e.state.contents['discard@b']).toHaveLength(2);
    expect(e.pending).toMatchObject({ kind: 'action', player: 'a' });
  });

  it('sweeper trashes chosen cards until stopped', async () => {
    const e = await withCardInHand('sweeper');
    play(e, '정리꾼');
    expect(e.pending?.kind).toBe('choose');
    e.input({ kind: 'choose', option: 0 });
    // the trashed card already shows in the trash while choosing the next one
    expect(e.view.contents.trash).toHaveLength(1);
    e.input(pick(e, '그만'));
    expect(e.state.contents.trash).toHaveLength(1);
    expect(e.state.contents['hand@a']).toHaveLength(4);
    expect(actionLabels(e)).toEqual(['액션 끝']);
  });

  it('a greedy game reaches the end and replays exactly', async () => {
    const e = await startGame(files, 7);
    let steps = 0;
    while (e.pending && steps++ < 3000) {
      const p = e.pending;
      if (p.kind === 'choose') {
        e.input({ kind: 'choose', option: 0 });
        continue;
      }
      const play = p.actions.find((a) => a.label === '액션 카드 내기');
      const buy = p.actions.find((a) => a.label === '사기');
      if (play) e.input({ kind: 'action', node: 'playAction', option: 0 });
      else if (buy) {
        // buy the most expensive card on offer
        const costs = buy.options.map((o) => Number(e.state.pieces[o.ref!.id]!.type && e.def.pieceTypes[e.state.pieces[o.ref!.id]!.type]!.props.cost));
        e.input({ kind: 'action', node: 'buy', option: costs.indexOf(Math.max(...costs)) });
      } else e.input({ kind: 'action', node: p.actions.at(-1)!.path.at(-1)!, option: 0 });
      expect(e.error?.message ?? null).toBeNull();
    }
    expect(e.state.finished).toBe(true);
    expect(e.state.result?.reason).toMatch(/승점/);
    const again = await replay(e.def, 7, e.inputs);
    expect(again.state).toEqual(e.state);
  });
});
