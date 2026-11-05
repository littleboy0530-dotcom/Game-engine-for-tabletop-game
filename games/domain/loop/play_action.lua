-- Action: 손패의 액션 카드를 낸다
local effects = use("components/cards.lua")

return {
  options = function(game, player)
    if player.vars.actions < 1 then return {} end
    local out = {}
    for _, c in ipairs(player:zone("hand"):cards()) do
      if c:hasTag("액션") then out[#out + 1] = c end
    end
    return out
  end,
  execute = function(game, player, card)
    player.vars.actions = player.vars.actions - 1
    game:move(card, player:zone("play"))
    game:log(player.name .. ": " .. card.label)
    effects[card.type].onPlay(game, player, card)
  end,
}
