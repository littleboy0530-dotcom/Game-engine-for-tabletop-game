-- 솔로 모드의 그림자 군주. 사람 대신 고른다 (판정 스크립트: 상태를 바꿀 수 없음)
-- 가장 센 카드는 가운데 평원, 다음은 왼쪽, 나머지 중 가장 약한 카드는 오른쪽
return {
  decide = function(game, player, request)
    local list = {}
    for _, c in ipairs(request.choices) do list[#list + 1] = c end
    table.sort(list, function(a, b) return a.value.props.power > b.value.props.power end)
    if request.prompt:find("가운데") then return list[1] end
    if request.prompt:find("왼쪽") then return list[2] or list[1] end
    return list[#list]
  end,
}
