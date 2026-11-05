-- 말 종류별 이동 후보 (판정 스크립트: 상태를 바꾸지 않음)
-- 자기 킹이 체크에 걸리는지는 여기서 보지 않고, loop/move.lua가 legalMoves로 거른다.
local chess = use("lib/chess.lua")

return {
  king = {
    moveCandidates = function(piece, game)
      local out = chess.slide(piece, game, chess.ALL, 1)
      for _, z in ipairs(chess.castlingTargets(piece, game)) do out[#out + 1] = z end
      return out
    end,
  },
  queen = {
    moveCandidates = function(piece, game) return chess.slide(piece, game, chess.ALL) end,
  },
  rook = {
    moveCandidates = function(piece, game) return chess.slide(piece, game, chess.ORTHO) end,
  },
  bishop = {
    moveCandidates = function(piece, game) return chess.slide(piece, game, chess.DIAG) end,
  },
  knight = {
    moveCandidates = function(piece, game) return chess.slide(piece, game, chess.KNIGHT, 1) end,
  },
  pawn = {
    moveCandidates = function(piece, game) return chess.pawnTargets(piece, game) end,
  },
}
