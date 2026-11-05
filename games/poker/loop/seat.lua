-- Phase: 칩 나누기
local poker = use("lib/poker.lua")

return {
  onEnter = function(game)
    local players = game:players()
    for _, p in ipairs(players) do
      p.vars.chips = poker.START_CHIPS
      p.vars.bet = 0
      p.vars.out = false
      poker.updateStatus(p)
    end
    -- 첫 판의 딜러가 1번이 되도록 마지막 사람에서 시작
    game.vars.dealer = players[#players].id
    game.vars.handNo = 0
    game.vars.pot = 0
  end,
}
