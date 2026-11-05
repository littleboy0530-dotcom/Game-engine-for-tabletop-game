-- Action: 말 이동
local janggi = use("lib/janggi.lua")

return {
  options = function(game, player)
    local out = {}
    for _, piece in ipairs(janggi.activePieces(player)) do
      if #janggi.legalMoves(game, piece) > 0 then out[#out + 1] = piece end
    end
    return out
  end,

  execute = function(game, player, piece)
    local to = game:choose(player, janggi.legalMoves(game, piece), "어디로 옮길까요?")
    game:log(player.name .. ": " .. piece.label .. " " .. piece.zone.name .. " → " .. to.name)
    janggi.applyMove(game, piece, to)
  end,
}
