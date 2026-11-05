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
  end
  return nil
end
PieceMT.__newindex = readonly("말")
PieceMT.__tostring = function(p) return "Piece(" .. rawget(p, "id") .. ")" end

function Piece:hasTag(tag)
  for _, t in ipairs(self.tags) do if t == tag then return true end end
  return false
end

-- Zone ----------------------------------------------------------------
ZoneMT.__index = function(z, k)
  local m = Zone[k]
  if m then return m end
  if k == "board" then return board(rawget(z, "_board")) end
  return nil
end
ZoneMT.__newindex = readonly("존")
ZoneMT.__tostring = function(z) return "Zone(" .. rawget(z, "id") .. ")" end

function Zone:hasTag(tag)
  for _, t in ipairs(self.tags) do if t == tag then return true end end
  return false
end
function Zone:pieces() return list(js.zoneContents(self.id), piece) end
function Zone:piece()
  local ids = js.zoneContents(self.id)
  return piece(ids[#ids])
end
function Zone:isEmpty() return #js.zoneContents(self.id) == 0 end
function Zone:count() return #js.zoneContents(self.id) end

-- Board ---------------------------------------------------------------
BoardMT.__index = Board
BoardMT.__newindex = readonly("보드")

function Board:zoneAt(x, y) return zone(js.zoneAt(self.id, x, y)) end
function Board:zones() return list(js.boardZones(self.id), zone) end
function Board:neighbors(z) return list(js.neighbors(z.id), zone) end
function Board:connected(a, b) return js.connected(a.id, b.id) end
function Board:zonesWithTag(tag) return list(js.zonesWithTag(self.id, tag), zone) end

-- Player --------------------------------------------------------------
PlayerMT.__index = Player
PlayerMT.__newindex = readonly("플레이어")
PlayerMT.__tostring = function(p) return "Player(" .. rawget(p, "id") .. ")" end

function Player:pieces(ptype) return list(js.pieces(ptype, self.id), piece) end

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
    if mt == PieceMT then return v.label .. " (" .. (v.zone and v.zone.name or "-") .. ")" end
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
  return m
end
base.use = loadModule

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
function game:zone(id) return zone(id) end
function game:piece(id) return piece(id) end
function game:pieces(ptype, owner) return list(js.pieces(ptype, owner and owner.id), piece) end

function game:create(ptype, owner, z)
  return piece(js.create(ptype, owner and owner.id, z.id))
end
function game:move(p, z) js.move(p.id, z.id) end
function game:remove(p) js.remove(p.id) end
function game:roll(sides) return js.roll(sides or 6) end
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

local function scriptTable(kind)
  local path = js.componentScript(kind)
  if not path then return {} end
  return loadModule(path)
end

function game:canEnter(p, z)
  if not js.zoneAccepts(z.id, "piece") then return false end
  local zs = scriptTable("zones")
  for _, tag in ipairs(z.tags) do
    local s = zs[tag]
    if s and s.canAccept and not judge(s.canAccept, z, p, game) then return false end
  end
  return true
end

function game:moveCandidates(p)
  local s = scriptTable("pieces")[p.type]
  if not s or not s.moveCandidates then return {} end
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
  local m = loadModule(path)
  local p = game:currentPlayer()
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
