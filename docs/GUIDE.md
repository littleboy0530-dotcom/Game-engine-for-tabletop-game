# 게임 만들기 가이드 (3단계 기준)

게임 하나는 `games/` 아래의 폴더 하나예요. 폴더를 추가하면 화면의 게임 목록에 자동으로 나타나요.

| 예제 | 보면 좋은 것 |
|---|---|
| [`games/chess`](../games/chess) | 격자 보드, 말 이동 판정, simulate로 체크 판정 |
| [`games/janggi`](../games/janggi) | 교차점 보드, 간선과 태그로 궁성 표현, 시작할 때 choose |
| [`games/poker`](../games/poker) | 카드 CSV, 손패 숨기기, 하위 루프 안의 하위 루프 |
| [`games/domain`](../games/domain) | 덱빌딩: 공급처 더미, 덱/손패/버림, 다른 플레이어에게 choose |
| [`games/estate`](../games/estate) | 트랙 보드, 주사위 컴포넌트, 공통 Action |
| [`games/racers`](../games/racers) | 능력 = 트리거: 레이서마다 `on = { rolled, passed, stopped }` |
| [`games/mahjong`](../games/mahjong) | 반응 창구 `game:respond`: 론 > 퐁 > 치 |
| [`games/starmarket`](../games/starmarket) | 규칙 리스너: 중앙 줄에서 카드가 빠지면 자동으로 채움 |
| [`games/lanes`](../games/lanes) | 뒷면으로 몰래 내기, 솔로 모드의 스크립트 플레이어 |

```
games/my-game/
├── game.yaml          # 이름, 플레이어, 컴포넌트 종류, 처음 배치, 화면에 보일 값
├── cards.csv          # (선택) 카드 목록
├── board.yaml         # 보드 그래프 (존과 간선)
├── loop.yaml          # 루프 그래프 (게임 진행)
├── loop/*.lua         # 루프 노드 스크립트
├── components/*.lua   # 컴포넌트 종류별 스크립트
└── lib/*.lua          # 여러 스크립트가 같이 쓰는 함수 (use로 불러옴)
```

---

## 1. game.yaml

```yaml
name: 작은 영지
players:
  - { id: a, name: 가온, color: "#2f6fb5" }
  - { id: b, name: 나린, color: "#b5562b", script: ai/bot.lua }   # script가 있으면 자동으로 고름

pieceTypes:                                       # 말
  king: { label: { white: "♔", black: "♚" } }     # 플레이어별 표시
  pawn: { label: "●", tags: [졸] }

cardTypes:                                        # 카드 (CSV로도 만들 수 있음)
  joker: { label: 조커, back: 트럼프, text: "아무 카드 대신", props: { cost: 0 } }

diceTypes:                                        # 주사위
  d6: {}                                          # 면을 안 적으면 1~6
  coin: { faces: [{ label: 앞, value: 1 }, { label: 뒤, value: 0 }] }

cards: cards.csv                                  # 카드 목록 파일

scripts:
  components: components/pieces.lua   # 컴포넌트 종류별 스크립트 (이동 판정, 트리거, 카드 효과)
  listeners: rules/refill.lua         # (선택) 규칙 리스너: 컴포넌트와 상관없는 트리거
  zones: components/zones.lua         # (선택) 존 태그별 진입 판정

setup:                             # 처음 배치
  - { type: king, owner: white, at: [4, 0] }          # 격자 좌표
  - { type: pawn, owner: p1, at: 0 }                  # 트랙 칸 번호
  - { type: d6, zone: dice, count: 2 }                # 존 이름, 여러 개
  - { type: copper, zone: deck, perPlayer: true, count: 7 }  # 플레이어마다

display:                           # 오른쪽 표에 보일 값
  player: { coins: 코인, points: 승점 }   # player.vars의 키: 이름
  game: { pot: 팟 }                       # game.vars의 키: 이름
```

- 컴포넌트의 `props`는 **기본값**이에요. 스크립트에서 `card.props.cost`를 읽으면 기본값이 나오고, `card.props.cost = 1`로 바꾸면 그 카드만 바뀌어요.
- `color` 값(예: `"#c0392b"`)을 props에 넣으면 카드 이름이 그 색으로 보여요.

### cards.csv
스프레드시트에서 만들어서 CSV로 저장하면 돼요. 첫 줄은 열 이름이에요.

