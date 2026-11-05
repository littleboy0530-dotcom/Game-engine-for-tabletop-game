-- Phase: 성채 더미가 비거나 공급처 더미 3개가 비면 게임 끝. 아니면 다음 사람
local deck = use("lib/deck.lua")

return {
  onEnter = function(game, player)
    local empty = 0
    for _, z in ipairs(deck.supplies(game)) do
      if z:isEmpty() then empty = empty + 1 end
    end
    if game:zone("supply_citadel"):isEmpty() or empty >= 3 then
      local best, winner, tie = -1, nil, false
      for _, p in ipairs(game:players()) do
        p.vars.points = deck.points(p)
        if p.vars.points > best then best, winner, tie = p.vars.points, p, false
        elseif p.vars.points == best then tie = true end
      end
      if tie then game:draw("승점 " .. best .. " 동점") else game:win(winner, "승점 " .. best) end
    end
    game:nextPlayer()
  end,
  next = function(game)
    if game:isOver() then return "end" end
    return "turn"
  end,
}
