-- Phase: 덱을 섞어 피라미드 칸마다 한 장씩. 뒷면 줄은 뒤집어 둔다
return {
  onEnter = function(game)
    local deck = game:zone("deck")
    game:shuffle(deck)
    for _, z in ipairs(game:board():zonesWithTag("칸")) do
      local c = deck:top()
      game:move(c, z)
      if z:hasTag("뒷면") then game:flip(c, "down") end
    end
    for _, p in ipairs(game:players()) do
      p.vars.coins = 3
      p.vars.points = 0
      p.vars.symbols = 0
    end
  end,
}
