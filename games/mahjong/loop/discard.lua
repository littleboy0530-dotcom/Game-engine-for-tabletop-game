-- Action: 손패에서 하나 버린다
return {
  options = function(game, player) return player:zone("hand"):cards() end,
  execute = function(game, player, tile)
    game:move(tile, player:zone("river"))
    game:log(player.name .. ": " .. tile.label .. " 버림")
  end,
}
