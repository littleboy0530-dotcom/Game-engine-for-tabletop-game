-- Phase: 낸 카드와 손패를 버리고 5장을 새로 뽑는다
local deck = use("lib/deck.lua")

return {
  onEnter = function(game, player)
    for _, name in ipairs({ "play", "hand" }) do
      for _, c in ipairs(player:zone(name):cards()) do game:move(c, player:zone("discard")) end
    end
    deck.draw(game, player, 5)
    player.vars.actions = 0
    player.vars.buys = 0
    player.vars.coins = 0
    player.vars.points = deck.points(player)
  end,
}
