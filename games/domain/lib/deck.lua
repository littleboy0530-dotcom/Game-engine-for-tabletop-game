-- 덱 다루기: 뽑기(덱이 비면 버린 카드를 섞어서 새 덱), 점수 계산
local M = {}

function M.draw(game, player, n)
  local deck, hand, discard = player:zone("deck"), player:zone("hand"), player:zone("discard")
  for _ = 1, n do
    if deck:isEmpty() then
      if discard:isEmpty() then return end
      for _, c in ipairs(discard:cards()) do game:move(c, deck) end
      game:shuffle(deck)
    end
    game:move(deck:top(), hand)
  end
end

function M.points(player)
  local total = 0
  for _, name in ipairs({ "deck", "hand", "play", "discard" }) do
    for _, c in ipairs(player:zone(name):cards()) do total = total + (c.props.points or 0) end
  end
  return total
end

-- 공급처 더미들 (비어 있어도 포함)
function M.supplies(game)
  local out = {}
  for _, z in ipairs(game:board():zones()) do
    if z.id:sub(1, 7) == "supply_" then out[#out + 1] = z end
  end
  return out
end

return M
