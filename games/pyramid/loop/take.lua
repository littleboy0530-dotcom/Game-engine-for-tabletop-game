-- Action: 드러난 카드를 값을 내고 가져간다
local pyramid = use("lib/pyramid.lua")

return {
  options = function(game, player)
    local out = {}
    for _, c in ipairs(pyramid.available(game)) do
      if c.props.cost <= player.vars.coins then out[#out + 1] = c end
    end
    return out
  end,
  execute = function(game, player, card)
    player.vars.coins = player.vars.coins - card.props.cost + (card.props.coins or 0)
    player.vars.points = player.vars.points + (card.props.points or 0)
    game:move(card, player:zone("tableau"))
    player.vars.symbols = pyramid.symbols(player)
    game:log(player.name .. ": " .. card.label .. " 가져감")
  end,
}
