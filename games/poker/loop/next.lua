-- Phase: 다음에 베팅할 사람을 찾는다. 없으면 이번 베팅 라운드 끝
local poker = use("lib/poker.lua")

local function needsToAct(game)
  return function(p)
    return poker.canAct(p) and (not p.vars.acted or poker.toCall(game, p) > 0)
  end
end

return {
  onEnter = function(game, player)
    game.vars.roundOver = true
    if poker.count(game, poker.live) <= 1 then return end
    local nxt = poker.nextSeat(game, player, needsToAct(game))
    if nxt then
      game:setCurrentPlayer(nxt)
      game.vars.roundOver = false
    end
  end,
  next = function(game)
    if game.vars.roundOver then return "end" end
    return "act"
  end,
}
