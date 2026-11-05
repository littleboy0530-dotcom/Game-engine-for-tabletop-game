-- Engine prelude: runs once per Lua engine before any game script.
-- All game state lives in JS. Lua objects here are thin handles holding an id;
-- every read and write goes through the `js` primitives, so rolling back the
-- JS state also rolls back everything scripts can see.

local js = __js
__js = nil

local unpack = table.unpack

local function freeze(t, name)
  return setmetatable({}, {
    __index = t,
    __newindex = function() error(name .. "은(는) 바꿀 수 없어요", 2) end,
  })
end

------------------------------------------------------------------------
-- Object model
------------------------------------------------------------------------

local Piece, Zone, Player, Board = {}, {}, {}, {}
local PieceMT, ZoneMT, PlayerMT, BoardMT = {}, {}, {}, {}
local cache = { piece = {}, zone = {}, player = {}, board = {} }

local function varsProxy(scope)
  return setmetatable({}, {
    __index = function(_, k) return __decode(js.getVar(scope, k)) end,
    __newindex = function(_, k, v) js.setVar(scope, k, __encode(v)) end,
  })
end

local function propsProxy(id)
  return setmetatable({}, {
    __index = function(_, k) return __decode(js.getProp(id, k)) end,
    __newindex = function(_, k, v) js.setProp(id, k, __encode(v)) end,
  })
end

local function piece(id)
  if id == nil then return nil end
  local p = cache.piece[id]
  if not p then
    p = setmetatable({ id = id }, PieceMT)
    cache.piece[id] = p
  end
  return p
end

local function zone(id)
  if id == nil then return nil end
  local z = cache.zone[id]
  if not z then
    local info = js.zoneInfo(id)
    if not info then error("없는 존이에요: " .. tostring(id), 2) end
    z = setmetatable({}, ZoneMT)
    rawset(z, "id", id)
    rawset(z, "name", info.name)
    rawset(z, "x", info.x)
    rawset(z, "y", info.y)
    rawset(z, "tags", info.tags or {})
    rawset(z, "_board", info.board)
    rawset(z, "_owner", info.owner)
    rawset(z, "props", freeze(info.props or {}, "존의 props"))
    rawset(z, "layout", info.layout)
    rawset(z, "visibility", info.visibility)
    rawset(z, "segment", info.segment)
    rawset(z, "_parent", info.parent)
    cache.zone[id] = z
  end
  return z
end

local function player(id)
  if id == nil then return nil end
  local p = cache.player[id]
  if not p then
    local info = js.playerInfo(id)
    if not info then error("없는 플레이어예요: " .. tostring(id), 2) end
    p = setmetatable({}, PlayerMT)
    rawset(p, "id", id)
    rawset(p, "name", info.name)
    rawset(p, "index", info.index)
    rawset(p, "color", info.color)
    rawset(p, "vars", varsProxy(id))
    cache.player[id] = p
  end
  return p
end

local function board(id)
  local b = cache.board[id]
  if not b then
    local info = js.boardInfo(id)
    if not info then error("없는 보드예요: " .. tostring(id), 2) end
    b = setmetatable({}, BoardMT)
    rawset(b, "id", id)
    rawset(b, "width", info.width)
    rawset(b, "height", info.height)
    cache.board[id] = b
  end
  return b
end

local function list(ids, ctor)
  local out = {}
  for i = 1, #(ids or {}) do out[i] = ctor(ids[i]) end
  return out
end

local readonly = function(kind)
  return function(_, k) error(kind .. "의 '" .. tostring(k) .. "' 값은 직접 바꿀 수 없어요", 2) end
end

-- Piece ---------------------------------------------------------------
PieceMT.__index = function(p, k)
  local m = Piece[k]
  if m then return m end
  local id = rawget(p, "id")
  if k == "type" then return js.pieceType(id)
  elseif k == "owner" then return player(js.pieceOwner(id))
  elseif k == "zone" then return zone(js.pieceZone(id))
  elseif k == "label" then return js.pieceLabel(id)
  elseif k == "tags" then return js.pieceTags(id)
  elseif k == "props" then return propsProxy(id)
  elseif k == "exists" then return js.pieceExists(id)
  elseif k == "kind" then return js.pieceKind(id)
  elseif k == "face" then return js.pieceFace(id)
  elseif k == "value" then return js.pieceValue(id)
  elseif k == "text" then return js.pieceText(id)
  elseif k == "rotation" then return js.pieceRot(id)
  end
  return nil
