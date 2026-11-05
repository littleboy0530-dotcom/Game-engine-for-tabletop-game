-- 공통 Action: 내 땅을 반값에 판다 (턴 중 언제든)
local estate = use("lib/estate.lua")

return {
  options = function(game, player)
    if player.vars.out then return {} end
    return estate.properties(game, player)
  end,
  execute = function(game, player, zone)
    estate.sell(game, player, zone)
    estate.refresh(game)
  end,
}
