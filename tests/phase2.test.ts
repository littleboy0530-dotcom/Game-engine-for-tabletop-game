import { describe, expect, it } from 'vitest';
import { loadGame, parseCsv, replay } from '../src/engine';
import { pick, play, startGame } from './helpers';

const cardGame = {
  'game.yaml': `
name: card test
players:
  - { id: a, name: A }
  - { id: b, name: B }
cards: cards.csv
diceTypes:
  d6: {}
  coin: { faces: [{ label: 앞, value: 1 }, { label: 뒤, value: 0 }] }
setup:
  - { type: d6, zone: table }
  - { type: coin, zone: table }
display:
  player: { score: 점수 }
`,
  'cards.csv': `id,label,text,tags,cost,count,zone,perPlayer
gem,보석,"점수 +1, 끝",보물;반짝,2,3,deck,true
rock,돌,,,0,2,deck,true
`,
  'board.yaml': `
id: mat
coords: none
zones:
  - { id: deck, name: 덱, perPlayer: true, layout: pile, visibility: hidden }
  - { id: hand, name: 손패, perPlayer: true, layout: row, visibility: owner }
  - { id: table, name: 탁자, layout: row }
  - { id: discard, name: 버림, layout: pile, visibility: topOnly }
`,
  // round loop > turn loop with a common action and a limited action
  'loop.yaml': `
nodes:
  start: { type: start }
  deal:  { type: phase, script: deal.lua }
  round:
    type: loop
    label: 라운드
    loop:
      nodes:
        start: { type: start }
        turn:  { type: phase, label: 턴, exclude: [peek] }
        draw:  { type: action, label: 뽑기, script: draw.lua, limit: { count: 2, per: round } }
        play:  { type: action, label: 내기, script: play.lua }
        pass:  { type: action, label: 넘기기, script: pass.lua }
        after: { type: phase, label: 다음, script: after.lua }
        peek:  { type: action, label: 엿보기, script: peek.lua, common: true }
        end:   { type: end }
      edges:
        - [start, turn]
        - [turn, draw]
        - [turn, play]
        - [turn, pass]
        - [draw, turn]
        - [play, turn]
        - [pass, after]
        - [after, turn]
        - [after, end]
  tally: { type: phase, script: tally.lua }
  end:   { type: end }
edges:
  - [start, deal]
  - [deal, round]
  - [round, tally]
  - [tally, round]
  - [tally, end]
`,
  'deal.lua': `
return { onEnter = function(game)
  for _, p in ipairs(game:players()) do
    game:shuffle(p:zone("deck"))
  end
end }`,
  'draw.lua': `
return {
  options = function(game, player)
    if player:zone("deck"):isEmpty() then return {} end
    return { "한 장" }
  end,
  execute = function(game, player)
    game:move(player:zone("deck"):top(), player:zone("hand"))
  end,
}`,
  'play.lua': `
return {
  options = function(game, player) return player:zone("hand"):cards() end,
  execute = function(game, player, card)
    game:move(card, game:zone("discard"))
    if card:hasTag("보물") then player.vars.score = (player.vars.score or 0) + card.props.cost end
  end,
}`,
  'pass.lua': `
return { execute = function(game, player) game.vars.passes = (game.vars.passes or 0) + 1 end }`,
  'after.lua': `
return {
  onEnter = function(game) game:nextPlayer() end,
  next = function(game) if game.vars.passes >= 2 then return "end" end return "turn" end,
}`,
  'peek.lua': `
return { execute = function(game, player)
  local d = game:dice("d6")[1]
  game.vars.peeked = game:roll(d)
  game.vars.coin = game:roll(game:dice("coin")[1])
end }`,
  'tally.lua': `
return {
  onEnter = function(game)
    game.vars.rounds = (game.vars.rounds or 0) + 1
    game.vars.passes = 0
    if game.vars.rounds >= 2 then game:draw("끝") end
  end,
  next = function(game) if game:isOver() then return "end" end return "round" end,
}`,
};

const actionLabels = (e: Awaited<ReturnType<typeof startGame>>) =>
  e.pending?.kind === 'action' ? e.pending.actions.map((a) => a.label) : [];

