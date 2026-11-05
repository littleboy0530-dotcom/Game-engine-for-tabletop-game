-- 한 바퀴 부동산 공용 규칙
local M = {}

M.START_MONEY = 150
M.PASS_BONUS = 20
M.MAX_ROUNDS = 15

function M.pawn(game, player) return game:pieces("pawn", player)[1] end

function M.alive(p) return not p.vars.out end

-- 땅의 주인 (깃발 컴포넌트로 표시한다)
function M.owner(zone)
  for _, c in ipairs(zone:components()) do
    if c.type == "flag" then return c.owner, c end
  end
  return nil
end

function M.properties(game, player)
  local out = {}
  for _, flag in ipairs(game:pieces("flag", player)) do out[#out + 1] = flag.zone end
  return out
end

function M.rent(game, zone)
  local owner = M.owner(zone)
  local base = zone.props.rent
  local group = zone.props.group
  local mine, total = 0, 0
  for _, z in ipairs(game:board():zonesWithTag("땅")) do
    if z.props.group == group then
      total = total + 1
      if M.owner(z) == owner then mine = mine + 1 end
    end
  end
  if group == "정류장" then return base * mine end
  if mine == total then return base * 2 end -- 같은 색을 모두 가지면 두 배
  return base
end

function M.assets(game, p)
  local total = p.vars.money
  for _, z in ipairs(M.properties(game, p)) do total = total + z.props.price end
  return total
end

function M.refresh(game)
  for _, p in ipairs(game:players()) do
    p.vars.assets = M.assets(game, p)
    if p.vars.out then p.vars.status = "파산" else p.vars.status = "" end
  end
end

-- 돈이 모자라면 비싼 땅부터 반값에 판다. 그래도 모자라면 파산
function M.settle(game, p)
  if p.vars.money >= 0 then return end
  local props = M.properties(game, p)
  table.sort(props, function(a, b) return a.props.price > b.props.price end)
  for _, z in ipairs(props) do
    if p.vars.money >= 0 then break end
    M.sell(game, p, z)
  end
  if p.vars.money < 0 then
    p.vars.out = true
    p.vars.money = 0
    game:log(p.name .. " 파산!")
  end
end

function M.sell(game, p, zone)
  local _, flag = M.owner(zone)
  game:remove(flag)
  local gain = zone.props.price // 2
  p.vars.money = p.vars.money + gain
  game:log(p.name .. ": " .. zone.name .. " 매각 (+" .. gain .. ")")
end

function M.pay(game, from, to, amount)
  from.vars.money = from.vars.money - amount
  if to then to.vars.money = to.vars.money + amount end
end

-- 칸 단위로 이동. 출발을 지나거나 도착하면 보너스
function M.step(game, player, steps)
  local pawn = M.pawn(game, player)
  local board = game:board()
  local n = board.width
  for _ = 1, steps do
    local x = (pawn.zone.x + 1) % n
    game:move(pawn, board:zoneAt(x, 0))
    if x == 0 then
      player.vars.money = player.vars.money + M.PASS_BONUS
      game:log(player.name .. ": 출발 통과 +" .. M.PASS_BONUS)
    end
  end
end

-- 행운 카드
local function drawEvent(game, player)
  local deck, used = game:zone("events"), game:zone("used")
  if deck:isEmpty() then
    for _, c in ipairs(used:cards()) do game:move(c, deck) end
    game:shuffle(deck)
  end
  local card = deck:top()
  game:move(card, used)
  game:log(player.name .. ": 행운 카드 - " .. card.label .. " (" .. card.text .. ")")
  local e, amount = card.props.effect, card.props.amount
  if e == "money" then
    player.vars.money = player.vars.money + amount
  elseif e == "goto" then
    local pawn = M.pawn(game, player)
    local steps = (amount - pawn.zone.x) % game:board().width
    M.step(game, player, steps)
    return true
  elseif e == "move" then
    M.step(game, player, amount)
    return true
  elseif e == "collect" then
    for _, other in ipairs(game:players()) do
      if other ~= player and M.alive(other) then
        M.pay(game, other, player, amount)
        M.settle(game, other)
      end
    end
  elseif e == "repair" then
    player.vars.money = player.vars.money - amount * #M.properties(game, player)
  end
  return false
end

-- 도착한 칸의 효과. 행운 카드로 움직이면 새 칸도 처리한다
function M.resolve(game, player, depth)
  depth = depth or 0
  local zone = M.pawn(game, player).zone
  if zone:hasTag("세금") then
    player.vars.money = player.vars.money - zone.props.tax
    game:log(player.name .. ": 세금 " .. zone.props.tax)
  elseif zone:hasTag("공사장") then
    local board = game:board()
    local x = (zone.x - 3) % board.width
    game:move(M.pawn(game, player), board:zoneAt(x, 0))
    game:log(player.name .. ": 공사장! 3칸 뒤로")
    if depth < 3 then M.resolve(game, player, depth + 1) end
  elseif zone:hasTag("행운") then
    if drawEvent(game, player) and depth < 3 then M.resolve(game, player, depth + 1) end
  elseif zone:hasTag("땅") then
    local owner = M.owner(zone)
    if owner and owner ~= player and M.alive(owner) then
      local rent = M.rent(game, zone)
      M.pay(game, player, owner, rent)
      game:log(player.name .. " → " .. owner.name .. ": 통행료 " .. rent)
    end
  end
  M.settle(game, player)
end

return M
