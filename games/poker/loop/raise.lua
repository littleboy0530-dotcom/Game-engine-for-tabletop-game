-- Action: 베팅 / 레이즈. 금액은 고른다
local poker = use("lib/poker.lua")

local function amounts(game, player)
  local bet, chips = player.vars.bet, player.vars.chips
  local current, step = game.vars.currentBet, game.vars.minRaise
  local maxTo = bet + chips
  local list, seen = {}, {}
  local function add(to)
    if to > current and to <= maxTo and not seen[to] then
      seen[to] = true
      list[#list + 1] = to
    end
  end
  add(current + step)
  add(current + step * 2)
  add(current + (game.vars.pot + poker.toCall(game, player))) -- 팟 크기
  add(maxTo) -- 올인
  table.sort(list)
  return list, maxTo
end

return {
  options = function(game, player)
    if player.vars.chips <= poker.toCall(game, player) then return {} end
    -- 아무도 더 베팅할 수 없으면 레이즈할 의미가 없다
    local others = 0
    for _, p in ipairs(game:players()) do
      if p ~= player and poker.canAct(p) then others = others + 1 end
    end
    if others == 0 then return {} end
    return { { label = game.vars.currentBet == 0 and "베팅" or "레이즈" } }
  end,

  execute = function(game, player)
    local list, maxTo = amounts(game, player)
    local choices = {}
    for i, to in ipairs(list) do
      local label = "총 " .. to .. "까지"
      if to == maxTo then label = label .. " (올인)" end
      choices[i] = { label = label, to = to }
    end
    local pick = game:choose(player, choices, "얼마까지 올릴까요?")
    local raiseBy = pick.to - game.vars.currentBet
    poker.put(game, player, pick.to - player.vars.bet)
    if raiseBy >= game.vars.minRaise then game.vars.minRaise = raiseBy end
    game.vars.currentBet = pick.to
    for _, p in ipairs(game:players()) do p.vars.acted = false end
    player.vars.acted = true
    game:log(player.name .. ": " .. pick.to .. "까지 레이즈")
  end,
}