```csv
id,label,text,tags,cost,coins,count,zone
copper,동전,코인 +1,보물,0,1,30,supply_copper
raider,약탈자,"카드 +2 / 다른 사람은 3장 남기고 버림",액션;공격,5,,10,supply_raider
```

| 열 | 뜻 |
|---|---|
| `id` | 카드 종류 이름 (필수) |
| `label`, `back`, `text` | 앞면 이름, 뒷면 글자, 설명 |
| `tags` | `;`로 구분한 태그 |
| `count`, `zone`, `perPlayer` | 처음에 몇 장을 어느 존에 놓을지 |
| 나머지 열 | 모두 `props`가 됨. 숫자는 숫자로 읽어요 |

## 2. board.yaml: 보드 그래프

```yaml
id: board
coords: square        # square: 격자 / track: 한 줄로 이어진 칸 / none: 좌표 없음
size: [9, 10]         # square만: 가로, 세로
style: points         # cells: 칸에 놓기(체스) / points: 교차점에 놓기(장기)
adjacency: orthogonal # square만: orthogonal(상하좌우) / all(대각선 포함) / none
zoneDefaults:
  accepts: [piece]    # 받을 수 있는 컴포넌트 종류 (piece, card, die)

edges:                # 간선 추가 (예: 장기 궁성의 대각선)
  - [[3, 0], [4, 1]]

tags:                 # 존에 태그 붙이기
  초궁성: [[3,0],[4,0],[5,0],[3,1],[4,1],[5,1],[3,2],[4,2],[5,2]]

zones:                # 격자 밖의 존. 화면에서 보드 아래 "매트"에 그려져요
  - { id: deck, name: 덱, perPlayer: true, layout: pile, visibility: hidden }
  - { id: hand, name: 손패, perPlayer: true, layout: row, visibility: owner }
  - { id: supply_copper, name: 동전, layout: pile, visibility: topOnly, group: 공급처 }
```

### 트랙 보드
```yaml
id: road
coords: track         # 칸이 순서대로 이어지고, 마지막 칸은 첫 칸과 이어져요 (closed: false로 끊기)
spaces:
  - { name: 출발 }
  - { name: 골목 시장, tags: [땅], props: { price: 20, rent: 4, group: 갈색 } }
```
- 화면에서는 네모난 고리 모양으로 그려져요. 0번 칸이 오른쪽 아래예요.
- `props.group`이나 `props.color`가 있으면 칸 위에 색 띠가 보여요.
- 스크립트에서는 `board:zoneAt(i, 0)`, `zone.x`(칸 번호), `zone.props.price`로 써요.

### 존의 속성
| 속성 | 값 |
|---|---|
| `layout` | `row`(펼쳐 놓기, 기본) / `pile`(더미: 맨 위 하나만 보임) / `free` |
| `visibility` | `public`(모두, 기본) / `owner`(주인만) / `hidden`(아무도) / `topOnly`(맨 위만) |
| `perPlayer` | `true`면 플레이어마다 하나씩 만들어져요. 스크립트에서 `player:zone("hand")` |
| `group` | 화면에서 같이 묶어 보여줄 이름 |
| `props` | 존의 고정 값 |

- 좌표 `(0, 0)`은 왼쪽 아래예요. 첫 번째 플레이어가 아래쪽에 앉아요.
- 간선은 **"이어져 있다"**는 뜻이에요. `board:neighbors(zone)`이 간선을 따라 이웃을 돌려줘요.
- `owner` 존이 하나라도 있으면, 화면은 차례가 바뀔 때마다 가림막을 띄워서 **화면을 넘겨주게** 해요.

## 3. loop.yaml: 루프 그래프

```yaml
nodes:
  start:  { type: start }
  ready:  { type: phase, label: 턴 시작 }
  roll:   { type: action, label: 주사위 굴리기, script: loop/roll.lua }
  sell:   { type: action, label: 땅 팔기, script: loop/sell.lua, common: true }
  buy:    { type: action, label: 사기, script: loop/buy.lua, limit: { count: 1, per: turn } }
  ...
edges:
  - [start, ready]
  - [ready, roll]
```

