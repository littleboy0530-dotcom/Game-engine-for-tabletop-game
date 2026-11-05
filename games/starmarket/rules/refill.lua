-- 규칙 리스너: 중앙 줄에서 카드가 빠져나가면 중앙 덱에서 채운다
local market = use("lib/market.lua")

return {
  on = {
    moved = function(game, e)
      if e.from and e.from.id == "center" then market.refill(game) end
    end,
  },
}
