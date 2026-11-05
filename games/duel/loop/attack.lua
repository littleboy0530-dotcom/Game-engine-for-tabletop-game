-- Action: 공격하기 (턴에 한 번). 공격할 수 있는 생물이 있어야 한다
local duel = use("lib/duel.lua")

local function ready(player)
  local out = {}
  for _, c in ipairs(duel.creatures(player)) do
    if c.rotation == 0 and not c.props.sick then out[#out + 1] = c end
  end
  return out
end

return {
  options = function(game, player)
    if #ready(player) == 0 then return {} end
    return { { label = "공격하기" } }
  end,
  execute = function() end,
  ready = ready,
}
