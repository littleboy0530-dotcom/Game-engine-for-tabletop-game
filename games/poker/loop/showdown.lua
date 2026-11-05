-- Phase: 쇼다운. 패를 공개하고 팟(사이드 팟 포함)을 나눈다
local poker = use("lib/poker.lua")

local function seatOrderFrom(game, dealerId, list)
  -- 딜러 다음 자리부터의 순서 (나머지 칩을 줄 때 사용)
  local order, p = {}, game:player(dealerId)
  for _ = 1, #game:players() do
    p = game:playerAfter(p)
    for _, q in ipairs(list) do if q == p then order[#order + 1] = q end end
  end
  return order
end

return {
  onEnter = function(game)
    local live = poker.filter(game, poker.live)
    if #live == 1 then
      local w = live[1]
      w.vars.chips = w.vars.chips + game.vars.pot
      game:log(w.name .. ": 팟 " .. game.vars.pot .. " 획득 (모두 폴드)")
      game.vars.pot = 0
      return
    end

    local community = game:zone("community"):cards()
    local scores = {}
    for _, p in ipairs(live) do
      local cards = {}
      for _, c in ipairs(p:zone("hand"):cards()) do
        cards[#cards + 1] = c
        game:move(c, p:zone("shown"))
      end
      for _, c in ipairs(community) do cards[#cards + 1] = c end
      scores[p.id] = poker.evaluate(cards)
      game:log(p.name .. ": " .. poker.name(scores[p.id]))
    end

    -- 사이드 팟: 살아 있는 사람들이 낸 금액 단계별로 나눈다
    local levels = {}
    for _, p in ipairs(live) do levels[#levels + 1] = p.vars.total end
    table.sort(levels)
    local prev, paidOut = 0, 0
    local lastWinners = nil
    for _, level in ipairs(levels) do
      if level > prev then
        local portion = 0
        for _, p in ipairs(game:players()) do
          portion = portion + math.max(0, math.min(p.vars.total or 0, level) - prev)
        end
        local best, winners = nil, {}
        for _, p in ipairs(live) do
          if p.vars.total >= level then
            local c = best and poker.compare(scores[p.id], best) or 1
            if c > 0 then best, winners = scores[p.id], { p }
            elseif c == 0 then winners[#winners + 1] = p end
          end
        end
        winners = seatOrderFrom(game, game.vars.dealer, winners)
        local share = portion // #winners
        for i, w in ipairs(winners) do
          local extra = (i <= portion % #winners) and 1 or 0
          w.vars.chips = w.vars.chips + share + extra
        end
        paidOut = paidOut + portion
        lastWinners = winners
        prev = level
      end
    end
    -- 폴드한 사람이 더 많이 낸 몫은 마지막 팟 승자에게
    local rest = game.vars.pot - paidOut
    if rest > 0 and lastWinners then lastWinners[1].vars.chips = lastWinners[1].vars.chips + rest end

    local names = {}
    for _, w in ipairs(lastWinners or {}) do names[#names + 1] = w.name end
    game:log("승자: " .. table.concat(names, ", "))
    game.vars.pot = 0
    for _, p in ipairs(game:players()) do poker.updateStatus(p) end
  end,
}
