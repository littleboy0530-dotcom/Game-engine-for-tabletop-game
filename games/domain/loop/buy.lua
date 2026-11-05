-- Action: 공급처에서 카드를 산다
local deck = use("lib/deck.lua")

return {
  options = function(game, player)
    if player.vars.buys < 1 then return {} end
    local out = {}
    for _, z in ipairs(deck.supplies(game)) do
      local top = z:top()
      if top and top.props.cost <= player.vars.coins then out[#out + 1] = top end
    end
    return out
  end,
  execute = function(game, player, card)
    player.vars.buys = player.vars.buys - 1
    player.vars.coins = player.vars.coins - card.props.cost
    game:move(card, player:zone("discard"))
    game:log(player.name .. ": " .. card.label .. " 구매")
  end,
}
