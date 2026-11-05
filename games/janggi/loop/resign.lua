-- Action: 기권
return {
  execute = function(game, player)
    game:win(game:playerAfter(player), player.name .. " 기권")
  end,
}
