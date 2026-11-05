-- Phase: 새로 드러난 카드를 뒤집고, 승리를 확인하고, 다음 사람으로
local pyramid = use("lib/pyramid.lua")

return {
  onEnter = function(game, player)
    for _, c in ipairs(pyramid.cards(game)) do
      if c.face == "down" and pyramid.free(game, c) then game:flip(c, "up") end
    end
    if pyramid.symbols(player) >= 4 then
      game:win(player, "문장 4개")
      return
    end
    if #pyramid.cards(game) == 0 then
      local a, b = game:players()[1], game:players()[2]
      local sa, sb = a.vars.points + a.vars.coins // 3, b.vars.points + b.vars.coins // 3
      if sa == sb then game:draw("점수 " .. sa .. " 동점")
      elseif sa > sb then game:win(a, "점수 " .. sa)
      else game:win(b, "점수 " .. sb) end
      return
    end
    game:nextPlayer()
  end,
  next = function(game)
    if game:isOver() then return "end" end
    return "turn"
  end,
}
