-- 말 종류별 이동 후보 (판정 스크립트)
local janggi = use("lib/janggi.lua")

return {
  general  = { moveCandidates = janggi.palaceStep },
  guard    = { moveCandidates = janggi.palaceStep },
  chariot  = { moveCandidates = janggi.chariot },
  cannon   = { moveCandidates = janggi.cannon },
  horse    = { moveCandidates = function(piece, game) return janggi.leaper(piece, game, 1) end },
  elephant = { moveCandidates = function(piece, game) return janggi.leaper(piece, game, 2) end },
  soldier  = { moveCandidates = janggi.soldier },
}
