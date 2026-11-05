-- 마작 패 다루기: 정렬, 완성 판정(몸통 4개 + 머리 1개), 퐁/치 후보
local M = {}

local BASE = { m = 0, p = 9, s = 18, z = 27 }

function M.index(t) return BASE[t.props.suit] + t.props.rank - 1 end

function M.sorted(list)
  local out = {}
  for i, t in ipairs(list) do out[i] = t end
  table.sort(out, function(a, b)
    local ia, ib = M.index(a), M.index(b)
    if ia ~= ib then return ia < ib end
    return a.id < b.id
  end)
  return out
end

-- 손패를 보기 좋게 정렬 (같은 존으로 다시 옮기면 맨 뒤로 간다)
function M.sort(game, player)
  local hand = player:zone("hand")
  for _, t in ipairs(M.sorted(hand:cards())) do game:move(t, hand) end
end

local function counts(list)
  local c = {}
  for i = 0, 33 do c[i] = 0 end
  for _, t in ipairs(list) do
    local i = M.index(t)
    c[i] = c[i] + 1
  end
  return c
end

-- 남은 패가 모두 몸통(같은 패 3개 또는 같은 종류 연속 3개)으로 나뉘는가
local function allSets(c, i)
  while i <= 33 and c[i] == 0 do i = i + 1 end
  if i > 33 then return true end
  if c[i] >= 3 then
    c[i] = c[i] - 3
    local ok = allSets(c, i)
    c[i] = c[i] + 3
    if ok then return true end
  end
  if i < 27 and i % 9 <= 6 and c[i + 1] > 0 and c[i + 2] > 0 then
    c[i], c[i + 1], c[i + 2] = c[i] - 1, c[i + 1] - 1, c[i + 2] - 1
    local ok = allSets(c, i)
    c[i], c[i + 1], c[i + 2] = c[i] + 1, c[i + 1] + 1, c[i + 2] + 1
    if ok then return true end
  end
  return false
end

-- 완성된 손패인가 (공개한 몸통을 뺀 나머지가 머리 1개 + 몸통들)
function M.complete(list)
  if #list % 3 ~= 2 then return false end
  local c = counts(list)
  for i = 0, 33 do
    if c[i] >= 2 then
      c[i] = c[i] - 2
      local ok = allSets(c, 0)
      c[i] = c[i] + 2
      if ok then return true end
    end
  end
  return false
end

function M.same(hand, tile)
  local out = {}
  for _, t in ipairs(hand) do
    if t.type == tile.type then out[#out + 1] = t end
  end
  return out
end

local function find(hand, suit, rank, used)
  for _, t in ipairs(hand) do
    if t.props.suit == suit and t.props.rank == rank and not used[t.id] then return t end
  end
  return nil
end

-- 치로 만들 수 있는 연속 (버린 패 + 손패 2개)
function M.chiOptions(hand, tile)
  local out = {}
  local suit, r = tile.props.suit, tile.props.rank
  if suit == "z" then return out end
  for _, pair in ipairs({ { r - 2, r - 1 }, { r - 1, r + 1 }, { r + 1, r + 2 } }) do
    local a, b = pair[1], pair[2]
    if a >= 1 and b <= 9 then
      local used = {}
      local ta = find(hand, suit, a, used)
      if ta then used[ta.id] = true end
      local tb = ta and find(hand, suit, b, used)
      if ta and tb then
        local ranks = { a, b, r }
        table.sort(ranks)
        out[#out + 1] = { ranks = { a, b }, label = ranks[1] .. "-" .. ranks[2] .. "-" .. ranks[3] }
      end
    end
  end
  return out
end

function M.takeForChi(hand, tile, ranks)
  local used = {}
  local out = {}
  for _, r in ipairs(ranks) do
    local t = find(hand, tile.props.suit, r, used)
    used[t.id] = true
    out[#out + 1] = t
  end
  return out
end

return M
