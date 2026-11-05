-- Phase: 칩이 없는 사람은 탈락. 한 명 남으면 게임 끝
local poker = use("lib/poker.lua")

return {
  onEnter = function(game)
    for _, p in ipairs(game:players()) do
      if not p.vars.out and p.vars.chips == 0 then
        p.vars.out = true
        game:log(p.name .. " 탈락")
      end
      p.vars.bet = 0
      poker.updateStatus(p)
    end
    local left = poker.filter(game, poker.seated)
    if #left == 1 then game:win(left[1], "마지막까지 칩을 지킴") end
  end,
  next = function(game)
    if game:isOver() then return "end" end
    return "hand"
  end,
}
