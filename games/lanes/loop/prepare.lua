return {
  onEnter = function(game)
    for _, p in ipairs(game:players()) do
      game:shuffle(p:zone("deck"))
      p.vars.influence = 0
    end
    game.vars.round = 0
  end,
}
