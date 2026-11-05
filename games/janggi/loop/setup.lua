-- Phase: 상차림. 각자 마와 상을 놓을 순서를 고른다 (자기 쪽에서 본 왼쪽부터)
local ARRANGEMENTS = {
  { label = "마상마상", order = { "horse", "elephant", "horse", "elephant" } },
  { label = "상마상마", order = { "elephant", "horse", "elephant", "horse" } },
  { label = "마상상마", order = { "horse", "elephant", "elephant", "horse" } },
  { label = "상마마상", order = { "elephant", "horse", "horse", "elephant" } },
}

return {
  onEnter = function(game, player)
    local board = game:board()
    for _, p in ipairs(game:players()) do
      local pick = game:choose(p, ARRANGEMENTS, p.name .. "의 상차림을 고르세요")
      -- 초는 아래쪽(y=0)에서 왼쪽이 x=1, 한은 위쪽(y=9)에서 왼쪽이 x=7
      local slots = p.id == "cho" and { 1, 2, 6, 7 } or { 7, 6, 2, 1 }
      local y = p.id == "cho" and 0 or 9
      for i, kind in ipairs(pick.order) do
        game:create(kind, p, board:zoneAt(slots[i], y))
      end
      game:log(p.name .. " 상차림: " .. pick.label)
    end
  end,
}
