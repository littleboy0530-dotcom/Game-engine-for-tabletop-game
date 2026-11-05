-- Phase: 순간 주문 체인. 공격자부터 번갈아 쓰거나 넘긴다. 둘 다 넘기면
-- 나중에 쓴 주문부터 해결된다 (game:chain 안에서 일어난 트리거도 나중 것부터)
local duel = use("lib/duel.lua")

local function instants(game, p)
  local out = {}
  for _, c in ipairs(p:zone("hand"):cards()) do
    if c:hasTag("순간") and duel.canCast(p, c) and #game:script(c).target(game, p) > 0 then out[#out + 1] = c end
  end
  return out
end

return {
  onEnter = function(game, player)
    if #game.vars.attackers == 0 then return end
    game:chain(function()
      local stack, passes, p = {}, 0, player
      while passes < 2 do
        local options = instants(game, p)
        if #options == 0 then
          passes = passes + 1
        else
          options[#options + 1] = { label = "넘기기" }
          local card = game:choose(p, options, "순간 주문을 쓸까요? (쌓인 주문 " .. #stack .. "개)")
          if not card.kind then
            passes = passes + 1
          else
            passes = 0
            duel.pay(game, p, card.props.cost)
            local target = game:choose(p, game:script(card).target(game, p), card.label .. ": 대상을 고르세요")
            game:move(card, game:zone("stack"))
            game:emit("cast", { card = card, player = p })
            stack[#stack + 1] = { card = card, player = p, target = target }
            game:log(p.name .. ": " .. card.label .. " (체인 " .. #stack .. ")")
          end
        end
        p = duel.opponent(game, p)
      end
      for i = #stack, 1, -1 do
        local s = stack[i]
        game:script(s.card).resolve(game, s.player, s.target)
        game:move(s.card, s.player:zone("grave"))
      end
    end)
  end,
}
