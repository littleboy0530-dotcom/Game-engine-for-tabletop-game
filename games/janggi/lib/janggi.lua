-- 장기 공용 규칙
-- "선을 따라 움직인다" = 보드 그래프의 간선을 따라간다.
-- 궁성의 대각선은 board.yaml에 간선으로 들어 있어서, 차/포/졸/궁/사가 같은 규칙으로 처리된다.
local M = {}

M.DIRS = { {1, 0}, {-1, 0}, {0, 1}, {0, -1}, {1, 1}, {1, -1}, {-1, 1}, {-1, -1} }

function M.forward(player)
  if player.id == "cho" then return 1 end
  return -1
end

function M.palaceTag(player)
  if player.id == "cho" then return "초궁성" end
  return "한궁성"
end

function M.activePieces(player)
  local out = {}
  for _, p in ipairs(player:pieces()) do
    if p.zone.x then out[#out + 1] = p end
  end
  return out
end

-- (dx, dy) 방향으로 선이 이어져 있으면 그 다음 교차점
function M.step(game, zone, dx, dy)
  local board = game:board()
  local n = board:zoneAt(zone.x + dx, zone.y + dy)
  if n and board:connected(zone, n) then return n end
  return nil
end

local function enemyOrEmpty(piece, zone)
  local other = zone:piece()
  return other == nil or other.owner ~= piece.owner
end

-- 차: 선을 따라 막힐 때까지
function M.chariot(piece, game)
  local out = {}
  for _, d in ipairs(M.DIRS) do
    local z = M.step(game, piece.zone, d[1], d[2])
    while z do
      local other = z:piece()
      if other then
        if other.owner ~= piece.owner then out[#out + 1] = z end
        break
      end
      out[#out + 1] = z
      z = M.step(game, z, d[1], d[2])
    end
  end
  return out
end

-- 포: 포가 아닌 말 하나를 넘어서 이동. 포는 넘을 수도 잡을 수도 없다
function M.cannon(piece, game)
  local out = {}
  for _, d in ipairs(M.DIRS) do
    local z = M.step(game, piece.zone, d[1], d[2])
    while z and z:isEmpty() do z = M.step(game, z, d[1], d[2]) end
    if z and z:piece().type ~= "cannon" then
      z = M.step(game, z, d[1], d[2])
      while z do
        local other = z:piece()
        if other then
          if other.owner ~= piece.owner and other.type ~= "cannon" then out[#out + 1] = z end
          break
        end
        out[#out + 1] = z
        z = M.step(game, z, d[1], d[2])
      end
    end
  end
  return out
end

-- 궁, 사: 자기 궁성 안에서 선을 따라 한 칸
function M.palaceStep(piece, game)
  local out = {}
  local tag = M.palaceTag(piece.owner)
  for _, z in ipairs(game:board():neighbors(piece.zone)) do
    if z:hasTag(tag) and enemyOrEmpty(piece, z) then out[#out + 1] = z end
  end
  return out
end

-- 마: 직선 한 칸 + 대각선 한 칸. 직선 칸이 막히면 못 감
-- 상: 직선 한 칸 + 대각선 두 칸. 가는 길의 두 칸이 모두 비어 있어야 함
function M.leaper(piece, game, diagonalSteps)
  local board = game:board()
  local from = piece.zone
  local out = {}
  for _, d in ipairs({ {1, 0}, {-1, 0}, {0, 1}, {0, -1} }) do
    local first = board:zoneAt(from.x + d[1], from.y + d[2])
    if first and first:isEmpty() then
      for _, side in ipairs({ -1, 1 }) do
        local ex, ey = d[1], d[2]
        if ex == 0 then ex = side else ey = side end
        local z, blocked = first, false
        for i = 1, diagonalSteps do
          z = board:zoneAt(first.x + ex * i, first.y + ey * i)
          if not z then blocked = true break end
          if i < diagonalSteps and not z:isEmpty() then blocked = true break end
        end
        if not blocked and enemyOrEmpty(piece, z) then out[#out + 1] = z end
      end
    end
  end
  return out
end

-- 졸/병: 앞이나 옆으로 한 칸. 궁성 안에서는 앞쪽 대각선 선을 따라 갈 수 있음
function M.soldier(piece, game)
  local f = M.forward(piece.owner)
  local out = {}
  for _, d in ipairs({ {0, f}, {1, 0}, {-1, 0}, {1, f}, {-1, f} }) do
    local z = M.step(game, piece.zone, d[1], d[2])
    if z and enemyOrEmpty(piece, z) then out[#out + 1] = z end
  end
  return out
end

-- zone이 by 플레이어에게 공격받고 있는가 (zone에서 거꾸로 찾아봄)
local function sign(n)
  if n > 0 then return 1 elseif n < 0 then return -1 end
  return 0
end

local HORSE = { {1, 2}, {-1, 2}, {1, -2}, {-1, -2}, {2, 1}, {2, -1}, {-2, 1}, {-2, -1} }
local ELEPHANT = { {2, 3}, {-2, 3}, {2, -3}, {-2, -3}, {3, 2}, {3, -2}, {-3, 2}, {-3, -2} }

local function isEmptyAt(board, x, y)
  local z = board:zoneAt(x, y)
  return z ~= nil and z:isEmpty()
end

function M.attackedBy(game, zone, by)
  local board = game:board()

  -- 선을 따라: 처음 만나는 말이 차면 공격, 포가 아닌 말 하나를 넘어서 만나는 말이 포면 공격
  for _, d in ipairs(M.DIRS) do
    local z = M.step(game, zone, d[1], d[2])
    local screened = false
    while z do
      local p = z:piece()
      if p then
        if not screened then
          if p.owner == by and p.type == "chariot" then return true end
          if p.type == "cannon" then break end
          screened = true
        else
          if p.owner == by and p.type == "cannon" then return true end
          break
        end
      end
      z = M.step(game, z, d[1], d[2])
    end
  end

  -- 바로 옆 (선으로 이어진 칸): 궁, 사, 졸
  local f = M.forward(by)
  for _, n in ipairs(board:neighbors(zone)) do
    local p = n:piece()
    if p and p.owner == by then
      if (p.type == "general" or p.type == "guard") and zone:hasTag(M.palaceTag(by)) then return true end
      if p.type == "soldier" then
        local dy = zone.y - n.y
        if dy == f or dy == 0 then return true end
      end
    end
  end

  -- 마: 출발 칸에서 직선 한 칸이 비어 있어야 함
  for _, o in ipairs(HORSE) do
    local hx, hy = zone.x - o[1], zone.y - o[2]
    local h = board:zoneAt(hx, hy)
    local p = h and h:piece()
    if p and p.owner == by and p.type == "horse" then
      local sx, sy = 0, 0
      if math.abs(o[2]) == 2 then sy = sign(o[2]) else sx = sign(o[1]) end
      if isEmptyAt(board, hx + sx, hy + sy) then return true end
    end
  end

  -- 상: 직선 한 칸과 대각선 첫 칸이 비어 있어야 함
  for _, o in ipairs(ELEPHANT) do
    local ex, ey = zone.x - o[1], zone.y - o[2]
    local e = board:zoneAt(ex, ey)
    local p = e and e:piece()
    if p and p.owner == by and p.type == "elephant" then
      local sx, sy = 0, 0
      if math.abs(o[2]) == 3 then sy = sign(o[2]) else sx = sign(o[1]) end
      if isEmptyAt(board, ex + sx, ey + sy)
          and isEmptyAt(board, ex + sx + sign(o[1]), ey + sy + sign(o[2])) then
        return true
      end
    end
  end
  return false
end

function M.inCheck(game, player)
  local general = game:pieces("general", player)[1]
  if not general or not general.zone.x then return true end
  return M.attackedBy(game, general.zone, game:playerAfter(player))
end

function M.applyMove(game, piece, to)
  local target = to:piece()
  if target then game:move(target, game:zone("captured_" .. piece.owner.id)) end
  game:move(piece, to)
end

function M.legalMoves(game, piece)
  local me = piece.owner
  local out = {}
  for _, to in ipairs(game:moveCandidates(piece)) do
    local safe = game:simulate(function(g)
      M.applyMove(g, piece, to)
      return not M.inCheck(g, me)
    end)
    if safe then out[#out + 1] = to end
  end
  return out
end

function M.hasLegalMove(game, player)
  for _, p in ipairs(M.activePieces(player)) do
    if #M.legalMoves(game, p) > 0 then return true end
  end
  return false
end

return M