| 노드 | 하는 일 |
|---|---|
| `start` | 시작. 나가는 연결이 하나 |
| `end` | 끝. 가장 바깥 루프의 end에 닿으면 게임이 끝나고, 하위 루프의 end면 바깥으로 돌아가요 |
| `phase` | 들어오면 `onEnter` 실행. 연결이 여러 개면 `next`로 다음 노드를 고름 |
| `action` | 플레이어가 골라야만 들어감. `options`로 선택지를 만들고 `execute`로 실행 |
| `loop` | 하위 루프. `loop:`에 같은 형식의 nodes/edges를 넣거나 파일 경로를 적음 |

Action 노드 옵션
| 옵션 | 뜻 |
|---|---|
| `common: true` | **공통 Action**. 연결을 그리지 않아요. 이 노드가 들어 있는 루프 안이라면 플레이어가 기다리는 어디서든 쓸 수 있고, 쓰고 나면 원래 자리로 돌아와요 |
| `limit: { count: 1, per: turn }` | `turn` 노드에 들어갈 때마다 1번까지만 쓸 수 있어요 |

Phase 노드 옵션
| 옵션 | 뜻 |
|---|---|
| `exclude: [sell]` | 이 노드에서 기다릴 때는 그 공통 Action을 보여주지 않아요 |

규칙
- 노드에서 Action으로 가는 연결이 있으면, 그 노드의 연결은 **모두 Action**이어야 해요. 그 노드에서 엔진은 멈추고 플레이어의 선택을 기다려요.
- `next`는 **연결된 노드 이름**만 돌려줄 수 있어요. 그림에 없는 이동은 일어나지 않아요.
- 입력 없이 노드 전환이 **32번 넘게** 이어지면 멈추고, 돌던 노드를 루프 그래프에 빨갛게 표시해요.
- 노드의 `pos: [x, y]`는 루프 그래프 화면에서의 위치예요.
- 화면의 루프 그래프는 지금 위치가 있는 하위 루프를 자동으로 보여줘요. 위쪽 경로(전체 › 턴)를 눌러 다른 단계를 볼 수 있어요.

---

## 4. 스크립트

모든 스크립트는 **테이블을 반환**해요.

```lua
-- loop/play_action.lua (Action 노드)
local effects = use("components/cards.lua")      -- 공용 파일 불러오기

return {
  -- 판정: 고를 수 있는 것들. 컴포넌트/존/글자/숫자/{label=...} 테이블
  --       빈 목록을 돌려주면 이 Action은 지금 보이지 않아요
  --       options가 없으면 버튼 하나짜리 Action이 돼요
  options = function(game, player)
    local out = {}
    for _, c in ipairs(player:zone("hand"):cards()) do
      if c:hasTag("액션") then out[#out + 1] = c end
    end
    return out
  end,

  -- 실행: 고른 것을 받아서 상태를 바꿈
  execute = function(game, player, card)
    game:move(card, player:zone("play"))
    effects[card.type].onPlay(game, player, card)   -- 카드 효과는 규칙이 불러요
  end,
}
```

```lua
-- loop/next.lua (Phase 노드)
return {
  onEnter = function(game, player) game:nextPlayer() end,       -- 실행
  next = function(game, player)                                 -- 판정
    if game:isOver() then return "end" end
    return "turn"
  end,
}
```

```lua
-- components/cards.lua: 카드 효과 (규칙 스크립트가 불러서 실행)
return {
  raider = {
    onPlay = function(game, player)
      local other = game:playerAfter(player)
      -- 다른 플레이어에게도 고르게 할 수 있어요. 화면은 그 사람에게 넘겨져요
      local pick = game:choose(other, other:zone("hand"):cards(), "버릴 카드를 고르세요")
      game:move(pick, other:zone("discard"))
    end,
  },
}
```

```lua
-- components/pieces.lua (말 종류별 판정)
return {
  rook = {
    moveCandidates = function(piece, game)
      -- 갈 수 있는 존 목록. 존의 canAccept를 통과한 것만 최종 후보가 됨
      return { ... }
    end,
  },
}
```