end
PieceMT.__newindex = readonly("말")
PieceMT.__tostring = function(p) return "Piece(" .. rawget(p, "id") .. ")" end

-- 타일: 회전을 적용한 변 이름 ("N", "E", "S", "W" → 레이블)
function Piece:edge(side) return js.tileInfo(rawget(self, "id")).edges[side] end
-- 타일: 회전을 적용한 부분 목록 { {id, kind, sides}, ... }
function Piece:segments() return js.tileInfo(rawget(self, "id")).segments end
function Piece:segment(id)
  for _, sg in ipairs(self:segments()) do if sg.id == id then return sg end end
  return nil
end

function Piece:hasTag(tag)
  for _, t in ipairs(self.tags) do if t == tag then return true end end
  return false
end

-- Zone ----------------------------------------------------------------
ZoneMT.__index = function(z, k)
  local m = Zone[k]
  if m then return m end
  if k == "board" then return board(rawget(z, "_board")) end
  if k == "owner" then return player(rawget(z, "_owner")) end
  if k == "parent" then return zone(rawget(z, "_parent")) end
  return nil
end
ZoneMT.__newindex = readonly("존")
ZoneMT.__tostring = function(z) return "Zone(" .. rawget(z, "id") .. ")" end

function Zone:hasTag(tag)
  for _, t in ipairs(self.tags) do if t == tag then return true end end
  return false
