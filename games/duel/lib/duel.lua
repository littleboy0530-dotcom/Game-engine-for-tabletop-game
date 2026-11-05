-- 작은 결투 공용 규칙
local M = {}

M.START_LIFE = 15

function M.opponent(game, p) return game:playerAfter(p) end

function M.field(p) return p:zone("field"):cards() end

function M.creatures(p)
  local out = {}
  for _, c in ipairs(M.field(p)) do
    if c:hasTag("생물") then out[#out + 1] = c end
  end
  return out
end

function M.untappedLands(p)
  local out = {}
  for _, c in ipairs(M.field(p)) do
    if c:hasTag("땅") and c.rotation == 0 then out[#out + 1] = c end
  end
  return out
end

function M.mana(p) return #M.untappedLands(p) end

function M.updateMana(game)
  for _, p in ipairs(game:players()) do p.vars.mana = M.mana(p) end
end

-- 마나를 내기 위해 땅을 탭한다
function M.pay(game, p, cost)
  local lands = M.untappedLands(p)
  for i = 1, cost do game:setRotation(lands[i], 1) end
  M.updateMana(game)
end

function M.canCast(p, card) return (card.props.cost or 0) <= M.mana(p) end

function M.draw(game, p)
  local deck = p:zone("deck")
  if deck:isEmpty() then
    game:win(M.opponent(game, p), p.name .. "의 덱이 비었음")
    return
  end
  game:move(deck:top(), p:zone("hand"))
end

-- 피해: 받기 전에 "beforeDamage"로 물어서 대체 효과(줄이기)를 적용한다
function M.damage(game, target, amount, source)
  local e = game:before("beforeDamage", { target = target, amount = amount, source = source })
  if e.cancel or e.amount <= 0 then return end
  if target.kind == nil then
    -- 플레이어
    target.vars.life = target.vars.life - e.amount
    game:log(target.name .. ": 피해 " .. e.amount .. " (생명 " .. target.vars.life .. ")")
    if target.vars.life <= 0 then game:win(M.opponent(game, target), target.name .. "의 생명이 0") end
    return
  end
  target.props.damage = (target.props.damage or 0) + e.amount
  game:log(target.label .. ": 피해 " .. e.amount)
  if target.props.damage >= game:value(target, "toughness") then M.destroy(game, target) end
end

function M.destroy(game, creature)
  local owner = creature.owner
  creature.props.damage = 0
  -- 장착된 장비는 떨어진다
  for _, c in ipairs(M.field(owner)) do
    if c.props.attachedTo == creature then c.props.attachedTo = nil end
  end
  game:move(creature, owner:zone("grave"))
  game:log(creature.label .. " 쓰러짐")
end

return M
