-- Phase: 패산에서 하나 뽑는다. 퐁/치로 가져온 직후에는 뽑지 않는다
local tiles = use("lib/tiles.lua")

return {
  onEnter = function(game, player)
    if game.vars.skipDraw then
      game.vars.skipDraw = false
      game.vars.drew = false -- 퐁/치 직후에는 쯔모할 수 없다
      return
    end
    local wall = game:zone("wall")
    if wall:isEmpty() then
      game:draw("유국: 패산이 다 떨어졌어요")
      return
    end
    game:move(wall:top(), player:zone("hand"))
    tiles.sort(game, player)
    game.vars.drew = true
    game.vars.wallLeft = wall:count()
  end,
  next = function(game)
    if game:isOver() then return "result" end
    return "act"
  end,
}
