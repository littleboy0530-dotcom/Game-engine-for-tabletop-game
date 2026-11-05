import { describe, expect, it } from 'vitest';
import { LOOP_LIMIT, loadGame, DefinitionError, replay } from '../src/engine';
import { pick, play, startGame } from './helpers';

const base = {
  'game.yaml': `
name: test
players:
  - { id: a, name: A }
  - { id: b, name: B }
pieceTypes:
  stone: { label: S }
setup:
  - { type: stone, owner: a, at: [0, 0] }
`,
  'board.yaml': `
id: main
size: [3, 1]
zoneDefaults: { accepts: [piece] }
`,
};

/** turn -> (add | roll) -> check -> turn ... -> end */
const counter = {
  ...base,
  'loop.yaml': `
nodes:
  start: { type: start }
  turn:  { type: phase, label: 턴 }
  add:   { type: action, label: 더하기, script: add.lua }
  roll:  { type: action, label: 굴리기, script: roll.lua }
  check: { type: phase, label: 확인, script: check.lua }
  end:   { type: end }
edges:
  - [start, turn]
  - [turn, add]
  - [turn, roll]
  - [add, check]
  - [roll, check]
  - [check, turn]
  - [check, end]
`,
  'add.lua': `
return {
  options = function(game, player) return { 1, 2 } end,
  execute = function(game, player, n)
    game.vars.calls = (game.vars.calls or 0) + 1
    local extra = game:choose(player, { 0, 10 }, "보너스?")
    game.vars.total = (game.vars.total or 0) + n + extra
  end,
}`,
  'roll.lua': `
return {
  execute = function(game, player)
    local r = game:roll(6)
    game.vars.total = (game.vars.total or 0) + r
    local rolls = game.vars.rolls or {}
    rolls[#rolls + 1] = r
    game.vars.rolls = rolls
  end,
}`,
  'check.lua': `
return {
  onEnter = function(game, player)
    if (game.vars.total or 0) >= 20 then game:win(player, "20점 도달") end
    game:nextPlayer()
  end,
  next = function(game) if game:isOver() then return "end" end return "turn" end,
}`,
};

describe('loop graph', () => {
  it('waits for an action, runs it, and moves on', async () => {
    const e = await startGame(counter);
    expect(e.error).toBeNull();
    expect(e.pending?.kind).toBe('action');
    expect(e.currentPath).toEqual(['turn']);
    expect(e.pending?.player).toBe('a');
    play(e, '2', '10');
    expect(e.state.vars.total).toBe(12);
    expect(e.state.current).toBe('b');
    expect(e.currentPath).toEqual(['turn']);
  });

  it('re-runs a script from the start after choose, without doubling effects', async () => {
    const e = await startGame(counter);
    play(e, '1');
    expect(e.pending?.kind).toBe('choose');
    expect(e.state.vars.calls).toBeUndefined(); // rolled back while waiting
    play(e, '0');
    expect(e.state.vars.calls).toBe(1);
    expect(e.state.vars.total).toBe(1);
  });

  it('ends the game through the end node', async () => {
    const e = await startGame(counter);
    play(e, '2', '10', '2', '10');
    expect(e.state.finished).toBe(true);
    expect(e.state.result).toEqual({ winner: 'b', reason: '20점 도달' });
    expect(e.currentPath).toEqual(['end']);
  });

  it('undo restores the previous state and request', async () => {
    const e = await startGame(counter);
    play(e, '2', '10');
    e.undo();
    expect(e.pending?.kind).toBe('choose');
    expect(e.state.vars.total).toBeUndefined();
    e.undoToAction();
    expect(e.pending?.kind).toBe('action');
    expect(e.inputs).toHaveLength(0);
  });

  it('replays the same inputs to the same state (random included)', async () => {
    const e = await startGame(counter, 1234);
    play(e, '', '', '');
    // all three moves were rolls
    const again = await replay(e.def, 1234, e.inputs);
    expect(again.state).toEqual(e.state);
    const other = await replay(e.def, 99, e.inputs);
    expect(other.state.vars.rolls).not.toEqual(e.state.vars.rolls);
  });
});

