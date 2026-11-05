-- 경주 공용 규칙: 한 칸씩 움직이며 "지나감"과 "멈춤" 이벤트를 낸다
local M = {}

function M.racer(game, player) return game:pieces(nil, player)[1] end

function M.position(racer) return racer.zone.x end

function M.finish(game) return game:board().width - 1 end

-- steps만큼 이동 (음수면 뒤로). 앞으로 갈 때 지나친 레이서마다 "passed", 끝나면 "stopped"
function M.move(game, racer, steps)
  if steps == 0 then return end
  local board = game:board()
  local from = M.position(racer)
  local to = math.max(0, math.min(M.finish(game), from + steps))
  game:move(racer, board:zoneAt(to, 0))
  if to > from then
    -- 지나친 레이서: 출발 칸과 도착 칸 사이에 있던 레이서 (가까운 순서)
    for x = from + 1, to - 1 do
      for _, other in ipairs(board:zoneAt(x, 0):components()) do
        if other ~= racer then game:emit("passed", { mover = racer, passed = other }) end
      end
    end
  end
  game:emit("stopped", { racer = racer, zone = racer.zone })
end

return M
