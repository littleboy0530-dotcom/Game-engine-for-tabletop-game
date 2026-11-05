# 화면 조작만으로 게임 만들기 (끝에서 끝까지 확인)

파일을 직접 고치지 않고 편집기 화면만 조작해서 게임을 만들고 끝까지 플레이하는 스크립트예요.

- `make-tictactoe.cjs`: 빈 게임 → 틱택토 (말 종류, 격자 보드, 하는 일 설정, 노드 끌어서 연결, 규칙 고친 뒤 같은 수 다시 재생, 새로고침 후 저장 확인)
- `make-dice-race.cjs`: 빈 게임 → 주사위 경주 (트랙 보드, 주사위, 처음 배치)

Playwright가 필요해요.

```bash
npm run build
```
```bash
npx vite preview --port 4173
```
다른 터미널에서:
```bash
node e2e/make-tictactoe.cjs /tmp
```
