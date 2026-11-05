-- Phase: 전투 피해. 막힌 생물끼리는 서로 공격력만큼, 안 막힌 생물은 상대에게
local duel = use("lib/duel.lua")

local function alive(c) return c.zone and c.zone.id:sub(1, 6) == "field@" end

return {
  onEnter = function(game, player)
    local defender = duel.opponent(game, player)
    local blocks = game.vars.blocks or {}
    for _, attacker in ipairs(game.vars.attackers) do
      if alive(attacker) then
        local blocker = blocks[attacker.id]
        if blocker and alive(blocker) then
          local pa, pb = game:value(attacker, "power"), game:value(blocker, "power")
          duel.damage(game, blocker, pa, attacker)
          duel.damage(game, attacker, pb, blocker)
        elseif not blocker then
          duel.damage(game, defender, game:value(attacker, "power"), attacker)
        end
      end
    end
    game.vars.attackers = {}
    game.vars.blocks = {}
    duel.updateMana(game)
  end,
}
