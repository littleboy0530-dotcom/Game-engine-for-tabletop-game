-- Action: 룬으로 중앙 줄이나 상설 더미의 영웅을 산다
return {
  options = function(game, player)
    local out = {}
    local function offer(c)
      if c and c:hasTag("영웅") and c.props.cost <= player.vars.runes then out[#out + 1] = c end
    end
    for _, c in ipairs(game:zone("center"):cards()) do offer(c) end
    offer(game:zone("mystics"):top())
    offer(game:zone("infantry"):top())
    return out
  end,
  execute = function(game, player, card)
    player.vars.runes = player.vars.runes - card.props.cost
    game:move(card, player:zone("discard")) -- 중앙 줄에서 빠지면 규칙 리스너가 채운다
    game:log(player.name .. ": " .. card.label .. " 영입")
  end,
}
