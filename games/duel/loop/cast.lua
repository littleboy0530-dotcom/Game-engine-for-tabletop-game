-- Action: 마나를 내고 주문을 쓴다. 생물과 장비는 전장에, 순간 주문은 바로 효과
local duel = use("lib/duel.lua")

return {
  options = function(game, player)
    local out = {}
    for _, c in ipairs(player:zone("hand"):cards()) do
      if not c:hasTag("땅") and duel.canCast(player, c) then
        if not c:hasTag("순간") or #game:script(c).target(game, player) > 0 then out[#out + 1] = c end
      end
    end
    return out
  end,
  execute = function(game, player, card)
    duel.pay(game, player, card.props.cost)
    game:log(player.name .. ": " .. card.label)
    if card:hasTag("순간") then
      local s = game:script(card)
      local target = game:choose(player, s.target(game, player), card.label .. ": 대상을 고르세요")
      game:move(card, player:zone("grave"))
      s.resolve(game, player, target)
      return
    end
    game:move(card, player:zone("field"))
    if card:hasTag("생물") then
      card.props.sick = true
      card.props.damage = 0
    elseif card:hasTag("장비") then
      local mine = duel.creatures(player)
      if #mine > 0 then
        local holder = game:choose(player, mine, card.label .. ": 장착할 생물을 고르세요")
        card.props.attachedTo = holder
      end
    end
  end,
}
