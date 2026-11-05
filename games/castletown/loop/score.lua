-- Phase: 방금 놓은 타일로 완성된 도시, 길, 수도원의 점수를 매기고 일꾼을 돌려준다
local town = use("lib/town.lua")

return {
  onEnter = function(game)
    local last = game.vars.last
    local tile = game:tileIn(last)
    local done = {}
    for _, seg in ipairs(tile:segments()) do
      if seg.kind ~= "수도원" then
        local region = game:region(last, seg.id)
        local k = town.regionKey(region)
        if region.complete and #region.meeples > 0 and not done[k] then
          done[k] = true
          town.award(game, town.majority(game, region.meeples), town.points(region, seg.kind), "완성된 " .. seg.kind)
          town.returnWorkers(game, region.meeples)
        end
      end
    end
    -- 주변의 수도원: 3x3이 다 차면 9점
    local board = game:board()
    for dx = -1, 1 do
      for dy = -1, 1 do
        local z = board:zoneAt(last.x + dx, last.y + dy)
        local t = z and game:tileIn(z)
        if t then
          for _, seg in ipairs(t:segments()) do
            local child = seg.kind == "수도원" and z:child(seg.id)
            local monks = child and child:components() or {}
            if #monks > 0 and town.around(game, z) == 9 then
              town.award(game, { monks[1].owner }, 9, "완성된 수도원")
              town.returnWorkers(game, monks)
            end
          end
        end
      end
    end
    town.updateWorkers(game)
  end,
}
