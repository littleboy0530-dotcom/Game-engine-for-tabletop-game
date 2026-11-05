import { describe, expect, it } from 'vitest';
import { replay } from '../src/engine';
import { pick, play, startGame } from './helpers';

/**
 * Three tokens A, B, C listen to "ping". A re-emits "pong", which B listens to.
 * The order they run in is written to game.vars.order.
 */
const base = (action: string, extra: Record<string, string> = {}) => ({
  'game.yaml': `
name: events
players:
  - { id: p1, name: 하나 }
  - { id: p2, name: 둘 }
pieceTypes:
  a: { label: A }
  b: { label: B }
  c: { label: C }
diceTypes:
  d6: {}
scripts:
  components: components/tokens.lua
  listeners: rules.lua
setup:
  - { type: a, owner: p1, zone: table }
  - { type: b, owner: p2, zone: table }
  - { type: c, zone: table }
  - { type: d6, zone: table }
`,
  'board.yaml': `
id: t
coords: none
zones:
  - { id: table, layout: row }
  - { id: other, layout: row }
`,
  'loop.yaml': `
nodes:
  start: { type: start }
  turn:  { type: phase }
  go:    { type: action, label: 실행, script: go.lua }
  end:   { type: end }
edges:
  - [start, turn]
  - [turn, go]
  - [go, turn]
`,
  'components/tokens.lua': `
local function note(game, s)
  local o = game.vars.order or {}
  o[#o + 1] = s
  game.vars.order = o
end
return {
  a = { on = {
    ping = function(self, game, e) note(game, "A") game:emit("pong", {}) end,
  } },
  b = { on = {
    ping = function(self, game, e) note(game, "B") end,
    pong = function(self, game, e) note(game, "B-pong") end,
    rolled = function(self, game, e) if e.value < 3 then e.value = e.value + 10 end end,
    beforeLeave = function(self, game, e) if e.component == self then e.cancel = true end end,
  } },
  c = { on = {
    ping = function(self, game, e) note(game, "C") end,
    loop = function(self, game, e) game:emit("loop", {}) end,
  } },
}`,
  'rules.lua': `
return { on = {
  ping = function(game, e) local o = game.vars.order or {} o[#o + 1] = "rule" game.vars.order = o end,
} }`,
  'go.lua': action,
  ...extra,
});

const order = async (action: string) => {
  const e = await startGame(base(action));
  play(e, '실행');
  if (e.error) throw new Error(e.error.message);
  return e.state.vars.order;
};

describe('events and triggers', () => {
  it('runs triggers first-in first-out: rules, then the current player and turn order', async () => {
    // A's pong is queued after B and C's ping handlers
    expect(await order(`return { execute = function(game) game:emit("ping", {}) end }`))
      .toEqual(['rule', 'A', 'B', 'C', 'B-pong']);
  });

  it('starts listener order from the current player', async () => {
    const e = await startGame(base(`return { execute = function(game)
      game:setCurrentPlayer(game:player("p2"))
      game:emit("ping", {})
    end }`));
    play(e, '실행');
    // B (p2) before A (p1); C has no owner and comes after the players' components
    expect(e.state.vars.order).toEqual(['rule', 'B', 'A', 'C', 'B-pong']);
  });

  it('runs triggers last-in first-out inside game:chain', async () => {
    expect(await order(`return { execute = function(game) game:chain(function() game:emit("ping", {}) end) end }`))
      // the chain resolves newest first; A's pong, caused while resolving, waits in the normal queue
      .toEqual(['C', 'B', 'A', 'rule', 'B-pong']);
  });

  it('lets before-events change values and cancel', async () => {
    const e = await startGame(base(`return { execute = function(game)
      local a = game:pieces("a")[1]
      local b = game:pieces("b")[1]
      for _, c in ipairs({ a, b }) do
        local ev = game:before("beforeLeave", { component = c })
        if not ev.cancel then game:move(c, game:zone("other")) end
      end
    end }`));
    play(e, '실행');
    const zoneOf = (t: string) => Object.values(e.state.pieces).find((p) => p.type === t)!.zone;
    expect(zoneOf('a')).toBe('other');
    expect(zoneOf('b')).toBe('table'); // B cancelled its own move
  });

  it('lets listeners change a die roll', async () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const e = await startGame(base(`return { execute = function(game)
        local d = game:dice("d6")[1]
        game.vars.result = game:roll(d)
        game.vars.face = d.value
      end }`), seed);
      play(e, '실행');
      const { result, face } = e.state.vars as { result: number; face: number };
      expect(result).toBe(face < 3 ? face + 10 : face);
    }
  });

  it(`stops a trigger chain after 32 and names the triggers`, async () => {
    const e = await startGame(base(`return { execute = function(game) game:emit("loop", {}) end }`));
    e.input(pick(e, '실행'));
    expect(e.error?.message).toMatch(/트리거 연쇄가 32번을 넘어서/);
    expect(e.error?.message).toContain('C(loop)');
  });
});

