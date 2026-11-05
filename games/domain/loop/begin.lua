-- Phase: 턴 시작
return {
  onEnter = function(game, player)
    player.vars.actions = 1
    player.vars.buys = 1
    player.vars.coins = 0
  end,
}
