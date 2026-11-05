-- Action: 주인 없는 땅에 서 있고 돈이 충분하면 살 수 있다
local estate = use("lib/estate.lua")

local function here(game, player) return estate.pawn(game, player).zone end

return {
  options = function(game, player)
    if player.vars.out then return {} end
    local zone = here(game, player)
    if not zone:hasTag("땅") or estate.owner(zone) then return {} end
    if player.vars.money < zone.props.price then return {} end
    return { { label = zone.name .. " 사기 (" .. zone.props.price .. ")" } }
  end,
  execute = function(game, player)
    local zone = here(game, player)
    player.vars.money = player.vars.money - zone.props.price
    game:create("flag", player, zone)
    game:log(player.name .. ": " .. zone.name .. " 구입")
    estate.refresh(game)
  end,
}
