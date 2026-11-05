// Spike 2: "restart-on-input" instead of coroutines.
// - choose() records a pending request and throws when no answer is recorded yet
//   (JS error objects do not survive the Lua boundary, so the flag carries the request).
// - The engine snapshots state before an action, and on NeedInput restores it,
//   asks the player, appends the answer, and re-runs the action from the start.
// - RNG state lives inside the game state, so restore also rewinds randomness.
// Also checks determinism: replaying the full input log reproduces the state.
import { LuaFactory } from 'wasmoon';


function makeEngine(lua) {
  let state, answers, cursor, pending;

  const rng = () => { // mulberry32, state.seed advances
    let t = (state.seed = (state.seed + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const api = {
    choose: (player, options) => {
      const opts = [...options];
      if (cursor < answers.length) return answers[cursor++];
      pending = { player, options: opts };
      throw new Error('NeedInput');
    },
    roll: (sides) => 1 + Math.floor(rng() * sides),
    draw: (player, n) => {
      for (let i = 0; i < n && state.deck.length; i++) state.hands[player].push(state.deck.pop());
    },
    shuffle: () => {
      for (let i = state.deck.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [state.deck[i], state.deck[j]] = [state.deck[j], state.deck[i]];
      }
    },
    hand: (player) => [...state.hands[player]],
    discard: (player, card) => {
      const h = state.hands[player];
      h.splice(h.indexOf(card), 1);
      state.discard.push(card);
    },
    addScore: (player, n) => { state.score[player] += n; },
    // JS engine function that calls back into Lua (the case that broke coroutines)
    play: (player, card) => { lua.global.get('cards')[card](player); },
  };
  lua.global.set('game', api);

  return {
    init(seed) {
      state = { seed, deck: ['c1','c2','c3','c4','c5','c6','c7','c8'], hands: { p1: [] }, discard: [], score: { p1: 0 } };
    },
    // Run one action with the answers given so far. Returns null when done,
    // or the pending input request (state rolled back) when an answer is needed.
    runAction(fnName, given) {
      const snapshot = structuredClone(state);
      answers = given; cursor = 0; pending = null;
      try {
        lua.global.get(fnName)();
        return null;
      } catch (e) {
        state = snapshot;                      // roll back partial effects
        if (pending) return pending;           // flag survives the Lua boundary
        throw e;
      }
    },
    get state() { return state; },
  };
}

const lua = await new LuaFactory().createEngine();
const engine = makeEngine(lua);

await lua.doString(`
  cards = {}
  -- card effect: roll a die, then choose a card from hand to discard, score = roll
  cards.c_effect = function(player)
    local r = game.roll(6)
    local h = game.hand(player)
    local pick = game.choose(player, h)
    game.discard(player, pick)
    game.addScore(player, r)
  end

  function setup()
    game.shuffle()
    game.draw("p1", 4)
  end

  function turn()
    game.play("p1", "c_effect")      -- goes Lua -> JS -> Lua -> choose
    local again = game.choose("p1", { "yes", "no" })
    if again == "yes" then game.play("p1", "c_effect") end
  end
`);

// --- interactive-style run: answer requests as they come ---
function playThrough(seed, policy) {
  engine.init(seed);
  engine.runAction('setup', []);
  const log = [];
  let req;
  while ((req = engine.runAction('turn', log)) !== null) {
    const ans = policy(req);
    log.push(ans);
  }
  return { state: structuredClone(engine.state), log };
}

const policy = (req) => req.options.includes('yes') ? 'yes' : req.options[0];
const live = playThrough(42, policy);
console.log('live   :', JSON.stringify(live.state), 'log=', JSON.stringify(live.log));

// --- replay from log only ---
engine.init(42);
engine.runAction('setup', []);
const r = engine.runAction('turn', live.log);
console.log('replay :', JSON.stringify(engine.state), 'pending=', r);
console.log('deterministic:', JSON.stringify(engine.state) === JSON.stringify(live.state));

// --- different seed must differ ---
const other = playThrough(7, policy);
console.log('seed 7 differs:', JSON.stringify(other.state) !== JSON.stringify(live.state));
lua.global.close();
