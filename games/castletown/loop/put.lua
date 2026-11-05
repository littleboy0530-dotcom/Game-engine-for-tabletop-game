-- Action: 방금 놓은 타일의 부분에 일꾼을 놓는다. 이미 일꾼이 있는 영역에는 못 놓는다
local town = use("lib/town.lua")

return {
  options = function(game, player)
    if town.supply(player):isEmpty() then return {} end
    local out = {}
    for _, child in ipairs(game.vars.last:children()) do
      local region = game:region(game.vars.last, child.segment)
      if #region.meeples == 0 then out[#out + 1] = child end
    end
    return out
  end,
  execute = function(game, player, child)
    game:move(town.supply(player):top(), child)
    town.updateWorkers(game)
    game:log(player.name .. ": " .. child.name .. "에 일꾼")
  end,
}
