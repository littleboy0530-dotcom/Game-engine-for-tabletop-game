-- Phase: 카드를 모두 공개하고, 전선마다 힘이 큰 쪽이 영향력을 얻는다
local front = use("lib/front.lua")

return {
  onEnter = function(game)
    local players = game:players()
    for _, lane in ipairs(front.LANES) do
      local best, winner, tie = -1, nil, false
      for _, p in ipairs(players) do
        local power = 0
        for _, c in ipairs(p:zone(lane):cards()) do
          game:flip(c, "up")
          power = power + c.props.power
        end
        if power > best then best, winner, tie = power, p, false
        elseif power == best then tie = true end
      end
      local worth = players[1]:zone(lane).props.worth
      local laneName = players[1]:zone(lane).name:gsub("^.-의 ", "")
      if tie then
        game:log(laneName .. ": 무승부")
      else
        winner.vars.influence = winner.vars.influence + worth
        game:log(laneName .. ": " .. winner.name .. " 승리 (+" .. worth .. ")")
      end
    end
    for _, p in ipairs(players) do
      for _, lane in ipairs(front.LANES) do
        for _, c in ipairs(p:zone(lane):cards()) do game:move(c, p:zone("discard")) end
      end
    end
  end,
}
