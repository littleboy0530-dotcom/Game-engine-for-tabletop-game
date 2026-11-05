-- Action: 힘으로 괴물을 처치하고 명예를 얻는다
local market = use("lib/market.lua")

return {
  options = function(game, player)
    local out = {}
    local function offer(c)
      if c and c:hasTag("괴물") and c.props.defense <= player.vars.might then out[#out + 1] = c end
    end
    for _, c in ipairs(game:zone("center"):cards()) do offer(c) end
    offer(game:zone("cultist"):top())
    return out
  end,
  execute = function(game, player, monster)
    player.vars.might = player.vars.might - monster.props.defense
    market.gainHonor(game, player, monster.props.honor)
    if not monster:hasTag("상설") then game:move(monster, game:zone("void")) end
    if monster.props.draw then market.draw(game, player, monster.props.draw) end
    game:log(player.name .. ": " .. monster.label .. " 처치 (명예 +" .. monster.props.honor .. ")")
  end,
}
