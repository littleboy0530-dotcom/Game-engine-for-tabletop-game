return {
  onEnter = function(game) game:nextPlayer() end,
  next = function(game)
    if game:isOver() then return "end" end
    return "turn"
  end,
}
