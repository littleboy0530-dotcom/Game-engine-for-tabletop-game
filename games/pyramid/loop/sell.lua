-- Action: 드러난 카드를 팔아서 코인 2개를 얻는다
local pyramid = use("lib/pyramid.lua")

return {
  options = function(game) return pyramid.available(game) end,
  execute = function(game, player, card)
    game:move(card, game:zone("sold"))
    player.vars.coins = player.vars.coins + 2
    game:log(player.name .. ": " .. card.label .. " 팔아서 코인 +2")
  end,
}
