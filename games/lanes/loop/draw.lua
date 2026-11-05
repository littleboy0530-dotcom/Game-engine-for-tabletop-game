local front = use("lib/front.lua")

return {
  onEnter = function(game)
    game.vars.round = game.vars.round + 1
    for _, p in ipairs(game:players()) do
      front.draw(game, p, 5 - p:zone("hand"):count())
    end
  end,
}
