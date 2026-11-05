-- Action: 체크 (낼 돈이 없을 때)
local poker = use("lib/poker.lua")

return {
  options = function(game, player)
    if poker.toCall(game, player) == 0 then return { { label = "체크" } } end
    return {}
  end,
  execute = function(game, player)
    player.vars.acted = true
    game:log(player.name .. ": 체크")
  end,
}
