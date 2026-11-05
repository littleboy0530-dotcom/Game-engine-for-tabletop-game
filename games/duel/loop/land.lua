-- Action: 땅 내기 (턴에 한 번: loop.yaml의 limit)
local duel = use("lib/duel.lua")

return {
  options = function(game, player)
    local out = {}
    for _, c in ipairs(player:zone("hand"):cards()) do
      if c:hasTag("땅") then out[#out + 1] = c end
    end
    return out
  end,
  execute = function(game, player, card)
    game:move(card, player:zone("field"))
    duel.updateMana(game)
  end,
}
