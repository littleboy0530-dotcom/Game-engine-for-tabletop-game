-- Phase: 라운드가 끝났을 때 목표 영향력에 닿고, 상대보다 많으면 승리
local front = use("lib/front.lua")

return {
  onEnter = function(game)
    local players = game:players()
    table.sort(players, function(a, b) return a.vars.influence > b.vars.influence end)
    local top = players[1]
    if top.vars.influence >= front.TARGET and top.vars.influence > players[2].vars.influence then
      game:win(top, "영향력 " .. top.vars.influence)
    elseif game.vars.round >= 12 then
      game:draw("12라운드 동안 승부가 나지 않음")
    end
  end,
  next = function(game)
    if game:isOver() then return "end" end
    return "round"
  end,
}
