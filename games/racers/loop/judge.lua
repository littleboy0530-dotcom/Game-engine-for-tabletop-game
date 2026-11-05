-- Phase: 결승에 닿은 레이서가 있으면 끝. 여럿이면 먼저 도착한 순서(현재 플레이어부터)
local race = use("lib/race.lua")

return {
  onEnter = function(game, player)
    local p = player
    for _ = 1, #game:players() do
      if race.position(race.racer(game, p)) >= race.finish(game) then
        game:win(p, race.racer(game, p).label .. " 결승선 통과")
        return
      end
      p = game:playerAfter(p)
    end
    game:nextPlayer()
  end,
  next = function(game)
    if game:isOver() then return "end" end
    return "turn"
  end,
}
