// Spike 1: can a Lua script pause at `choose` and resume with JS input,
// including when the call chain passes through a JS-implemented engine function?
import { LuaFactory } from 'wasmoon';

const lua = await new LuaFactory().createEngine();

// JS engine function that calls back into Lua (like game:play(card) -> card.onPlay)
lua.global.set('js_play', (fnName) => {
  const fn = lua.global.get(fnName);
  return fn();
});

await lua.doString(`
  function choose(options)
    return coroutine.yield({ kind = "choose", options = options })
  end

  function card_onPlay()
    local n = choose({ "a", "b", "c" })   -- choose inside a JS->Lua callback
    return "card chose " .. n
  end

  function execute_pure()
    local x = choose({ 1, 2, 3 })
    local y = choose({ 4, 5 })
    return "pure: " .. x .. "," .. y
  end

  function execute_via_js()
    return js_play("card_onPlay")
  end

  function run(fnName, inputs)
    local co = coroutine.create(_G[fnName])
    local i = 1
    local ok, v = coroutine.resume(co)
    while ok and coroutine.status(co) ~= "dead" do
      ok, v = coroutine.resume(co, inputs[i]); i = i + 1
    end
    return tostring(ok) .. " | " .. tostring(v)
  end
`);

const run = lua.global.get('run');
console.log('A. pure Lua chain   :', run('execute_pure', [2, 5]));
console.log('B. through JS call  :', run('execute_via_js', ['b']));
lua.global.close();
