local M = {}

-- 앞줄 카드가 덮고 있지 않으면 가져갈 수 있다
function M.free(game, card)
  local z = card.zone
  if z.y == 0 then return true end
  local board = game:board()
  for _, dx in ipairs({ -1, 1 }) do
    local front = board:zoneAt(z.x + dx, z.y - 1)
    if front and not front:isEmpty() then return false end
  end
  return true
end

function M.cards(game)
  local out = {}
  for _, z in ipairs(game:board():zonesWithTag("칸")) do
    local c = z:top()
    if c then out[#out + 1] = c end
  end
  return out
end

function M.available(game)
  local out = {}
  for _, c in ipairs(M.cards(game)) do
    if c.face == "up" and M.free(game, c) then out[#out + 1] = c end
  end
  return out
end

function M.symbols(player)
  local seen, n = {}, 0
  for _, c in ipairs(player:zone("tableau"):cards()) do
    local s = c.props.symbol
    if s and not seen[s] then seen[s] = true n = n + 1 end
  end
  return n
end

return M
