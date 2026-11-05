-- Action: 손패의 카드를 낸다 (룬, 힘, 카드 뽑기)
local market = use("lib/market.lua")

return {
  options = function(game, player) return player:zone("hand"):cards() end,
  execute = function(game, player, card)
    game:move(card, player:zone("play"))
    player.vars.runes = player.vars.runes + (card.props.runes or 0)
    player.vars.might = player.vars.might + (card.props.might or 0)
    if card.props.draw then market.draw(game, player, card.props.draw) end
  end,
}
