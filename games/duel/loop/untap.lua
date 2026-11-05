-- Phase: 내 카드를 모두 세우고(언탭), 생물의 피해와 소환 멀미를 지우고, 한 장 뽑는다
local duel = use("lib/duel.lua")

return {
  onEnter = function(game, player)
    for _, c in ipairs(duel.field(player)) do
      game:setRotation(c, 0)
      c.props.sick = nil
    end
    for _, p in ipairs(game:players()) do
      for _, c in ipairs(duel.creatures(p)) do c.props.damage = 0 end
    end
    game.vars.turnNo = (game.vars.turnNo or 0) + 1
    -- 처음 시작하는 사람은 첫 턴에 뽑지 않는다
    if game.vars.turnNo > 1 then duel.draw(game, player) end
    duel.updateMana(game)
  end,
}
