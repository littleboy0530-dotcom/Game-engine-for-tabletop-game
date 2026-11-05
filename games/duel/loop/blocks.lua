-- Phase: 수비하는 사람이 공격 생물마다 막을 생물을 고른다
local duel = use("lib/duel.lua")

return {
  onEnter = function(game, player)
    local defender = duel.opponent(game, player)
    local used, blocks = {}, {}
    for _, attacker in ipairs(game.vars.attackers) do
      local options = {}
      for _, c in ipairs(duel.creatures(defender)) do
        if c.rotation == 0 and not used[c.id] then options[#options + 1] = c end
      end
      if #options > 0 then
        options[#options + 1] = { label = "막지 않기" }
        local pick = game:choose(defender, options, attacker.label .. "(공격력 " .. game:value(attacker, "power") .. ")을 막을까요?")
        if pick.kind then
          used[pick.id] = true
          blocks[attacker.id] = pick -- 공격 생물 id로 저장 (번호에 빈칸이 생기면 저장되지 않는다)
        end
      end
    end
    game.vars.blocks = blocks
  end,
}
