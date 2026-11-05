local market = use("lib/market.lua")

return {
  onEnter = function(game)
    game:shuffle(game:zone("centerDeck"))
    market.refill(game)
    for _, p in ipairs(game:players()) do
      game:shuffle(p:zone("deck"))
      market.draw(game, p, 5)
      p.vars.honor = 0
      p.vars.runes = 0
      p.vars.might = 0
      p.vars.score = 0
    end
    game.vars.honorPool = 25
  end,
}
