-- Phase: 카드를 모아 섞고, 딜러를 옮기고, 두 장씩 돌리고, 블라인드를 낸다
local poker = use("lib/poker.lua")

return {
  onEnter = function(game)
    local deck = game:zone("deck")
    local piles = { game:zone("community"), game:zone("muck") }
    for _, p in ipairs(game:players()) do
      piles[#piles + 1] = p:zone("hand")
      piles[#piles + 1] = p:zone("shown")
    end
    for _, z in ipairs(piles) do
      for _, c in ipairs(z:cards()) do game:move(c, deck) end
    end
    game:shuffle(deck)

    game.vars.handNo = game.vars.handNo + 1
    game.vars.pot = 0
    game.vars.street = -1
    for _, p in ipairs(game:players()) do
      p.vars.folded = p.vars.out
      p.vars.bet = 0
      p.vars.total = 0
      p.vars.acted = false
      poker.updateStatus(p)
    end

    local dealer = poker.nextSeat(game, game:player(game.vars.dealer), poker.seated)
    game.vars.dealer = dealer.id

    for _ = 1, 2 do
      local p = dealer
      repeat
        p = poker.nextSeat(game, p, poker.seated)
        game:move(deck:top(), p:zone("hand"))
      until p == dealer
    end

    local sb, bb
    if poker.count(game, poker.seated) == 2 then
      sb = dealer
    else
      sb = poker.nextSeat(game, dealer, poker.seated)
    end
    bb = poker.nextSeat(game, sb, poker.seated)
    poker.put(game, sb, poker.SMALL_BLIND)
    poker.put(game, bb, poker.BIG_BLIND)
    game.vars.currentBet = poker.BIG_BLIND
    game.vars.minRaise = poker.BIG_BLIND
    game.vars.bigBlind = bb.id
    game:log(game.vars.handNo .. "번째 판: 딜러 " .. dealer.name .. ", 블라인드 " .. sb.name .. " " .. poker.SMALL_BLIND .. " / " .. bb.name .. " " .. poker.BIG_BLIND)
  end,
}
