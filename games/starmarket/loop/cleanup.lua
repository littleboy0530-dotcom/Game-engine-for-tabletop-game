local market = use("lib/market.lua")

return {
  onEnter = function(game, player)
    for _, name in ipairs({ "play", "hand" }) do
      for _, c in ipairs(player:zone(name):cards()) do game:move(c, player:zone("discard")) end
    end
    market.draw(game, player, 5)
    player.vars.runes = 0
    player.vars.might = 0
    for _, p in ipairs(game:players()) do p.vars.score = market.score(p) end
  end,
}
