-- Phase: 모두 몰래 내기. 각자 세 전선에 카드를 한 장씩 뒷면으로 놓는다
-- 앞사람이 낸 카드는 뒷면이라 다음 사람에게 보이지 않는다
local front = use("lib/front.lua")

return {
  onEnter = function(game)
    for _, p in ipairs(game:players()) do
      for _, lane in ipairs(front.LANES) do
        local zone = p:zone(lane)
        local name = zone.name:gsub("^.-의 ", "")
        local card = game:choose(p, p:zone("hand"):cards(), name .. "에 낼 카드를 고르세요")
        game:move(card, zone)
        game:flip(card, "down")
      end
    end
  end,
}
