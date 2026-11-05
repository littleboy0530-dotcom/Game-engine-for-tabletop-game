-- Action: 기권 (선택지가 없는 Action은 버튼 하나로 표시된다)
return {
  execute = function(game, player)
    game:win(game:playerAfter(player), player.name .. " 기권")
  end,
}
