local town = use("lib/town.lua")

return {
  onEnter = function(game)
    game:shuffle(game:zone("bag"))
    town.addFrontier(game, game:board():zoneAt(0, 0))
    for _, p in ipairs(game:players()) do p.vars.score = 0 end
    town.updateWorkers(game)
    game.vars.tilesLeft = game:zone("bag"):count()
  end,
}
