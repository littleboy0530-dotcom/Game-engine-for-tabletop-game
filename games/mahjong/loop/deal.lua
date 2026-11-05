-- Phase: 패산을 섞고 13개씩 나눈다. 동(첫 번째 플레이어)부터 시작
local tiles = use("lib/tiles.lua")

return {
  onEnter = function(game)
    local wall = game:zone("wall")
    game:shuffle(wall)
    for _ = 1, 13 do
      for _, p in ipairs(game:players()) do game:move(wall:top(), p:zone("hand")) end
    end
    for _, p in ipairs(game:players()) do
      tiles.sort(game, p)
      p.vars.melds = 0
    end
    game.vars.skipDraw = false
    game.vars.wallLeft = wall:count()
  end,
}
