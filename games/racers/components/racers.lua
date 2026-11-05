-- 레이서 능력 = 트리거. self는 이 레이서, e는 이벤트 정보
local race = use("lib/race.lua")

local function mine(self, e) return e.player == self.owner end

return {
  turtle = { on = {
    rolled = function(self, game, e)
      if mine(self, e) and e.value <= 2 then
        e.value = e.value + 2
        game:log("🐢 거북: +2 (" .. e.value .. ")")
      end
    end,
  } },

  rabbit = { on = {
    passed = function(self, game, e)
      if e.mover == self then
        game:log("🐇 토끼: 지나가서 1칸 더")
        race.move(game, self, 1)
      end
    end,
  } },

  hedgehog = { on = {
    passed = function(self, game, e)
      if e.passed == self then
        game:log("🦔 고슴도치: " .. e.mover.label .. " 1칸 뒤로")
        race.move(game, e.mover, -1)
      end
    end,
  } },

  frog = { on = {
    rolled = function(self, game, e)
      if mine(self, e) and e.value == 6 then game.vars.frogLeap = true end
    end,
    stopped = function(self, game, e)
      if e.racer == self and game.vars.frogLeap then
        game.vars.frogLeap = false
        game:log("🐸 개구리: 2칸 더 점프")
        race.move(game, self, 2)
      end
    end,
  } },

  fox = { on = {
    rolled = function(self, game, e)
      if not mine(self, e) and e.value == 6 then
        game:log("🦊 여우: 누가 6을 굴려서 1칸 앞으로")
        race.move(game, self, 1)
      end
    end,
  } },

  squirrel = { on = {
    stopped = function(self, game, e)
      if e.racer == self and #self.zone:components() > 1 and self.zone.x < race.finish(game) then
        game:log("🐿 다람쥐: 같은 칸이라 1칸 더")
        race.move(game, self, 1)
      end
    end,
  } },
}