describe('response windows', () => {
  const respond = (prio: string) => `return { execute = function(game)
    local picks = game:respond(game:players(), function(p) return { "론", "퐁" } end, "반응?", ${prio})
    local out = {}
    for _, x in ipairs(picks) do out[#out + 1] = x.player.id .. ":" .. x.choice end
    game.vars.picks = out
  end }`;

  it('asks each player in turn and keeps the highest priority', async () => {
    const e = await startGame(base(respond('{ priority = { "론", "퐁" }, accept = 1 }')));
    play(e, '실행');
    expect(e.pending).toMatchObject({ kind: 'choose', player: 'p1' });
    expect(e.pending?.kind === 'choose' && e.pending.options.map((o) => o.label)).toEqual(['론', '퐁', '패스']);
    play(e, '퐁');
    expect(e.pending).toMatchObject({ kind: 'choose', player: 'p2' });
    play(e, '론');
    expect(e.state.vars.picks).toEqual(['p2:론']);
  });

  it('drops passes and keeps seat order for ties', async () => {
    const e = await startGame(base(respond('{ priority = { "론", "퐁" } }')));
    play(e, '실행', '퐁', '퐁');
    expect(e.state.vars.picks).toEqual(['p1:퐁', 'p2:퐁']);
    const e2 = await startGame(base(respond('{}')));
    play(e2, '실행', '패스', '패스');
    // an empty Lua table arrives as {}
    expect(Object.keys(e2.state.vars.picks as object)).toHaveLength(0);
  });
});

describe('script players', () => {
  const withAutomaton = (decide: string) => {
    const files = base(`return {
      options = function(game, player) return { "왼쪽", "오른쪽" } end,
      execute = function(game, player, side)
        local o = game.vars.order or {}
        o[#o + 1] = player.id .. ":" .. side
        game.vars.order = o
        game:nextPlayer()
      end,
    }`, { 'ai.lua': decide });
    files['game.yaml'] = files['game.yaml'].replace('- { id: p2, name: 둘 }', '- { id: p2, name: 자동, script: ai.lua }');
    return files;
  };

  it('answers its own turns and records them for replay', async () => {
    const e = await startGame(withAutomaton(`return { decide = function(game, player, req)
      return req.choices[#req.choices]
    end }`), 3);
    expect(e.pending?.player).toBe('p1');
    play(e, '왼쪽');
    expect(e.pending?.player).toBe('p1'); // p2 answered by itself
    expect(e.state.vars.order).toEqual(['p1:왼쪽', 'p2:오른쪽']);
    play(e, '오른쪽');
    expect(e.inputs).toHaveLength(4);
    const again = await replay(e.def, 3, e.inputs);
    expect(again.state).toEqual(e.state);
    expect(again.inputs).toHaveLength(4);
    // undo goes back past the automaton to the person's own turn
    e.undoToAction();
    expect(e.pending?.player).toBe('p1');
    expect(e.state.vars.order).toEqual(['p1:왼쪽', 'p2:오른쪽']);
  });

  it('reports a decide script that cannot change state', async () => {
    const e = await startGame(withAutomaton(`return { decide = function(game, player, req)
      game.vars.x = 1
      return 1
    end }`));
    e.input(pick(e, '왼쪽'));
    expect(e.error?.message).toContain('판정 스크립트에서는 상태를 바꿀 수 없어요');
  });
});
