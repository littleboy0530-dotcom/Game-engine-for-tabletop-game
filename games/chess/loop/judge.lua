-- Phase: 승패 판정 후 다음 플레이어로
local chess = use("lib/chess.lua")

return {
  onEnter = function(game, player)
    if not game:isOver() then
      local opponent = game:playerAfter(player)
      local check = chess.inCheck(game, opponent)
      if not chess.hasLegalMove(game, opponent) then
        if check then game:win(player, "체크메이트") else game:draw("스테일메이트") end
      elseif check then
        game:log(opponent.name .. " 체크!")
      elseif (game.vars.halfmoves or 0) >= 100 then
        game:draw("50수 규칙")
      end
    end
    game:nextPlayer()
  end,

  next = function(game)
    if game:isOver() then return "end" end
    return "turn"
  end,
}
