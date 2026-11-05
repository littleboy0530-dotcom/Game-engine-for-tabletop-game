-- Action: 쯔모 (뽑은 패로 손패가 완성되면)
local tiles = use("lib/tiles.lua")

return {
  options = function(game, player)
    if game.vars.drew and tiles.complete(player:zone("hand"):cards()) then return { { label = "쯔모" } } end
    return {}
  end,
  execute = function(game, player)
    game:win(player, "쯔모")
  end,
}
