import { describe, expect, it } from 'vitest';
import type { Engine } from '../src/engine';
import { gameDir, pick, play, readGameFolder, startGame } from './helpers';

const files = readGameFolder(gameDir('poker'));
const TOTAL = 600;

const chips = (e: Engine) =>
  Object.values(e.state.playerVars).reduce((s, v) => s + Number(v.chips ?? 0), 0) + Number(e.state.vars.pot ?? 0);

const labels = (e: Engine) =>
  e.pending?.kind === 'action' ? e.pending.actions.flatMap((a) => a.options.map((o) => o.label || a.label)) : [];

describe('poker hand ranking', () => {
  // evaluate fixed 7-card sets with the game's own lib, through a replaced seat script
  const hands: Record<string, string[]> = {
    royal: ['SA', 'SK', 'SQ', 'SJ', 'S10', 'H2', 'D3'],
    wheelFlush: ['HA', 'H2', 'H3', 'H4', 'H5', 'S9', 'D9'],
    quads: ['S9', 'H9', 'D9', 'C9', 'SK', 'H2', 'D3'],
    fullHouse: ['S9', 'H9', 'D9', 'CK', 'SK', 'HK', 'D3'],
    flush: ['S2', 'S7', 'S9', 'SJ', 'SK', 'H9', 'D9'],
    wheel: ['SA', 'H2', 'D3', 'C4', 'S5', 'HK', 'DK'],
    broadway: ['SA', 'HK', 'DQ', 'CJ', 'S10', 'H2', 'D2'],
    trips: ['S9', 'H9', 'D9', 'C2', 'SK', 'H5', 'D3'],
    twoPairHigh: ['S9', 'H9', 'DK', 'CK', 'S2', 'H2', 'DA'],
    twoPairLow: ['S9', 'H9', 'DK', 'CK', 'S2', 'H2', 'DQ'],
    pair: ['S9', 'H9', 'DK', 'C7', 'S2', 'H4', 'DA'],
    high: ['S9', 'H7', 'DK', 'C4', 'S2', 'H5', 'DA'],
  };
  const seat = `
local poker = use("lib/poker.lua")
local HANDS = { ${Object.entries(hands).map(([k, v]) => `${k} = { ${v.map((c) => `"${c}"`).join(', ')} }`).join(',\n')} }
return { onEnter = function(game)
  for name, ids in pairs(HANDS) do
    local cards = {}
    for i, id in ipairs(ids) do cards[i] = game:cards(id)[1] end
    local s = poker.evaluate(cards)
    game.vars[name] = poker.name(s) .. " " .. table.concat(s, ",")
  end
  game.vars.cmpTwoPair = poker.compare(poker.evaluate({ ${hands.twoPairHigh!.map((c) => `game:cards("${c}")[1]`).join(', ')} }),
                                        poker.evaluate({ ${hands.twoPairLow!.map((c) => `game:cards("${c}")[1]`).join(', ')} }))
  use("loop/seat_orig.lua").onEnter(game)
end }`;

  it('ranks hands correctly', async () => {
    const e = await startGame({ ...files, 'loop/seat.lua': seat, 'loop/seat_orig.lua': files['loop/seat.lua']! });
    expect(e.error).toBeNull();
    const v = e.state.vars;
    expect(v.royal).toBe('스트레이트 플러시 8,14');
    expect(v.wheelFlush).toBe('스트레이트 플러시 8,5');
    expect(v.quads).toBe('포카드 7,9,13');
    expect(v.fullHouse).toBe('풀 하우스 6,13,9');
    expect(v.flush).toBe('플러시 5,13,11,9,7,2');
    expect(v.wheel).toBe('스트레이트 4,5');
    expect(v.broadway).toBe('스트레이트 4,14');
    expect(v.trips).toBe('트리플 3,9,13,5');
    expect(v.twoPairHigh).toBe('투 페어 2,13,9,14');
    expect(v.pair).toBe('원 페어 1,9,14,13,7');
    expect(v.high).toBe('하이 카드 0,14,13,9,7,5');
    expect(v.cmpTwoPair).toBe(1); // ace kicker beats queen kicker
  });
});

describe('poker flow', () => {
  it('posts blinds and starts preflop left of the big blind', async () => {
    const e = await startGame(files);
    expect(e.error).toBeNull();
    expect(e.state.vars).toMatchObject({ dealer: 'p1', bigBlind: 'p3', pot: 15, streetName: '프리플롭' });
    expect(e.state.playerVars.p2).toMatchObject({ chips: 195, bet: 5 });
    expect(e.state.playerVars.p3).toMatchObject({ chips: 190, bet: 10 });
    expect(e.pending?.player).toBe('p1');
    expect(labels(e)).toEqual(['폴드', '콜 10', '레이즈']);
    expect(e.state.contents['hand@p1']).toHaveLength(2);
    expect(e.state.contents.deck).toHaveLength(46);
    // hands are hidden from other players
    const card = e.state.contents['hand@p1']![0]!;
    expect(e.isVisible(card, 'p1')).toBe(true);
    expect(e.isVisible(card, 'p2')).toBe(false);
  });

  it('folding around gives the pot to the big blind and starts a new hand', async () => {
    const e = await startGame(files);
    play(e, '폴드', '폴드');
    // p3 won 15, then posted the next hand's small blind of 5
    expect(e.state.playerVars.p3).toMatchObject({ chips: 200, bet: 5 });
    expect(e.state.vars.handNo).toBe(2);
    expect(e.state.vars.dealer).toBe('p2');
    expect(chips(e)).toBe(TOTAL);
  });

  it('checks down to a showdown and reveals hands', async () => {
    const e = await startGame(files, 4);
    play(e, '콜 10', '콜 5', '체크'); // preflop
    expect(e.state.vars.streetName).toBe('플롭');
    expect(e.state.contents.community).toHaveLength(3);
    for (const street of ['턴', '리버', null]) {
      play(e, '체크', '체크', '체크');
      if (street) expect(e.state.vars.streetName).toBe(street);
    }
    expect(e.state.vars.handNo).toBe(2);
    expect(e.state.log.some((l) => l.startsWith('승자'))).toBe(true);
    expect(chips(e)).toBe(TOTAL);
  });

  it('raise asks for an amount and reopens the betting', async () => {
    const e = await startGame(files);
    e.input(pick(e, '레이즈'));
    expect(e.pending?.kind).toBe('choose');
    const opts = e.pending?.kind === 'choose' ? e.pending.options.map((o) => o.label) : [];
    expect(opts[0]).toBe('총 20까지');
    expect(opts.at(-1)).toBe('총 200까지 (올인)');
    play(e, '총 20까지');
    expect(e.state.vars.currentBet).toBe(20);
    expect(e.pending?.player).toBe('p2');
    expect(labels(e)).toContain('콜 15');
  });

  it('keeps chips constant through random play, all-ins included', async () => {
    for (const seed of [1, 2, 3, 4]) {
      const e = await startGame(files, seed);
      let r = seed;
      const rand = () => ((r = (r * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
      for (let i = 0; i < 150 && e.pending; i++) {
        const p = e.pending;
        if (p.kind === 'action') {
          const a = p.actions[Math.floor(rand() * p.actions.length)]!;
          e.input({ kind: 'action', node: a.path.at(-1)!, option: 0 });
        } else {
          e.input({ kind: 'choose', option: Math.floor(rand() * p.options.length) });
        }
        expect(e.error?.message ?? null).toBeNull();
        expect(chips(e)).toBe(TOTAL);
      }
    }
  });
});