describe('cards and zones', () => {
  it('reads cards from CSV with props, tags and per-player setup', () => {
    const def = loadGame(cardGame);
    expect(def.pieceTypes.gem).toMatchObject({ kind: 'card', label: '보석', text: '점수 +1, 끝', tags: ['보물', '반짝'], props: { cost: 2 } });
    expect(def.zones['hand@a']).toMatchObject({ owner: 'a', visibility: 'owner', name: 'A의 손패' });
    expect(def.setup.filter((s) => s.zone === 'deck@b').map((s) => [s.type, s.count])).toEqual([['gem', 3], ['rock', 2]]);
    expect(def.display.player).toEqual([{ key: 'score', label: '점수' }]);
  });

  it('parses quoted CSV fields', () => {
    expect(parseCsv('a,b\n"x, y","say ""hi"""\n')).toEqual([{ a: 'x, y', b: 'say "hi"' }]);
  });

  it('shuffles reproducibly with the seed', async () => {
    const order = async (seed: number) => {
      const e = await startGame(cardGame, seed);
      return e.state.contents['deck@a']!.map((id) => e.state.pieces[id]!.type).join(',');
    };
    expect(await order(3)).toBe(await order(3));
    const many = new Set(await Promise.all([1, 2, 3, 4, 5, 6].map(order)));
    expect(many.size).toBeGreaterThan(1);
  });

  it('hides hands from other players and decks from everyone', async () => {
    const e = await startGame(cardGame);
    play(e, '한 장');
    const [card] = e.state.contents['hand@a']!;
    expect(e.isVisible(card!, 'a')).toBe(true);
    expect(e.isVisible(card!, 'b')).toBe(false);
    const deckTop = e.state.contents['deck@a']!.at(-1)!;
    expect(e.isVisible(deckTop, 'a')).toBe(false);
    expect(e.hasHiddenInfo).toBe(true);
  });

  it('plays a card from hand and reads static props', async () => {
    const e = await startGame(cardGame, 11);
    play(e, '한 장', '한 장');
    const hand = e.state.contents['hand@a']!.map((id) => e.state.pieces[id]!.type);
    const p = e.pending!;
    expect(p.kind).toBe('action');
    const playAction = p.kind === 'action' ? p.actions.find((a) => a.label === '내기')! : null;
    expect(playAction!.options.map((o) => o.label).sort()).toEqual(hand.map((t) => (t === 'gem' ? '보석' : '돌')).sort());
    const gemIdx = playAction!.options.findIndex((o) => o.label === '보석');
    if (gemIdx >= 0) {
      e.input({ kind: 'action', node: 'play', option: gemIdx });
      expect(e.state.playerVars.a!.score).toBe(2);
      expect(e.state.contents.discard).toHaveLength(1);
    }
  });
});

describe('loop features', () => {
  it('limits an action per entered node', async () => {
    const e = await startGame(cardGame);
    expect(actionLabels(e)).toContain('뽑기');
    play(e, '한 장', '한 장');
    expect(actionLabels(e)).not.toContain('뽑기'); // 2 per round used up
    e.input(pick(e, '넘기기'));
    expect(actionLabels(e)).not.toContain('뽑기'); // still the same round (b's turn)
    e.input(pick(e, '넘기기'));
    // new round -> limit reset
    expect(e.state.vars.rounds).toBe(1);
    expect(actionLabels(e)).toContain('뽑기');
  });

  it('offers common actions everywhere in their loop except excluded nodes, and returns', async () => {
    const withCommon = {
      ...cardGame,
      'loop.yaml': cardGame['loop.yaml'].replace('exclude: [peek]', 'exclude: []'),
    };
    const e = await startGame(withCommon, 5);
    expect(actionLabels(e)).toContain('엿보기');
    const before = [...e.currentPath];
    e.input(pick(e, '엿보기'));
    expect(e.error).toBeNull();
    expect(e.currentPath).toEqual(before);
    expect(e.pending?.kind).toBe('action');
    expect(e.state.vars.peeked).toBeGreaterThanOrEqual(1);
    expect([0, 1]).toContain(e.state.vars.coin);
    // the die shows the rolled face
    const die = Object.values(e.state.pieces).find((p) => p.type === 'd6')!;
    expect(e.pieceLabel(die.id)).toBe(String(e.state.vars.peeked));

    const excluded = await startGame(cardGame);
    expect(actionLabels(excluded)).not.toContain('엿보기');
  });

  it('runs nested loops to the end and replays exactly', async () => {
    const e = await startGame(cardGame, 9);
    play(e, '넘기기', '넘기기', '넘기기', '넘기기');
    expect(e.state.finished).toBe(true);
    expect(e.state.result?.reason).toBe('끝');
    const again = await replay(e.def, 9, e.inputs);
    expect(again.state).toEqual(e.state);
  });

  it('rejects edges drawn to a common action', () => {
    const bad = { ...cardGame, 'loop.yaml': cardGame['loop.yaml'].replace('- [draw, turn]', '- [draw, turn]\n        - [peek, turn]') };
    expect(() => loadGame(bad)).toThrow(/공통 Action/);
  });
});

describe('track board', () => {
  it('builds a closed track with named spaces and props', () => {
    const def = loadGame({
      ...cardGame,
      'board.yaml': `
id: road
coords: track
spaces:
  - { name: 출발 }
  - { name: 숲, props: { price: 3 }, tags: [땅] }
  - { name: 강 }
zones:
  - { id: table, layout: row }
  - { id: deck, perPlayer: true, layout: pile }
  - { id: hand, perPlayer: true, layout: row }
  - { id: discard, layout: pile }
`,
    });
    const b = def.boards[0]!;
    expect(b.coords).toBe('track');
    expect(b.style).toBe('ring');
    expect(def.zones['road:1,0']).toMatchObject({ name: '숲', props: { price: 3 }, tags: ['땅'] });
    expect(b.neighbors['road:2,0']).toContain('road:0,0'); // closed loop
  });
});
