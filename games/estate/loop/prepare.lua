-- Phase: 돈을 나눠 주고 행운 카드를 섞는다
local estate = use("lib/estate.lua")

return {
  onEnter = function(game)
    for _, p in ipairs(game:players()) do
      p.vars.money = estate.START_MONEY
      p.vars.out = false
    end
    game:shuffle(game:zone("events"))
    game.vars.round = 1
    estate.refresh(game)
  end,
}
