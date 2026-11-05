-- Action: 뽑은 타일을 놓는다. 칸을 고르고, 맞는 방향이 여러 개면 방향도 고른다
local town = use("lib/town.lua")

return {
  options = function(game, player)
    local tile = game:zone("drawn"):top()
    local out = {}
    for _, p in ipairs(town.placements(game, tile)) do out[#out + 1] = p.zone end
    return out
  end,
  execute = function(game, player, zone)
    local tile = game:zone("drawn"):top()
    local rots = {}
    for _, p in ipairs(town.placements(game, tile)) do
      if p.zone == zone then rots = p.rots end
    end
    local rot = rots[1]
    if #rots > 1 then
      local choices = {}
      for i, r in ipairs(rots) do choices[i] = { label = town.ROTATIONS[r + 1], rot = r } end
      rot = game:choose(player, choices, "어느 방향으로 놓을까요?").rot
    end
    game:setRotation(tile, rot)
    game:move(tile, zone)
    town.addFrontier(game, zone)
    game.vars.last = zone
    game:log(player.name .. ": " .. tile.label .. " → " .. zone.name)
  end,
}
