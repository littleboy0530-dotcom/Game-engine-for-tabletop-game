-- Action: 말 이동
local chess = use("lib/chess.lua")

local PROMOTIONS = {
  { label = "퀸", type = "queen" },
  { label = "룩", type = "rook" },
  { label = "비숍", type = "bishop" },
  { label = "나이트", type = "knight" },
}

return {
  -- 판정: 움직일 수 있는 말 목록
  options = function(game, player)
    local out = {}
    for _, piece in ipairs(chess.activePieces(player)) do
      if #chess.legalMoves(game, piece) > 0 then out[#out + 1] = piece end
    end
    return out
  end,

  -- 실행: 칸을 고르고, 필요하면 승격할 말을 고른 뒤 수를 둔다
  execute = function(game, player, piece)
    local to = game:choose(player, chess.legalMoves(game, piece), "어디로 옮길까요?")
    local promote = nil
    if chess.isPromotion(piece, to) then
      promote = game:choose(player, PROMOTIONS, "무엇으로 승격할까요?").type
    end
    game:log(player.name .. ": " .. piece.label .. " " .. piece.zone.name .. " → " .. to.name)
    chess.applyMove(game, piece, to, promote)
  end,
}
