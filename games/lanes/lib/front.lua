local M = {}

M.LANES = { "left", "mid", "right" }
M.TARGET = 7

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

return M
