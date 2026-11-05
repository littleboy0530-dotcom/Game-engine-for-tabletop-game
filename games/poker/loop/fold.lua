-- Action: 폴드 (낼 돈이 있을 때만)
local poker = use("lib/poker.lua")

return {
  options = function(game, player)
    if poker.toCall(game, player) > 0 then return { { label = "폴드" } } end
    return {}
  end,
  execute = function(game, player)
    player.vars.folded = true
    poker.updateStatus(player)
    for _, c in ipairs(player:zone("hand"):cards()) do game:move(c, game:zone("muck")) end
    game:log(player.name .. ": 폴드")
  end,
}
