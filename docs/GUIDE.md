# 게임 만들기 가이드 (1단계 기준)

게임 하나는 `games/` 아래의 폴더 하나예요. 폴더를 추가하면 화면의 게임 목록에 자동으로 나타나요.
예제: [`games/chess`](../games/chess), [`games/janggi`](../games/janggi)

```
games/my-game/
├── game.yaml          # 이름, 플레이어, 말 종류, 처음 배치
├── board.yaml         # 보드 그래프 (존과 간선)
├── loop.yaml          # 루프 그래프 (게임 진행)
├── loop/*.lua         # 루프 노드 스크립트
├── components/*.lua   # 말 종류별 스크립트
└── lib/*.lua          # 여러 스크립트가 같이 쓰는 함수 (use로 불러옴)
```

---

## 1. game.yaml

```yaml
name: 체스
players:
  - { id: white, name: 백, color: "#f4efe3" }
  - { id: black, name: 흑, color: "#2d2a26" }

pieceTypes:
  king: { label: { white: "♔", black: "♚" } }   # 플레이어별 표시
  guard: { label: "士", tags: [궁] }              # 모두 같은 표시

scripts:
  pieces: components/pieces.lua    # 말 종류별 이동 판정
  zones: components/zones.lua      # (선택) 존 태그별 진입 판정

setup:                             # 처음 배치
  - { type: king, owner: white, at: [4, 0] }
```

## 2. board.yaml: 보드 그래프

```yaml
id: board
coords: square        # square: 좌표가 있는 격자 / none: 좌표 없음
size: [9, 10]         # 가로, 세로
style: points         # cells: 칸에 놓기(체스) / points: 교차점에 놓기(장기)
adjacency: orthogonal # 격자 간선: orthogonal(상하좌우) / all(대각선 포함) / none
zoneDefaults:
  accepts: [piece]

edges:                # 간선 추가 (예: 장기 궁성의 대각선)
  - [[3, 0], [4, 1]]

tags:                 # 존에 태그 붙이기
  초궁성: [[3,0],[4,0],[5,0],[3,1],[4,1],[5,1],[3,2],[4,2],[5,2]]

names:                # (선택) 존 이름. 기본은 "x,y"
  columns: abcdefgh
  rows: ["1","2","3","4","5","6","7","8"]

zones:                # 격자 밖의 존 (잡은 말, 손패 등). 화면 옆 패널에 표시
  - { id: captured_white, name: 백이 잡은 말 }
```

- 좌표 `(0, 0)`은 왼쪽 아래예요. 첫 번째 플레이어가 아래쪽에 앉아요.
- 간선은 **"선으로 이어져 있다"**는 뜻이에요. `board:neighbors(zone)`이 간선을 따라 이웃을 돌려줘요.

## 3. loop.yaml: 루프 그래프

```yaml
nodes:
  start:  { type: start }
  turn:   { type: phase, label: 턴 시작 }
  move:   { type: action, label: 말 이동, script: loop/move.lua }
  resign: { type: action, label: 기권, script: loop/resign.lua }
  judge:  { type: phase, label: 승패 판정, script: loop/judge.lua }
  end:    { type: end }
edges:
  - [start, turn]
  - [turn, move]
  - [turn, resign]
  - [move, judge]
  - [resign, judge]
  - [judge, turn]
  - [judge, end]
```

| 노드 | 하는 일 |
|---|---|
| `start` | 시작. 나가는 연결이 하나 |
| `end` | 끝. 여기 닿으면 게임이 끝남 |
| `phase` | 들어오면 `onEnter` 실행. 연결이 여러 개면 `next`로 다음 노드를 고름 |
| `action` | 플레이어가 골라야만 들어감. `options`로 선택지를 만들고 `execute`로 실행 |
| `loop` | 하위 루프. `loop:`에 같은 형식의 nodes/edges를 넣거나 파일 경로를 적음 |

규칙
- 노드에서 Action으로 가는 연결이 있으면, 그 노드의 연결은 **모두 Action**이어야 해요. 그 노드에서 엔진은 멈추고 플레이어의 선택을 기다려요.
- `next`는 **연결된 노드 이름**만 돌려줄 수 있어요. 그림에 없는 이동은 일어나지 않아요.
- 입력 없이 노드 전환이 **32번 넘게** 이어지면 멈추고, 돌던 노드를 루프 그래프에 빨갛게 표시해요.
- 노드의 `pos: [x, y]`는 루프 그래프 화면에서의 위치예요.

---