### 꼭 지켜야 할 것
1. **판정 함수**(`options`, `next`, `moveCandidates`, `canAccept`)는 상태를 바꿀 수 없어요. 바꾸려고 하면 오류가 나요.
2. **상태는 `game.vars`, `player.vars`, `piece.props`에만** 저장하세요. 전역 변수에 쓰면 오류가 나요.
3. `game:choose`를 부르면, 플레이어가 답할 때 **그 스크립트가 처음부터 다시 실행**돼요. 위 두 규칙을 지키면 신경 쓰지 않아도 결과가 정확해요. 기다리는 동안 화면에는 그때까지 바뀐 모습이 보여요.
4. 무작위는 `math.random` 대신 `game:roll()`, `game:shuffle()`을 쓰세요. 같은 시드면 같은 결과가 나와요.
5. `vars`에 넣은 테이블은 **복사본**이에요. `game.vars.list[1] = x`는 저장되지 않으니 테이블을 고친 뒤 `game.vars.list = list`로 다시 넣으세요.
6. `pairs`로 테이블을 돌면 **순서가 매번 달라질 수 있어요.** 순서가 결과에 영향을 주면 `ipairs`를 쓰거나 키를 정렬하세요. 그래야 같은 시드로 같은 게임이 다시 나와요.

## 5. 이벤트와 트리거

"무슨 일이 일어나면 ~한다"는 능력은 **트리거**로 만들어요.

```lua
-- components/racers.lua: 컴포넌트 종류별 트리거. self는 그 컴포넌트
return {
  hedgehog = { on = {
    passed = function(self, game, e)               -- 누가 지나갈 때
      if e.passed == self then race.move(game, e.mover, -1) end
    end,
  } },
}
```

```lua
-- rules/refill.lua: 규칙 리스너 (game.yaml의 scripts.listeners)
return { on = {
  moved = function(game, e)
    if e.from and e.from.id == "center" then refill(game) end
  end,
} }
```

| 함수 | 뜻 |
|---|---|
| `game:emit(이름, 정보)` | 일어난 일을 알려요. 듣고 있는 트리거가 **먼저 일어난 순서대로** 실행돼요 |
| `game:before(이름, 정보)` | 일어나기 **전에** 물어요. 트리거가 바로 실행되고, 정보의 값을 바꾸거나 `e.cancel = true`로 막을 수 있어요. 바뀐 정보를 돌려줘요 |
| `game:chain(function() ... end)` | 안에서 일어난 트리거를 모았다가 **나중 것부터** 처리해요 (TCG의 체인) |

엔진이 직접 내는 이벤트
| 이벤트 | 정보 |
|---|---|
| `moved` | `component`, `from`(옮기기 전 존, 없으면 nil), `to` |
| `rolled` | `die`, `value`, `player`. 트리거가 `e.value`를 바꾸면 그 값이 `game:roll`의 결과가 돼요 |

규칙
- 트리거 순서: 규칙 리스너 → 현재 플레이어의 컴포넌트 → 턴 순서대로 다른 플레이어 → 주인 없는 컴포넌트.
- 트리거가 또 트리거를 일으키며 **32번을 넘으면** 멈추고, 마지막 트리거 이름들을 보여줘요.
- 트리거 안에서도 `game:choose`를 쓸 수 있어요.

## 6. 여러 사람에게 묻기

```lua
-- 마작: 버린 패를 가져갈지 다른 세 사람에게 묻는다
local picks = game:respond(others, function(p)
  return { { kind = "론", label = "론" }, { kind = "퐁", label = "퐁 5만" } }
end, "가져갈까요?", { priority = { "론", "퐁", "치" }, accept = 1 })
local pick = picks[1]   -- { player = ..., choice = ... } 또는 nil
```
- 선택지가 있는 사람에게만 차례로 물어요. 앞사람의 선택은 다음 사람에게 보이지 않아요.
- `패스`가 자동으로 붙어요 (`pass = false`로 끌 수 있어요).
- `priority`는 선택지의 `kind`(없으면 `label`)로 비교해요. 같으면 먼저 물어본 사람이 앞이에요.
- 서로 모르게 동시에 내는 단계는 각자 `game:choose`로 고르고 카드를 **뒷면(`game:flip(c, "down")`)**으로 놓은 뒤, 공개 단계에서 뒤집으면 돼요 ([`games/lanes`](../games/lanes)).

## 7. 스크립트 플레이어 (솔로 모드)

