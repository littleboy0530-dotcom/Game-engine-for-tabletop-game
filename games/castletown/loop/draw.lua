-- Phase: 주머니에서 타일을 뽑는다. 놓을 곳이 없는 타일은 버리고 다시 뽑는다
local town = use("lib/town.lua")

return {
  onEnter = function(game)
    local bag, drawn = game:zone("bag"), game:zone("drawn")
    game.vars.noTile = false
    while true do
      if bag:isEmpty() then
        game.vars.noTile = true
        break
      end
      local tile = bag:top()
      game:move(tile, drawn)
      if #town.placements(game, tile) > 0 then break end
      game:move(tile, game:zone("discarded"))
      game:log(tile.label .. ": 놓을 곳이 없어서 버림")
    end
    game.vars.tilesLeft = bag:count()
  end,
  next = function(game)
    if game.vars.noTile then return "end" end
    return "ready"
  end,
}
