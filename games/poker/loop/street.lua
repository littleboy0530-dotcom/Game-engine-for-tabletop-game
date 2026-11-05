-- Phase: 다음 단계로 (프리플롭 → 플롭 → 턴 → 리버 → 쇼다운)
local poker = use("lib/poker.lua")

local NAMES = { [0] = "프리플롭", "플롭", "턴", "리버", "쇼다운" }
local DEAL = { [1] = 3, [2] = 1, [3] = 1 }

return {
  onEnter = function(game)
    local street = game.vars.street + 1
    game.vars.street = street
    game.vars.streetName = NAMES[street]

    if DEAL[street] and poker.count(game, poker.live) > 1 then
      local deck = game:zone("deck")
      game:move(deck:top(), game:zone("muck")) -- 한 장 버리고
      for _ = 1, DEAL[street] do game:move(deck:top(), game:zone("community")) end
      for _, p in ipairs(game:players()) do p.vars.bet = 0 end
      game.vars.currentBet = 0
      game.vars.minRaise = poker.BIG_BLIND
    end
    for _, p in ipairs(game:players()) do p.vars.acted = false end

    -- 첫 차례: 프리플롭은 빅 블라인드 다음, 그 뒤로는 딜러 다음
    local from = street == 0 and game:player(game.vars.bigBlind) or game:player(game.vars.dealer)
    local first = poker.nextSeat(game, from, poker.canAct)
    if first then game:setCurrentPlayer(first) end
  end,

  next = function(game)
    if poker.count(game, poker.live) <= 1 or game.vars.street >= 4 then return "showdown" end
    local actors = poker.filter(game, poker.canAct)
    if #actors >= 2 then return "betting" end
    if #actors == 1 and poker.toCall(game, actors[1]) > 0 then return "betting" end
    return "street" -- 모두 올인: 남은 카드를 바로 깐다
  end,
}
