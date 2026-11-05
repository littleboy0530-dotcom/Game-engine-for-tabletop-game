-- Phase: 끝나면 모두의 손패를 공개한다
return {
  onEnter = function(game)
    for _, p in ipairs(game:players()) do
      for _, t in ipairs(p:zone("hand"):cards()) do game:move(t, p:zone("melds")) end
    end
  end,
}
