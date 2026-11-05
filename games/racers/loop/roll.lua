-- Action: 주사위를 굴리고 그만큼 이동 (능력이 굴린 값을 바꿀 수 있다)
local race = use("lib/race.lua")

return {
  execute = function(game, player)
    local value = game:roll(game:dice("d6")[1])
    local racer = race.racer(game, player)
    game:log(player.name .. ": " .. value .. " 이동")
    race.move(game, racer, value)
    for _, p in ipairs(game:players()) do p.vars.position = race.position(race.racer(game, p)) end
  end,
}