end
-- 존 안의 컴포넌트는 아래(처음)부터 위(마지막) 순서
function Zone:components() return list(js.zoneContents(self.id), piece) end
Zone.pieces = Zone.components
Zone.cards = Zone.components
function Zone:top()
  local ids = js.zoneContents(self.id)
  return piece(ids[#ids])
end
Zone.piece = Zone.top
function Zone:bottom()
  local ids = js.zoneContents(self.id)
  return piece(ids[1])
end
function Zone:isEmpty() return #js.zoneContents(self.id) == 0 end
-- 타일이 놓인 칸의 부분 존들 (일꾼을 놓는 곳)
function Zone:children() return list(js.children(self.id), zone) end
function Zone:child(segment)
  for _, c in ipairs(self:children()) do if c.segment == segment then return c end end
  return nil
end
function Zone:count() return #js.zoneContents(self.id) end

-- Board ---------------------------------------------------------------
BoardMT.__index = Board
BoardMT.__newindex = readonly("보드")

function Board:zoneAt(x, y) return zone(js.zoneAt(self.id, x, y)) end
-- coords: open 보드에 칸을 더한다 (이미 있으면 그 칸)
function Board:addZone(x, y) return zone(js.addZone(self.id, x, y)) end
function Board:zones() return list(js.boardZones(self.id), zone) end
function Board:neighbors(z) return list(js.neighbors(z.id), zone) end
function Board:connected(a, b) return js.connected(a.id, b.id) end
function Board:zonesWithTag(tag) return list(js.zonesWithTag(self.id, tag), zone) end

-- Player --------------------------------------------------------------
PlayerMT.__index = Player
PlayerMT.__newindex = readonly("플레이어")
PlayerMT.__tostring = function(p) return "Player(" .. rawget(p, "id") .. ")" end

function Player:pieces(ptype) return list(js.pieces(ptype, self.id, "piece"), piece) end
function Player:cards(ctype) return list(js.pieces(ctype, self.id, "card"), piece) end
function Player:zone(name)
  local id = js.playerZone(name, self.id)
  if not id then error("플레이어별 존이 없어요: " .. tostring(name), 2) end
  return zone(id)
end

------------------------------------------------------------------------
-- Encoding values that cross into JS (vars, props, choose options)
------------------------------------------------------------------------

function __encode(v)
  local t = type(v)
  if t == "table" then
    local mt = getmetatable(v)
    if mt == PieceMT then return { __ref = "piece", id = rawget(v, "id") } end
    if mt == ZoneMT then return { __ref = "zone", id = rawget(v, "id") } end
    if mt == PlayerMT then return { __ref = "player", id = rawget(v, "id") } end
    if mt == BoardMT then return { __ref = "board", id = rawget(v, "id") } end
    local out = {}
    for k, x in pairs(v) do out[k] = __encode(x) end
    return out
  elseif t == "function" or t == "userdata" or t == "thread" then
    error("이 값은 저장하거나 선택지로 쓸 수 없어요: " .. t, 3)
  end
  return v
end

function __decode(v)
  if type(v) ~= "table" then return v end
  local r = v.__ref
  if r == "piece" then return piece(v.id) end
  if r == "zone" then return zone(v.id) end
  if r == "player" then return player(v.id) end
  if r == "board" then return board(v.id) end
  local out = {}
  for k, x in pairs(v) do out[k] = __decode(x) end
  return out
end

local function describe(v)
  local t = type(v)
  if t == "table" then
    local mt = getmetatable(v)
    if mt == PieceMT then
      if v.kind ~= "piece" then return v.label end
      return v.label .. " (" .. (v.zone and v.zone.name or "-") .. ")"
    end
    if mt == ZoneMT then return v.name end
    if mt == PlayerMT then return v.name end
    if v.label then return tostring(v.label) end
    return "선택지"
  end
  return tostring(v)
end

------------------------------------------------------------------------
-- Judgment scripts run read-only
------------------------------------------------------------------------

local function judge(f, ...)
  local prev = js.setMode("judge")
  local res = table.pack(pcall(f, ...))
  js.setMode(prev)
  if not res[1] then error(res[2], 0) end
  return unpack(res, 2, res.n)
end

------------------------------------------------------------------------
-- Sandboxed modules
------------------------------------------------------------------------

local safeMath = {}
for k, v in pairs(math) do safeMath[k] = v end
safeMath.random = function() error("math.random 대신 game:roll()을 쓰세요 (재현 가능한 무작위)", 2) end
safeMath.randomseed = safeMath.random

local base = {
  pairs = pairs, ipairs = ipairs, next = next, type = type, select = select,
  tostring = tostring, tonumber = tonumber, error = error, assert = assert,
  pcall = pcall, rawequal = rawequal, unpack = unpack,
  math = freeze(safeMath, "math"), string = freeze(string, "string"),
  table = freeze(table, "table"), utf8 = freeze(utf8, "utf8"),
  print = function(...)
    local parts = {}
    for i = 1, select("#", ...) do parts[i] = tostring((select(i, ...))) end
    js.log(table.concat(parts, " "))
  end,
}

local modules = {}
local rawModules = {} -- the tables scripts returned, for iterating with pairs

local function loadModule(path)
  local m = modules[path]
  if m then return m end
  local src = js.source(path)
  if not src then error("스크립트 파일이 없어요: " .. tostring(path), 2) end
  local envMT = { __index = base }
  local env = setmetatable({}, envMT)
  local chunk, err = load(src, "=" .. path, "t", env)
  if not chunk then error(err, 0) end
  local result = chunk()
  if result == nil then result = {} end
  if type(result) ~= "table" then error(path .. ": 스크립트는 테이블을 반환해야 해요", 0) end
  envMT.__newindex = function(_, k)
    error("전역 변수 '" .. tostring(k) .. "'에 값을 저장할 수 없어요. 상태는 game.vars, player.vars, piece.props에 저장하세요", 2)
  end
  m = setmetatable({}, {
    __index = result,
    __newindex = function(_, k) error(path .. "의 '" .. tostring(k) .. "'는 실행 중에 바꿀 수 없어요", 2) end,
  })
  modules[path] = m
  rawModules[path] = result
  return m
end
base.use = loadModule

local function sortedKeys(t)
  local keys = {}
  for k in pairs(t) do keys[#keys + 1] = k end
  table.sort(keys, function(a, b) return tostring(a) < tostring(b) end)
  return keys
end

-- Per-type component tables from all component scripts, and which types listen to which events.
-- Keys are sorted: Lua's pairs order is not fixed, and replays must be exact.
local registry = nil
local function getRegistry()
  if registry then return registry end
  registry = { types = {}, byEvent = {}, rules = {} }
  for _, path in ipairs(js.componentScripts()) do
    loadModule(path)
    local raw = rawModules[path]
    for _, t in ipairs(sortedKeys(raw)) do
      local def = raw[t]
      if registry.types[t] then error(path .. ": 컴포넌트 종류 '" .. t .. "'의 스크립트가 두 군데 있어요", 0) end
      registry.types[t] = def
      if type(def) == "table" and type(def.on) == "table" then
        for _, ev in ipairs(sortedKeys(def.on)) do
          registry.byEvent[ev] = registry.byEvent[ev] or {}
          table.insert(registry.byEvent[ev], t)
        end
      end
    end
  end
  for _, path in ipairs(js.listenerScripts()) do
    loadModule(path)
    local on = rawModules[path].on or {}
    for _, ev in ipairs(sortedKeys(on)) do
      registry.rules[ev] = registry.rules[ev] or {}
      table.insert(registry.rules[ev], { fn = on[ev], label = path })
    end
  end
  return registry
end

------------------------------------------------------------------------
-- game API
------------------------------------------------------------------------

local game = {}
game.vars = varsProxy("")

function game:players() return list(js.players(), player) end
function game:player(id) return player(id) end
function game:currentPlayer() return player(js.current()) end
function game:setCurrentPlayer(p) js.setCurrent(p.id) end
function game:nextPlayer() return player(js.nextPlayer()) end
function game:playerAfter(p) return player(js.playerAfter(p.id)) end
function game:board(id) return board(id or js.firstBoard()) end
function game:zone(id, p)
  if p then return p:zone(id) end
  return zone(id)
end
function game:piece(id) return piece(id) end
game.component = game.piece
function game:pieces(ptype, owner) return list(js.pieces(ptype, owner and owner.id, "piece"), piece) end
function game:cards(ctype, owner) return list(js.pieces(ctype, owner and owner.id, "card"), piece) end
function game:dice(dtype, owner) return list(js.pieces(dtype, owner and owner.id, "die"), piece) end
function game:components(ctype, owner) return list(js.pieces(ctype, owner and owner.id), piece) end

function game:create(ptype, owner, z)
  return piece(js.create(ptype, owner and owner.id, z.id))
end
-- where: "top"(기본) 또는 "bottom". 옮기면 "moved" 이벤트가 난다
function game:move(p, z, where)
  local from = p.zone
  js.move(p.id, z.id, where)
  game:emit("moved", { component = p, from = from, to = z })
end
function game:remove(p) js.remove(p.id) end
function game:shuffle(z) js.shuffle(z.id) end
-- 타일 회전: 시계 방향으로 turns번 90도 / 회전값을 0~3으로 정하기
function game:rotate(p, turns) js.rotate(p.id, turns or 1) end
function game:setRotation(p, r) js.setRotation(p.id, r) end

-- 타일 연결 영역: 이 칸의 이 부분과 변으로 이어진 같은 종류의 부분들
-- 돌려주는 값: { parts = { {zone, segment}, ... }, tiles = 타일 수, open = 열린 변 수,
--               complete = 닫혔는가, meeples = 영역 위의 컴포넌트들 }
local STEP = { N = { 0, 1 }, E = { 1, 0 }, S = { 0, -1 }, W = { -1, 0 } }
local OPPOSITE = { N = "S", E = "W", S = "N", W = "E" }

local function tileIn(z)
  for _, c in ipairs(z:components()) do if c.kind == "tile" then return c end end
  return nil
end
game.tileIn = function(_, z) return tileIn(z) end

function game:region(z, segmentId)
  if not z or z.x == nil then error("game:region: 타일이 놓인 보드 칸이 필요해요 (받은 존: " .. tostring(z and z.name) .. ")", 2) end
  local board = z.board
  local seen, parts, tiles, meeples = {}, {}, {}, {}
  local open, tileCount = 0, 0
  local stack = { { z, segmentId } }
  while #stack > 0 do
    local cur = table.remove(stack)
    local cz, sid = cur[1], cur[2]
    local key = cz.id .. "/" .. sid
    if not seen[key] then
      seen[key] = true
      local tile = tileIn(cz)
      local seg = tile and tile:segment(sid)
      if seg then
        parts[#parts + 1] = { zone = cz, segment = sid, kind = seg.kind }
        if not tiles[cz.id] then tiles[cz.id] = true tileCount = tileCount + 1 end
        local child = cz:child(sid)
        if child then for _, m in ipairs(child:components()) do meeples[#meeples + 1] = m end end
        for _, side in ipairs(seg.sides) do
          local d = STEP[side]
          local nz = board:zoneAt(cz.x + d[1], cz.y + d[2])
          local nt = nz and tileIn(nz)
          if not nt then
            open = open + 1
          else
            for _, other in ipairs(nt:segments()) do
              if other.kind == seg.kind then
                for _, s2 in ipairs(other.sides) do
                  if s2 == OPPOSITE[side] then stack[#stack + 1] = { nz, other.id } end
                end
              end
            end
          end
        end
      end
    end
  end
  return { parts = parts, tiles = tileCount, open = open, complete = open == 0, meeples = meeples }
end

-- 이 타일을 이 칸에 이 회전으로 놓으면 이웃 타일들과 변이 맞는가
function game:fits(tile, z, rot)
  if not z or z.x == nil then error("game:fits: 좌표가 있는 보드 칸이 필요해요 (받은 존: " .. tostring(z and z.name) .. ")", 2) end
  local edges = js.tileInfo(tile.id).edges
  local base = js.pieceRot(tile.id)
  local SIDES = { "N", "E", "S", "W" }
  local function edgeAfter(side)
    -- side에 오는 원래 변: 회전을 (rot - base)만큼 더 했다고 보고 거꾸로 찾는다
    local i
    for k, sd in ipairs(SIDES) do if sd == side then i = k end end
    local from = SIDES[((i - 1 - (rot - base)) % 4) + 1]
    return edges[from]
  end
  local board = z.board
  local touching = false
  for _, side in ipairs(SIDES) do
    local d = STEP[side]
    local nz = board:zoneAt(z.x + d[1], z.y + d[2])
    local nt = nz and tileIn(nz)
    if nt then
      touching = true
      if nt:edge(OPPOSITE[side]) ~= edgeAfter(side) then return false end
    end
  end
  return touching
end
function game:flip(p, face) js.flip(p.id, face) end
-- game:roll(6) → 1~6 숫자, game:roll(주사위) → 주사위를 굴리고 나온 면의 값
-- 주사위를 굴리면 "rolled" 이벤트가 나고, 리스너가 event.value를 바꿀 수 있다
function game:roll(x)
  if type(x) == "table" and getmetatable(x) == PieceMT then
    local value = js.rollDie(x.id)
    local e = game:emit("rolled", { die = x, value = value, player = game:currentPlayer() })
    return e.value
  end
  return js.roll(x or 6)
end
function game:log(...) base.print(...) end

function game:choose(p, options, prompt)
  if type(options) ~= "table" or #options == 0 then error("choose: 고를 선택지가 없어요", 2) end
  local enc, labels = {}, {}
  for i, v in ipairs(options) do
    enc[i] = __encode(v)
    labels[i] = describe(v)
  end
  return __decode(js.choose(p.id, enc, labels, prompt or "선택하세요"))
end

function game:win(p, reason) js.win(p and p.id, reason or "") end
function game:draw(reason) js.win(nil, reason or "무승부") end
function game:isOver() return js.isOver() end

function game:simulate(f)
  return __decode(js.simulate(function() return __encode(f(game)) end))
end

------------------------------------------------------------------------
-- Events and triggers
--
-- game:emit(name, event)  일어난 일을 알린다. 리스너(트리거)는 큐에 쌓였다가
--                          먼저 쌓인 것부터 실행된다 (game:chain 안에서는 나중 것부터)
-- game:before(name, event) 일어나기 전에 묻는다. 리스너가 바로 실행되며
--                          event의 값을 바꾸거나 event.cancel = true로 막을 수 있다
------------------------------------------------------------------------

local TRIGGER_LIMIT = 32
local events = { queue = {}, processing = false, holding = false, lifo = false, count = 0, trace = {} }

local function resetEvents()
  events.queue, events.processing, events.holding, events.lifo, events.count, events.trace = {}, false, false, false, 0, {}
end

local function listenersFor(name)
  local reg = getRegistry()
  local out = {}
  for _, r in ipairs(reg.rules[name] or {}) do out[#out + 1] = { fn = r.fn, label = r.label } end
  local types = reg.byEvent[name]
  if types then
    local comps = {}
    for _, t in ipairs(types) do
      for _, c in ipairs(list(js.pieces(t), piece)) do comps[#comps + 1] = c end
    end
    -- 현재 플레이어부터 턴 순서대로, 주인 없는 것은 마지막, 같은 자리 안에서는 만든 순서대로
    local cur, n = js.current(), #js.players()
    local function seat(c)
      local o = c.owner
      if not o then return n end -- 주인 없는 컴포넌트는 플레이어들 다음
      local ci = player(cur).index
      return (o.index - ci) % n
    end
    local function num(c) return tonumber(c.id:sub(2)) or 0 end
    table.sort(comps, function(a, b)
      local sa, sb = seat(a), seat(b)
      if sa ~= sb then return sa < sb end
      return num(a) < num(b)
    end)
    for _, c in ipairs(comps) do
      out[#out + 1] = { fn = reg.types[c.type].on[name], self = c, label = c.label }
    end
  end
  return out
end

local function runListener(e)
  if e.self then e.fn(e.self, game, e.event) else e.fn(game, e.event) end
end

local function drain()
  events.processing = true
  local ok, err = pcall(function()
    while #events.queue > 0 do
      local e = table.remove(events.queue, 1)
      events.count = events.count + 1
      events.trace[#events.trace + 1] = e.label .. "(" .. e.event.name .. ")"
      if events.count > TRIGGER_LIMIT then
        local last = {}
        for i = math.max(1, #events.trace - 7), #events.trace do last[#last + 1] = events.trace[i] end
        error("트리거 연쇄가 " .. TRIGGER_LIMIT .. "번을 넘어서 멈췄어요. 마지막 트리거: " .. table.concat(last, " → "), 0)
      end
      runListener(e)
    end
  end)
  events.queue, events.processing, events.count, events.trace = {}, false, 0, {}
  if not ok then error(err, 0) end
end

function game:emit(name, event)
  event = event or {}
  event.name = name
  local ls = listenersFor(name)
  for _, e in ipairs(ls) do
    e.event = event
    if events.lifo then table.insert(events.queue, 1, e) else events.queue[#events.queue + 1] = e end
  end
  if not events.processing and not events.holding and #events.queue > 0 then drain() end
  return event
end

function game:before(name, event)
  event = event or {}
  event.name = name
  for _, e in ipairs(listenersFor(name)) do
    if event.cancel then break end
    e.event = event
    runListener(e)
  end
  return event
end

-- 안에서 일어난 트리거를 모았다가 나중 것부터 처리한다 (TCG의 체인)
function game:chain(f)
  local prevLifo, prevHold = events.lifo, events.holding
  events.lifo, events.holding = true, true
  local ok, err = pcall(f, game)
  events.lifo, events.holding = prevLifo, prevHold
  if not ok then error(err, 0) end
  if not events.processing and not events.holding and #events.queue > 0 then drain() end
end

------------------------------------------------------------------------
-- 반응 창구: 여러 플레이어가 서로 모르게 고르고, 우선순위로 받아들일 것을 정한다
-- opts.priority = { "론", "퐁", "치" }, opts.accept = 1, opts.pass = "패스" (false면 패스 없음)
------------------------------------------------------------------------

-- 우선순위 비교에 쓰는 이름: 테이블이면 kind(예: "치"), 없으면 label
local function choiceLabel(c)
  if type(c) == "table" and getmetatable(c) == nil then
    if c.kind then return c.kind end
    if c.label then return c.label end
  end
  return describe(c)
end

function game:respond(players, optionsFn, prompt, opts)
  opts = opts or {}
  local passLabel = opts.pass
  if passLabel == nil then passLabel = "패스" end
  local picks = {}
  for i, p in ipairs(players) do
    local options = optionsFn(p) or {}
    if #options > 0 then
      local list2 = {}
      for j, v in ipairs(options) do list2[j] = v end
      if passLabel then list2[#list2 + 1] = passLabel end
      local c = game:choose(p, list2, prompt)
      if not (passLabel and c == passLabel) then picks[#picks + 1] = { player = p, choice = c, order = i } end
    end
  end
  if opts.priority then
    local rank = {}
    for i, v in ipairs(opts.priority) do rank[v] = i end
    table.sort(picks, function(a, b)
      local ra, rb = rank[choiceLabel(a.choice)] or math.huge, rank[choiceLabel(b.choice)] or math.huge
      if ra ~= rb then return ra < rb end
      return a.order < b.order
    end)
  end
  if opts.accept then
    while #picks > opts.accept do table.remove(picks) end
  end
  return picks
end

local function componentTable(t)
  local def = getRegistry().types[t]
  if type(def) == "table" then return def end
  return {}
end

local function zoneScripts()
  local path = js.zoneScript()
  if not path then return {} end
  return loadModule(path)
end

-- 컴포넌트 종류 스크립트의 함수 (예: 카드 효과)를 가져온다
function game:script(c)
  return componentTable(type(c) == "table" and c.type or c)
end

function game:canEnter(p, z)
  if not js.zoneAccepts(z.id, "piece") then return false end
  local zs = zoneScripts()
  for _, tag in ipairs(z.tags) do
    local s = zs[tag]
    if s and s.canAccept and not judge(s.canAccept, z, p, game) then return false end
  end
  return true
end

function game:moveCandidates(p)
  local s = componentTable(p.type)
  if not s.moveCandidates then return {} end
  local cands = judge(s.moveCandidates, p, game) or {}
  local out = {}
  for _, z in ipairs(cands) do
    if game:canEnter(p, z) then out[#out + 1] = z end
  end
  return out
end

setmetatable(game, { __newindex = readonly("game") })

------------------------------------------------------------------------
-- Entry points called by the JS engine
------------------------------------------------------------------------

function __load(path) loadModule(path) return true end

function __run(kind, path, arg)
  resetEvents()
  local m = loadModule(path)
  local p = game:currentPlayer()
  if kind == "decide" then
    -- 스크립트 플레이어: arg = { player, kind, prompt, choices = { {label, value, action}, ... } }
    if not m.decide then error(path .. ": 스크립트 플레이어에는 decide 함수가 필요해요", 0) end
    local req = arg
    local choices = {}
    for i, c in ipairs(req.choices) do
      choices[i] = { label = c.label, value = __decode(c.value), action = c.action, index = i }
    end
    local who = player(req.player)
    local pick = judge(m.decide, game, who, { kind = req.kind, prompt = req.prompt, choices = choices })
    if type(pick) == "number" then return pick end
    if type(pick) == "table" and pick.index then return pick.index end
    error(path .. ": decide는 choices 중 하나(또는 번호)를 돌려줘야 해요", 0)
  end
  if kind == "onEnter" then
    if m.onEnter then m.onEnter(game, p) end
    return true
  elseif kind == "execute" then
    if not m.execute then error(path .. ": Action 스크립트에는 execute 함수가 필요해요", 0) end
    m.execute(game, p, __decode(arg))
    return true
  elseif kind == "next" then
    if not m.next then return nil end
    local r = judge(m.next, game, p)
    if type(r) ~= "string" then error(path .. ": next는 다음 노드 이름(문자열)을 돌려줘야 해요", 0) end
    return r
  elseif kind == "options" then
    if not m.options then return { { value = true, label = "" } } end
    local opts = judge(m.options, game, p)
    if type(opts) ~= "table" then error(path .. ": options는 목록(테이블)을 돌려줘야 해요", 0) end
    local out = {}
    for i, v in ipairs(opts) do out[i] = { value = __encode(v), label = describe(v) } end
    return out
  end
  error("알 수 없는 실행 종류: " .. tostring(kind), 0)
end
