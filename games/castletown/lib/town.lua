-- 성곽 마을 공용 규칙
local M = {}

M.ROTATIONS = { "그대로", "오른쪽으로 90°", "180°", "왼쪽으로 90°" }

-- 타일이 아직 없는 칸 (이미 놓인 타일 옆에 생겨 있는 칸들)
function M.frontier(game)
  local out = {}
  for _, z in ipairs(game:board():zones()) do
    if z.x and not game:tileIn(z) then out[#out + 1] = z end
  end
  return out
end

-- 이 타일을 놓을 수 있는 칸과 회전
function M.placements(game, tile)
  local out = {}
  for _, z in ipairs(M.frontier(game)) do
    local rots = {}
    for r = 0, 3 do
      if game:fits(tile, z, r) then rots[#rots + 1] = r end
    end
    if #rots > 0 then out[#out + 1] = { zone = z, rots = rots } end
  end
  return out
end

function M.addFrontier(game, z)
  local board = game:board()
  for _, d in ipairs({ { 0, 1 }, { 1, 0 }, { 0, -1 }, { -1, 0 } }) do
    board:addZone(z.x + d[1], z.y + d[2])
  end
end

function M.supply(player) return player:zone("supply") end

function M.updateWorkers(game)
  for _, p in ipairs(game:players()) do p.vars.workers = M.supply(p):count() end
end

-- 영역 위 일꾼이 가장 많은 사람들
function M.majority(game, meeples)
  local count, best = {}, 0
  for _, m in ipairs(meeples) do
    count[m.owner.id] = (count[m.owner.id] or 0) + 1
    best = math.max(best, count[m.owner.id])
  end
  local out = {}
  for _, p in ipairs(game:players()) do
    if count[p.id] and count[p.id] == best then out[#out + 1] = p end
  end
  return out
end

function M.returnWorkers(game, meeples)
  for _, m in ipairs(meeples) do game:move(m, M.supply(m.owner)) end
end

local function key(region)
  local k = nil
  for _, part in ipairs(region.parts) do
    local s = part.zone.id .. "/" .. part.segment
    if not k or s < k then k = s end
  end
  return k
end
M.regionKey = key

-- 영역 점수: 완성된 도시 타일당 2, 미완성 도시 1, 길 타일당 1
function M.points(region, kind)
  if kind == "도시" then return region.tiles * (region.complete and 2 or 1) end
  return region.tiles
end

-- 수도원 주변 3x3에 놓인 타일 수
function M.around(game, z)
  local board, n = game:board(), 0
  for dx = -1, 1 do
    for dy = -1, 1 do
      local nz = board:zoneAt(z.x + dx, z.y + dy)
      if nz and game:tileIn(nz) then n = n + 1 end
    end
  end
  return n
end

function M.award(game, winners, points, what)
  for _, p in ipairs(winners) do
    p.vars.score = p.vars.score + points
    game:log(p.name .. ": " .. what .. " +" .. points)
  end
end

return M
