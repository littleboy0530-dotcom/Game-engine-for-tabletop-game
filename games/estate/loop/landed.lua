-- Phase: 도착한 칸 처리 (세금, 행운 카드, 통행료...)
local estate = use("lib/estate.lua")

return {
  onEnter = function(game, player)
    estate.resolve(game, player)
    estate.refresh(game)
  end,
}
