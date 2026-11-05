-- 포커 공용 규칙: 자리 순서, 칩 내기, 족보 계산
local M = {}

M.SMALL_BLIND = 5
M.BIG_BLIND = 10
M.START_CHIPS = 200

-- 이번 판에 앉아 있는 사람 (칩이 없어서 탈락하지 않은 사람)
function M.seated(p) return not p.vars.out end
-- 아직 폴드하지 않은 사람
function M.live(p) return not p.vars.out and not p.vars.folded end
-- 베팅할 수 있는 사람 (폴드도 올인도 아님)
function M.canAct(p) return M.live(p) and (p.vars.chips or 0) > 0 end

function M.count(game, pred)
  local n = 0
  for _, p in ipairs(game:players()) do if pred(p) then n = n + 1 end end
  return n
end

function M.filter(game, pred)
  local out = {}
  for _, p in ipairs(game:players()) do if pred(p) then out[#out + 1] = p end end
  return out
end

-- p 다음 자리부터 한 바퀴 돌며 pred를 만족하는 첫 사람 (p 자신은 마지막에 확인)
function M.nextSeat(game, p, pred)
  local q = p
  for _ = 1, #game:players() do
    q = game:playerAfter(q)
    if pred(q) then return q end
  end
  return nil
end

function M.toCall(game, p)
  return math.max(0, (game.vars.currentBet or 0) - (p.vars.bet or 0))
end

function M.updateStatus(p)
  if p.vars.out then p.vars.status = "탈락"
  elseif p.vars.folded then p.vars.status = "폴드"
  elseif (p.vars.chips or 0) == 0 then p.vars.status = "올인"
  else p.vars.status = "" end
end

-- 칩을 팟에 넣는다. 가진 것보다 많으면 가진 만큼(올인)
function M.put(game, p, amount)
  local paid = math.min(amount, p.vars.chips)
  p.vars.chips = p.vars.chips - paid
  p.vars.bet = (p.vars.bet or 0) + paid
  p.vars.total = (p.vars.total or 0) + paid
  game.vars.pot = (game.vars.pot or 0) + paid
  M.updateStatus(p)
  return paid
end

------------------------------------------------------------------------
-- 족보: 7장 중 가장 좋은 5장
-- 결과는 { 등급, 비교용 숫자... } 이고 앞에서부터 비교한다
------------------------------------------------------------------------

M.NAMES = {
  [0] = "하이 카드", "원 페어", "투 페어", "트리플", "스트레이트",
  "플러시", "풀 하우스", "포카드", "스트레이트 플러시",
}

local function straightHigh(has)
  for high = 14, 5, -1 do
    local ok = true
    for r = high, high - 4, -1 do
      if not has[r == 1 and 14 or r] then ok = false break end
    end
    if ok then return high end
  end
  return nil
end

local function descending(a, b) return a > b end

function M.evaluate(cards)
  local counts, has, bySuit = {}, {}, {}
  for _, c in ipairs(cards) do
    local r, s = c.props.rank, c.props.suit
    counts[r] = (counts[r] or 0) + 1
    has[r] = true
    bySuit[s] = bySuit[s] or {}
    table.insert(bySuit[s], r)
  end

  local flush = nil
  for _, ranks in pairs(bySuit) do
    if #ranks >= 5 then
      local set = {}
      for _, r in ipairs(ranks) do set[r] = true end
      local sf = straightHigh(set)
      if sf then return { 8, sf } end
      table.sort(ranks, descending)
      flush = { 5, ranks[1], ranks[2], ranks[3], ranks[4], ranks[5] }
    end
  end

  local groups, distinct = {}, {}
  for r, n in pairs(counts) do
    groups[#groups + 1] = { r = r, n = n }
    distinct[#distinct + 1] = r
  end
  table.sort(groups, function(a, b)
    if a.n ~= b.n then return a.n > b.n end
    return a.r > b.r
  end)
  table.sort(distinct, descending)

  local function kickers(result, skip, k)
    for _, r in ipairs(distinct) do
      if #result >= k then break end
      local skipped = false
      for _, s in ipairs(skip) do if s == r then skipped = true end end
      if not skipped then result[#result + 1] = r end
    end
    return result
  end

  local g1, g2 = groups[1], groups[2]
  if g1.n == 4 then return kickers({ 7, g1.r }, { g1.r }, 3) end
  if g1.n == 3 and g2 and g2.n >= 2 then return { 6, g1.r, g2.r } end
  if flush then return flush end
  local st = straightHigh(has)
  if st then return { 4, st } end
  if g1.n == 3 then return kickers({ 3, g1.r }, { g1.r }, 4) end
  if g1.n == 2 and g2 and g2.n == 2 then return kickers({ 2, g1.r, g2.r }, { g1.r, g2.r }, 4) end
  if g1.n == 2 then return kickers({ 1, g1.r }, { g1.r }, 5) end
  return kickers({ 0 }, {}, 6)
end

-- a가 좋으면 1, b가 좋으면 -1, 같으면 0
function M.compare(a, b)
  for i = 1, math.max(#a, #b) do
    local x, y = a[i] or 0, b[i] or 0
    if x > y then return 1 end
    if x < y then return -1 end
  end
  return 0
end

function M.name(score) return M.NAMES[score[1]] end

return M