describe('script rules', () => {
  const withScript = (name: string, src: string) => ({ ...counter, [name]: src });

  it('blocks state changes in judgment scripts', async () => {
    const e = await startGame(withScript('add.lua', `
return {
  options = function(game) game.vars.x = 1 return { 1 } end,
  execute = function() end,
}`));
    expect(e.error?.message).toContain('판정 스크립트에서는 상태를 바꿀 수 없어요');
    expect(e.error?.path).toEqual(['turn']);
  });

  it('blocks global variables', async () => {
    const e2 = await startGame(withScript('add.lua', `
return { execute = function(game) counter = 1 end }`));
    e2.input({ kind: 'action', node: 'add', option: 0 });
    expect(e2.error?.message).toContain("전역 변수 'counter'");
    expect(e2.error?.message).toContain('add.lua:2');
  });

  it('blocks math.random', async () => {
    const e = await startGame(withScript('add.lua', `
return { execute = function(game) local x = math.random() end }`));
    e.input({ kind: 'action', node: 'add', option: 0 });
    expect(e.error?.message).toContain('game:roll()');
  });

  it('rejects next() pointing at an unconnected node', async () => {
    const e = await startGame(withScript('check.lua', `
return { next = function() return "add" end }`));
    play(e, '2');
    e.input(pick(e, '0'));
    expect(e.error?.message).toContain("연결되지 않은 노드 'add'");
  });

  it('simulate leaves the real state untouched', async () => {
    const e = await startGame(withScript('add.lua', `
return {
  execute = function(game, player)
    local stone = game:pieces("stone")[1]
    local seen = game:simulate(function(g)
      g:move(stone, g:board():zoneAt(2, 0))
      return stone.zone.name
    end)
    game.vars.seen = seen
    game.vars.real = stone.zone.name
  end,
}`));
    e.input({ kind: 'action', node: 'add', option: 0 });
    expect(e.error).toBeNull();
    expect(e.state.vars).toMatchObject({ seen: '2,0', real: '0,0' });
  });
});

describe('loop limit', () => {
  it('asks for next() when a node has several exits', async () => {
    const e = await startGame({
      ...base,
      'loop.yaml': `
nodes:
  start: { type: start }
  ping:  { type: phase }
  pong:  { type: phase }
  end:   { type: end }
edges:
  - [start, ping]
  - [ping, pong]
  - [pong, ping]
  - [pong, end]
`,
    });
    expect(e.error?.message).toContain('next');
  });

  it(`stops after ${LOOP_LIMIT} transitions without input and reports the cycle`, async () => {
    const e = await startGame({
      ...base,
      'loop.yaml': `
nodes:
  start: { type: start }
  ping:  { type: phase }
  pong:  { type: phase, script: pong.lua }
  end:   { type: end }
edges:
  - [start, ping]
  - [ping, pong]
  - [pong, ping]
  - [pong, end]
`,
      'pong.lua': 'return { next = function() return "ping" end }',
    });
    expect(e.error?.message).toContain(`${LOOP_LIMIT}번`);
    expect(new Set(e.error?.trail?.slice(-4))).toEqual(new Set(['ping', 'pong']));
  });
});

describe('definition errors', () => {
  it('rejects a phase that mixes action and non-action exits', () => {
    expect(() => loadGame({
      ...counter,
      'loop.yaml': `
nodes:
  start: { type: start }
  turn:  { type: phase }
  add:   { type: action, script: add.lua }
  end:   { type: end }
edges:
  - [start, turn]
  - [turn, add]
  - [turn, end]
  - [add, turn]
`,
    })).toThrow(DefinitionError);
  });

  it('names the missing script file', () => {
    expect(() => loadGame({ ...counter, 'add.lua': undefined as unknown as string })).toThrow(/add\.lua/);
  });

  it('pick helper sanity', async () => {
    const e = await startGame(counter);
    expect(pick(e, '1')).toEqual({ kind: 'action', node: 'add', option: 0 });
  });
});