```lua
-- ai/shadow.lua
return {
  decide = function(game, player, request)
    -- request.kind: "action" 또는 "choose", request.prompt: 질문
    -- request.choices: { label, value, action } 목록. 하나를 돌려주면 돼요
    return request.choices[1]
  end,
}
```
- `game.yaml`의 플레이어에 `script:`를 적으면 그 플레이어 차례는 자동으로 진행돼요.
- `decide`는 판정 함수라 상태를 바꿀 수 없어요. 오토마 카드 뒤집기 같은 일은 규칙 스크립트에서 하세요.
- 되돌리기는 사람의 마지막 선택까지 돌아가요.

---

## 8. API

### game
| 함수 | 설명 |
|---|---|
| `game:currentPlayer()` / `game:setCurrentPlayer(p)` | 현재 플레이어 |
| `game:nextPlayer()` | 다음 플레이어로 넘기고 그 플레이어를 돌려줌 |
| `game:playerAfter(p)` / `game:players()` / `game:player(id)` | 플레이어 조회 |
| `game:board(id?)` | 보드 (생략하면 첫 번째 보드) |
| `game:zone(id)` / `game:zone(name, player)` | 존 (플레이어별 존은 플레이어와 함께) |
| `game:pieces(type?, owner?)` / `game:cards(...)` / `game:dice(...)` / `game:components(...)` | 존에 놓인 컴포넌트 목록 |
| `game:create(type, owner, zone)` | 컴포넌트 만들기 |
| `game:move(c, zone, "top" or "bottom")` / `game:remove(c)` | 옮기기(기본은 맨 위) / 없애기 |
| `game:shuffle(zone)` | 존 안의 순서 섞기 |
| `game:flip(c, "up" or "down")` | 뒤집기 (생략하면 반대로) |
| `game:roll(6)` / `game:roll(die)` | 1~6 숫자 / 주사위를 굴리고 나온 면의 값 (`rolled` 트리거가 바꿀 수 있음) |
| `game:emit` / `game:before` / `game:chain` | 이벤트와 트리거 (5장) |
| `game:respond(players, fn, prompt, opts)` | 여러 사람에게 묻기 (6장) |
| `game:script(c)` | 컴포넌트 종류 스크립트의 테이블 (예: `game:script(card).onPlay(...)`) |
| `game:choose(player, list, prompt)` | 플레이어에게 고르게 함 (실행 스크립트에서만) |
| `game:moveCandidates(piece)` | 말 스크립트 후보 ∩ 존이 받아주는 곳 |
| `game:canEnter(piece, zone)` | 존이 이 말을 받아주는가 |
| `game:simulate(function(g) ... end)` | 가상으로 실행하고 결과만 돌려줌. 실제 상태는 그대로 |
| `game:win(player, reason)` / `game:draw(reason)` / `game:isOver()` | 승패 |
| `game:log(...)` / `print(...)` | 기록 패널에 쓰기 |
| `game.vars` | 공용 정보 |
| `use(path)` | 다른 Lua 파일 불러오기 |

### player
`id`, `name`, `index`, `color`, `vars`, `player:zone(name)`, `player:pieces(type?)`, `player:cards(type?)`

### 컴포넌트 (말, 카드, 주사위)
`id`, `type`, `kind`(`piece`/`card`/`die`), `owner`, `zone`, `label`, `text`, `tags`, `props`, `face`(`up`/`down`), `value`(주사위 면의 값), `c:hasTag(tag)`

### zone
`id`, `name`, `x`, `y` (격자 밖이면 nil), `tags`, `props`, `owner`, `layout`, `visibility`, `board`,
`zone:hasTag(tag)`, `zone:top()`, `zone:bottom()`, `zone:cards()` / `zone:components()`, `zone:isEmpty()`, `zone:count()`

### board
`id`, `width`, `height`, `board:zoneAt(x, y)`, `board:neighbors(zone)`, `board:connected(a, b)`, `board:zones()`, `board:zonesWithTag(tag)`

---

## 9. 확인하는 방법

```bash
npm install
```
```bash
npm run dev
```
브라우저에서 게임을 고르고 플레이해요. 스크립트 오류가 나면 오른쪽 패널에 파일 이름과 줄 번호가 나와요.

테스트도 쓸 수 있어요. [`tests/estate.test.ts`](../tests/estate.test.ts)처럼 주사위 스크립트를 정해진 값으로 바꿔 끼우면 원하는 상황을 바로 만들 수 있어요.
```bash
npm test
```
