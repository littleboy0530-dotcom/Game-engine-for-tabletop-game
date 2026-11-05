local duel = use("lib/duel.lua")

return {
  onEnter = function(game)
    for _, p in ipairs(game:players()) do
      game:shuffle(p:zone("deck"))
      for _ = 1, 5 do duel.draw(game, p) end
      p.vars.life = duel.START_LIFE
    end
    duel.updateMana(game)
  end,
}
