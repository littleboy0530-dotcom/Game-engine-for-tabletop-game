-- Phase: 공격할 생물을 하나씩 고른다. 고른 생물은 탭된다
local attack = use("loop/attack.lua")

return {
  onEnter = function(game, player)
    local chosen = {}
    while true do
      local options = {}
      for _, c in ipairs(attack.ready(player)) do options[#options + 1] = c end
      if #options == 0 then break end
      options[#options + 1] = { label = "공격 선언 끝" }
      local pick = game:choose(player, options, "공격할 생물을 고르세요")
      if not pick.kind then break end
      game:setRotation(pick, 1)
      chosen[#chosen + 1] = pick
    end
    game.vars.attackers = chosen
    game.vars.blocks = {}
  end,
}