## 4. 스크립트

모든 스크립트는 **테이블을 반환**해요.

```lua
-- loop/move.lua (Action 노드)
local chess = use("lib/chess.lua")      -- 공용 함수 불러오기

return {
  -- 판정: 고를 수 있는 것들. 말/존/글자/숫자/{label=...} 테이블
  options = function(game, player)
    return chess.activePieces(player)
  end,

  -- 실행: 고른 것을 받아서 상태를 바꿈
  execute = function(game, player, piece)
    local to = game:choose(player, chess.legalMoves(game, piece), "어디로 옮길까요?")
    game:move(piece, to)
  end,
}
```

```lua
-- loop/judge.lua (Phase 노드)
return {
  onEnter = function(game, player) game:nextPlayer() end,       -- 실행
  next = function(game, player)                                 -- 판정
    if game:isOver() then return "end" end
    return "turn"
  end,
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

```lua
-- components/zones.lua (존 태그별 판정, 선택)
return {
  ["물"] = {
    canAccept = function(zone, piece, game) return piece:hasTag("배") end,
  },
}
```

### 꼭 지켜야 할 것
1. **판정 함수**(`options`, `next`, `moveCandidates`, `canAccept`)는 상태를 바꿀 수 없어요. 바꾸려고 하면 오류가 나요.
2. **상태는 `game.vars`, `player.vars`, `piece.props`에만** 저장하세요. 전역 변수에 쓰면 오류가 나요.
3. `game:choose`를 부르면, 플레이어가 답할 때 **그 스크립트가 처음부터 다시 실행**돼요. 위 두 규칙을 지키면 신경 쓰지 않아도 결과가 정확해요.
4. 무작위는 `math.random` 대신 `game:roll()`을 쓰세요. 같은 시드면 같은 결과가 나와요.

---

## 5. API

### game
| 함수 | 설명 |
|---|---|
| `game:currentPlayer()` / `game:setCurrentPlayer(p)` | 현재 플레이어 |
| `game:nextPlayer()` | 다음 플레이어로 넘기고 그 플레이어를 돌려줌 |
| `game:playerAfter(p)` / `game:players()` / `game:player(id)` | 플레이어 조회 |
| `game:board(id?)` | 보드 (생략하면 첫 번째 보드) |
| `game:zone(id)` / `game:piece(id)` | id로 조회 |
| `game:pieces(type?, owner?)` | 말 목록 (존에 놓인 것만) |
| `game:create(type, owner, zone)` | 말 만들기 |
| `game:move(piece, zone)` / `game:remove(piece)` | 옮기기 / 없애기 |
| `game:choose(player, list, prompt)` | 플레이어에게 고르게 함 (실행 스크립트에서만) |
| `game:moveCandidates(piece)` | 말 스크립트 후보 ∩ 존이 받아주는 곳 |
| `game:canEnter(piece, zone)` | 존이 이 말을 받아주는가 |
| `game:simulate(function(g) ... end)` | 가상으로 실행하고 결과만 돌려줌. 실제 상태는 그대로 |
| `game:roll(sides)` | 주사위 (기본 6) |
| `game:win(player, reason)` / `game:draw(reason)` / `game:isOver()` | 승패 |
| `game:log(...)` / `print(...)` | 기록 패널에 쓰기 |
| `game.vars` | 공용 정보 |
| `use(path)` | 다른 Lua 파일 불러오기 |

### player
`id`, `name`, `index`, `color`, `vars`, `player:pieces(type?)`

### piece
`id`, `type`, `owner`, `zone`, `label`, `tags`, `props`, `piece:hasTag(tag)`

### zone
`id`, `name`, `x`, `y` (격자 밖이면 nil), `tags`, `board`, `zone:hasTag(tag)`, `zone:piece()` (맨 위 말), `zone:pieces()`, `zone:isEmpty()`, `zone:count()`

### board
`id`, `width`, `height`, `board:zoneAt(x, y)`, `board:neighbors(zone)`, `board:connected(a, b)`, `board:zones()`, `board:zonesWithTag(tag)`

---

## 6. 확인하는 방법

```bash
npm install
```
```bash
npm run dev
```
브라우저에서 게임을 고르고 플레이해요. 스크립트 오류가 나면 오른쪽 패널에 파일 이름과 줄 번호가 나와요.

테스트도 쓸 수 있어요. [`tests/chess.test.ts`](../tests/chess.test.ts)처럼 수를 두고 결과를 확인하면 돼요.
```bash
npm test
```
