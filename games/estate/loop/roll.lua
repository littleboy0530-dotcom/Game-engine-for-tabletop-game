-- Action: 주사위 두 개를 굴리고 그만큼 이동
local estate = use("lib/estate.lua")

return {
  execute = function(game, player)
    local total = 0
    for _, die in ipairs(game:dice("d6")) do total = total + game:roll(die) end
    game:log(player.name .. ": 주사위 " .. total)
    estate.step(game, player, total)
  end,
}
