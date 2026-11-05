-- Phase: 다음 사람을 정하고, 한 명만 남거나 라운드가 끝나면 게임 끝
local estate = use("lib/estate.lua")

return {
  onEnter = function(game, player)
    estate.refresh(game)
    local alive = {}
    for _, p in ipairs(game:players()) do if estate.alive(p) then alive[#alive + 1] = p end end
    if #alive == 1 then
      game:win(alive[1], "혼자 남음")
      return
    end
    -- 다음 살아 있는 사람. 1번 자리로 돌아오면 라운드 증가
    local nxt = player
    repeat
      nxt = game:playerAfter(nxt)
      if nxt.index == 1 then game.vars.round = game.vars.round + 1 end
    until estate.alive(nxt)
    if game.vars.round > estate.MAX_ROUNDS then
      table.sort(alive, function(a, b) return a.vars.assets > b.vars.assets end)
      if alive[1].vars.assets == alive[2].vars.assets then
        game:draw("재산 동점")
      else
        game:win(alive[1], estate.MAX_ROUNDS .. "라운드 후 재산 " .. alive[1].vars.assets)
      end
      return
    end
    game:setCurrentPlayer(nxt)
  end,
  next = function(game)
    if game:isOver() then return "end" end
    return "turn"
  end,
}
