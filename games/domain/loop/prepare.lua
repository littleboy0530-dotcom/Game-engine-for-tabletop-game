-- Phase: 시작 덱을 섞고 5장씩 뽑는다
local deck = use("lib/deck.lua")

return {
  onEnter = function(game)
    for _, p in ipairs(game:players()) do
      game:shuffle(p:zone("deck"))
      deck.draw(game, p, 5)
      p.vars.points = deck.points(p)
    end
  end,
}
