-- Phase: 타일이 다 떨어지면 남은 일꾼으로 마무리 점수를 매기고 끝
local town = use("lib/town.lua")

return {
  onEnter = function(game, player)
    if not game.vars.noTile then
      game:nextPlayer()
      return
    end
    local done = {}
    for _, w in ipairs(game:pieces("worker")) do
      local child = w.zone
      if child.parent then
        local z = child.parent
        if child.name == "수도원" then
          town.award(game, { w.owner }, town.around(game, z), "미완성 수도원")
        else
          local region = game:region(z, child.segment)
          local k = town.regionKey(region)
          if not done[k] then
            done[k] = true
            town.award(game, town.majority(game, region.meeples), town.points(region, child.name), "미완성 " .. child.name)
          end
        end
      end
    end
    local players = game:players()
    table.sort(players, function(a, b) return a.vars.score > b.vars.score end)
    if players[1].vars.score == players[2].vars.score then
      game:draw("점수 " .. players[1].vars.score .. " 동점")
    else
      game:win(players[1], "점수 " .. players[1].vars.score)
    end
  end,
  next = function(game)
    if game:isOver() then return "end" end
    return "turn"
  end,
}
