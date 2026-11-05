-- 카드 능력
--   modify  = 지속 효과: game:value(대상, 키)를 계산할 때 적용된다
--   on      = 트리거와 대체 효과 (beforeDamage는 피해를 받기 전에 묻는 사전 이벤트)
--   target  = 순간 주문이 고를 대상 목록,  resolve = 순간 주문의 효과
local duel = use("lib/duel.lua")

local function onField(c) return c.zone and c.zone.id == "field@" .. c.owner.id end

return {
  tortoise = { on = {
    beforeDamage = function(self, game, e)
      if e.target == self and e.amount > 0 then
        e.amount = e.amount - 1
        game:log("가시 거북: 피해 1 줄임")
      end
    end,
  } },

  bannerman = { modify = {
    power = function(self, target, value, game)
      if onField(self) and target ~= self and target.owner == self.owner and target:hasTag("생물") and onField(target) then
        return value + 1
      end
      return value
    end,
  } },

  sword = { modify = {
    power = function(self, target, value, game)
      if onField(self) and self.props.attachedTo == target then return value + 2 end
      return value
    end,
  } },

  ambush = {
    target = function(game, player)
      local out = {}
      for _, p in ipairs(game:players()) do
        for _, c in ipairs(duel.creatures(p)) do out[#out + 1] = c end
      end
      return out
    end,
    resolve = function(game, player, target)
      if target.zone and target.zone.id:sub(1, 6) == "field@" then
        game:boost(target, "power", 2, "turn")
        game:log("기습: " .. target.label .. " 공격력 +2")
      end
    end,
  },

  arrow = {
    target = function(game, player)
      local out = { duel.opponent(game, player) }
      for _, p in ipairs(game:players()) do
        for _, c in ipairs(duel.creatures(p)) do out[#out + 1] = c end
      end
      return out
    end,
    resolve = function(game, player, target)
      if target.kind == nil or (target.zone and target.zone.id:sub(1, 6) == "field@") then
        duel.damage(game, target, 2, nil)
      end
    end,
  },
}
