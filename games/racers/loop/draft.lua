-- Phase: 순서대로 레이서를 하나씩 고르고 출발선에 놓는다
local POOL = {
  { type = "turtle", label = "🐢 거북: 1이나 2를 굴리면 +2" },
  { type = "rabbit", label = "🐇 토끼: 지나갈 때마다 1칸 더" },
  { type = "hedgehog", label = "🦔 고슴도치: 나를 지나간 레이서 1칸 뒤로" },
  { type = "frog", label = "🐸 개구리: 6을 굴리면 2칸 더" },
  { type = "fox", label = "🦊 여우: 남이 6을 굴리면 1칸 앞으로" },
  { type = "squirrel", label = "🐿 다람쥐: 같은 칸에 멈추면 1칸 더" },
}

return {
  onEnter = function(game)
    local left = {}
    for i, r in ipairs(POOL) do left[i] = r end
    local startZone = game:board():zoneAt(0, 0)
    for _, p in ipairs(game:players()) do
      local pick = game:choose(p, left, p.name .. ": 레이서를 고르세요")
      for i, r in ipairs(left) do
        if r.type == pick.type then table.remove(left, i) break end
      end
      game:create(pick.type, p, startZone)
      p.vars.racer = pick.label:match("^(%S+)")
      p.vars.position = 0
    end
  end,
}
