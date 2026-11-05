-- Action: 콜
local poker = use("lib/poker.lua")

return {
  options = function(game, player)
    local need = poker.toCall(game, player)
    if need == 0 then return {} end
    if need >= player.vars.chips then return { { label = "올인 콜 " .. player.vars.chips } } end
    return { { label = "콜 " .. need } }
  end,
  execute = function(game, player)
    local paid = poker.put(game, player, poker.toCall(game, player))
    player.vars.acted = true
    game:log(player.name .. ": 콜 " .. paid)
  end,
}
