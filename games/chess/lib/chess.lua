-- 체스 공용 규칙: 이동 후보, 공격 판정, 합법 수, 수 적용
local M = {}

M.KNIGHT = { {1, 2}, {2, 1}, {-1, 2}, {-2, 1}, {1, -2}, {2, -1}, {-1, -2}, {-2, -1} }
M.ORTHO = { {1, 0}, {-1, 0}, {0, 1}, {0, -1} }
M.DIAG = { {1, 1}, {1, -1}, {-1, 1}, {-1, -1} }
M.ALL = { {1, 0}, {-1, 0}, {0, 1}, {0, -1}, {1, 1}, {1, -1}, {-1, 1}, {-1, -1} }

-- 백은 위로(+1), 흑은 아래로(-1) 전진
function M.forward(player)
  if player.id == "white" then return 1 end
  return -1
end

local function pieceAt(board, x, y)
  local z = board:zoneAt(x, y)
  return z and z:piece()
end

-- 보드 위에 있는 말만 (잡힌 말 제외)
function M.activePieces(player)
  local out = {}
  for _, p in ipairs(player:pieces()) do
    if p.zone.x then out[#out + 1] = p end
  end
  return out
end

-- 방향마다 막힐 때까지 읽기. 상대 말이 있는 칸은 포함하고 멈춤
function M.slide(piece, game, dirs, limit)
  local board = game:board()
  local from = piece.zone
  local out = {}
  for _, d in ipairs(dirs) do
    local x, y, n = from.x + d[1], from.y + d[2], 0
    while true do
      local z = board:zoneAt(x, y)
      if not z then break end
      local other = z:piece()
      if other then
        if other.owner ~= piece.owner then out[#out + 1] = z end
        break
      end
      out[#out + 1] = z
      n = n + 1
      if limit and n >= limit then break end
      x, y = x + d[1], y + d[2]
    end
  end
  return out
end

-- zone이 by 플레이어의 말에게 공격받고 있는가 (zone에서 거꾸로 찾아봄)
function M.attackedBy(game, zone, by)
  local board = game:board()
  local x, y = zone.x, zone.y
  for _, d in ipairs(M.KNIGHT) do
    local p = pieceAt(board, x + d[1], y + d[2])
    if p and p.owner == by and p.type == "knight" then return true end
  end
  for _, d in ipairs(M.ALL) do
    local p = pieceAt(board, x + d[1], y + d[2])
    if p and p.owner == by and p.type == "king" then return true end
  end
  local back = -M.forward(by)
  for _, dx in ipairs({ -1, 1 }) do
    local p = pieceAt(board, x + dx, y + back)
    if p and p.owner == by and p.type == "pawn" then return true end
  end
  for _, d in ipairs(M.ALL) do
    local diagonal = d[1] ~= 0 and d[2] ~= 0
    local cx, cy = x + d[1], y + d[2]
    while true do
      local z = board:zoneAt(cx, cy)
      if not z then break end
      local p = z:piece()
      if p then
        if p.owner == by and (p.type == "queen"
            or (diagonal and p.type == "bishop")
            or (not diagonal and p.type == "rook")) then
          return true
        end
        break
      end
      cx, cy = cx + d[1], cy + d[2]
    end
  end
  return false
end

function M.inCheck(game, player)
  local king = game:pieces("king", player)[1]
  if not king or not king.zone.x then return false end
  return M.attackedBy(game, king.zone, game:playerAfter(player))
end

function M.isPromotion(piece, to)
  if piece.type ~= "pawn" then return false end
  local last = piece.owner.id == "white" and 7 or 0
  return to.y == last
end

-- 캐슬링으로 갈 수 있는 칸
function M.castlingTargets(king, game)
  local out = {}
  if king.props.moved then return out end
  local me, opp = king.owner, game:playerAfter(king.owner)
  local board = game:board()
  local from = king.zone
  if M.attackedBy(game, from, opp) then return out end
  for _, side in ipairs({ { rookX = 7, step = 1 }, { rookX = 0, step = -1 } }) do
    local rook = pieceAt(board, side.rookX, from.y)
    if rook and rook.type == "rook" and rook.owner == me and not rook.props.moved then
      local clear = true
      local x = from.x + side.step
      while x ~= side.rookX do
        if pieceAt(board, x, from.y) then clear = false break end
        x = x + side.step
      end
      if clear then
        local pass = board:zoneAt(from.x + side.step, from.y)
        local dest = board:zoneAt(from.x + 2 * side.step, from.y)
        if not M.attackedBy(game, pass, opp) and not M.attackedBy(game, dest, opp) then
          out[#out + 1] = dest
        end
      end
    end
  end
  return out
end

function M.pawnTargets(pawn, game)
  local board = game:board()
  local from = pawn.zone
  local dir = M.forward(pawn.owner)
  local out = {}
  local one = board:zoneAt(from.x, from.y + dir)
  if one and one:isEmpty() then
    out[#out + 1] = one
    local startRank = pawn.owner.id == "white" and 1 or 6
    local two = board:zoneAt(from.x, from.y + 2 * dir)
    if from.y == startRank and two and two:isEmpty() then out[#out + 1] = two end
  end
  local last = game.vars.lastMove
  for _, dx in ipairs({ -1, 1 }) do
    local diag = board:zoneAt(from.x + dx, from.y + dir)
    if diag then
      local target = diag:piece()
      if target and target.owner ~= pawn.owner then
        out[#out + 1] = diag
      elseif not target and last and last.pawnDouble
          and last.to.x == from.x + dx and last.to.y == from.y then
        out[#out + 1] = diag -- 앙파상
      end
    end
  end
  return out
end

-- 실제로 둘 수 있는 수 (두고 나서 내 킹이 체크가 아닌 칸)
function M.legalMoves(game, piece)
  local me = piece.owner
  local out = {}
  for _, to in ipairs(game:moveCandidates(piece)) do
    local safe = game:simulate(function(g)
      M.applyMove(g, piece, to, M.isPromotion(piece, to) and "queen" or nil)
      return not M.inCheck(g, me)
    end)
    if safe then out[#out + 1] = to end
  end
  return out
end

function M.hasLegalMove(game, player)
  for _, p in ipairs(M.activePieces(player)) do
    if #M.legalMoves(game, p) > 0 then return true end
  end
  return false
end

function M.capture(game, target, by)
  game:move(target, game:zone("captured_" .. by.id))
end

-- 수 적용: 잡기, 앙파상, 캐슬링, 승격, 기록
function M.applyMove(game, piece, to, promoteType)
  local board = game:board()
  local from = piece.zone
  local me = piece.owner
  local isPawn = piece.type == "pawn"
  local target = to:piece()
  if isPawn and not target and from.x ~= to.x then
    target = board:zoneAt(to.x, from.y):piece() -- 앙파상으로 잡히는 폰
  end
  if target then M.capture(game, target, me) end

  if piece.type == "king" and math.abs(to.x - from.x) == 2 then
    local rookX = to.x > from.x and 7 or 0
    local rook = board:zoneAt(rookX, from.y):piece()
    game:move(rook, board:zoneAt((from.x + to.x) // 2, from.y))
    rook.props.moved = true
  end

  game:move(piece, to)
  piece.props.moved = true

  if promoteType then
    game:remove(piece)
    local promoted = game:create(promoteType, me, to)
    promoted.props.moved = true
  end

  game.vars.lastMove = { from = from, to = to, pawnDouble = isPawn and math.abs(to.y - from.y) == 2 }
  if isPawn or target then
    game.vars.halfmoves = 0
  else
    game.vars.halfmoves = (game.vars.halfmoves or 0) + 1
  end
end

return M
