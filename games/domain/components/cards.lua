-- 액션 카드 효과. 카드에 붙어 있지만 loop/play_action.lua(규칙)가 호출할 때만 실행된다
local deck = use("lib/deck.lua")

return {
  square = {
    onPlay = function(game, player)
      deck.draw(game, player, 1)
      player.vars.actions = player.vars.actions + 2
    end,
  },
  merchant = {
    onPlay = function(game, player)
      deck.draw(game, player, 1)
      player.vars.actions = player.vars.actions + 1
      player.vars.coins = player.vars.coins + 1
    end,
  },
  cart = {
    onPlay = function(game, player)
      player.vars.buys = player.vars.buys + 1
      player.vars.coins = player.vars.coins + 2
    end,
  },
  scholar = {
    onPlay = function(game, player) deck.draw(game, player, 3) end,
  },
  sweeper = {
    onPlay = function(game, player)
      for i = 1, 4 do
        local choices = player:zone("hand"):cards()
        if #choices == 0 then return end
        choices[#choices + 1] = { label = "그만" }
        local pick = game:choose(player, choices, "폐기할 카드를 고르세요 (" .. (i - 1) .. "/4)")
        if pick.label == "그만" and not pick.kind then return end
        game:move(pick, game:zone("trash"))
      end
    end,
  },
  raider = {
    onPlay = function(game, player)
      deck.draw(game, player, 2)
      local other = game:playerAfter(player)
      while other ~= player do
        local hand = other:zone("hand")
        while hand:count() > 3 do
          local pick = game:choose(other, hand:cards(), other.name .. ": 약탈당했어요. 버릴 카드를 고르세요")
          game:move(pick, other:zone("discard"))
        end
        other = game:playerAfter(other)
      end
    end,
  },
}
