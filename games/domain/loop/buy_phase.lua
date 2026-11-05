-- Phase: 구매 단계에 들어오면 손패의 보물을 모두 낸다
return {
  onEnter = function(game, player)
    for _, c in ipairs(player:zone("hand"):cards()) do
      if c:hasTag("보물") then
        game:move(c, player:zone("play"))
        player.vars.coins = player.vars.coins + c.props.coins
      end
    end
  end,
}
