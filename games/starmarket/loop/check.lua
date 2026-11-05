-- Phase: 명예가 다 떨어지면 점수(명예 + 영웅 점수)가 높은 사람이 승리
local market = use("lib/market.lua")

return {
  onEnter = function(game, player)
    if game.vars.honorPool <= 0 then
      local best, winner, tie = -1, nil, false
      for _, p in ipairs(game:players()) do
        p.vars.score = market.score(p)
        if p.vars.score > best then best, winner, tie = p.vars.score, p, false
        elseif p.vars.score == best then tie = true end
      end
      if tie then game:draw("점수 " .. best .. " 동점") else game:win(winner, "점수 " .. best) end
    end
    game:nextPlayer()
  end,
  next = function(game)
    if game:isOver() then return "end" end
    return "turn"
  end,
}
