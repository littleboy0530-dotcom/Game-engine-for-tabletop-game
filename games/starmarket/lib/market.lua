-- 별빛 시장 공용 규칙
local M = {}

M.CENTER_SIZE = 6

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

-- 중앙 줄을 6장까지 채운다
function M.refill(game)
  local center, deck = game:zone("center"), game:zone("centerDeck")
  while center:count() < M.CENTER_SIZE and not deck:isEmpty() do
    game:move(deck:top(), center)
  end
end

function M.gainHonor(game, player, n)
  player.vars.honor = player.vars.honor + n
  game.vars.honorPool = game.vars.honorPool - n
end

function M.score(player)
  local total = player.vars.honor
  for _, name in ipairs({ "deck", "hand", "play", "discard" }) do
    for _, c in ipairs(player:zone(name):cards()) do total = total + (c.props.points or 0) end
  end
  return total
end

return M
