-- Phase: 승패 판정 후 다음 플레이어로
local janggi = use("lib/janggi.lua")

return {
  onEnter = function(game, player)
    if not game:isOver() then
      local opponent = game:playerAfter(player)
      local check = janggi.inCheck(game, opponent)
      if not janggi.hasLegalMove(game, opponent) then
        if check then game:win(player, "외통수") else game:draw("둘 수 있는 수가 없음") end
      elseif check then
        game:log(opponent.name .. " 장군!")
      end
    end
    game:nextPlayer()
  end,

  next = function(game)
    if game:isOver() then return "end" end
    return "turn"
  end,
}
