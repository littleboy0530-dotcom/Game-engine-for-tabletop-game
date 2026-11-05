-- Phase: 방금 버린 패에 다른 사람들이 반응한다. 론 > 퐁 > 치, 하나만 받아들인다
local tiles = use("lib/tiles.lua")

local function meld(game, p, list)
  for _, t in ipairs(list) do game:move(t, p:zone("melds")) end
  p.vars.melds = p.vars.melds + 1
end

return {
  onEnter = function(game, discarder)
    local tile = discarder:zone("river"):top()
    local others, p = {}, discarder
    for _ = 1, #game:players() - 1 do
      p = game:playerAfter(p)
      others[#others + 1] = p
    end
    local nextPlayer = others[1]

    local picks = game:respond(others, function(q)
      local hand = q:zone("hand"):cards()
      local opts = {}
      local withTile = { tile }
      for _, t in ipairs(hand) do withTile[#withTile + 1] = t end
      if tiles.complete(withTile) then opts[#opts + 1] = { kind = "론", label = "론" } end
      if #tiles.same(hand, tile) >= 2 then opts[#opts + 1] = { kind = "퐁", label = "퐁 " .. tile.label } end
      if q == nextPlayer then
        for _, c in ipairs(tiles.chiOptions(hand, tile)) do
          opts[#opts + 1] = { kind = "치", label = "치 " .. c.label, ranks = c.ranks }
        end
      end
      return opts
    end, discarder.name .. "이(가) 버린 " .. tile.label .. "을(를) 가져갈까요?", { priority = { "론", "퐁", "치" }, accept = 1 })

    local pick = picks[1]
    if not pick then
      game:setCurrentPlayer(nextPlayer)
      return
    end
    local q, c = pick.player, pick.choice
    game:log(q.name .. ": " .. c.label)
    if c.kind == "론" then
      game:move(tile, q:zone("hand"))
      tiles.sort(game, q)
      game:win(q, "론 (" .. discarder.name .. "의 " .. tile.label .. ")")
      return
    end
    local hand = q:zone("hand"):cards()
    local used
    if c.kind == "퐁" then
      local same = tiles.same(hand, tile)
      used = { same[1], same[2] }
    else
      used = tiles.takeForChi(hand, tile, c.ranks)
    end
    meld(game, q, { used[1], tile, used[2] })
    game:setCurrentPlayer(q)
    game.vars.skipDraw = true
  end,

  next = function(game)
    if game:isOver() then return "result" end
    return "draw"
  end,
}
