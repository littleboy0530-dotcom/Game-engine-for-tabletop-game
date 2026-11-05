# Game engine for tabletop game

아이디어만 있으면 누구나 보드게임 MVP를 빠르게 만들고 재미를 검증할 수 있는 웹 기반 보드게임 프로토타이핑 엔진.

- 보드는 **존의 그래프**, 게임 규칙은 **루프 그래프**로 그린다.
- 노드에 Lua 스크립트를 붙여 판정과 효과를 작성한다.

설계 문서: [docs/DESIGN.md](docs/DESIGN.md)

## 기술 검증

```bash
cd spike && npm install
node spike1.mjs   # 코루틴 방식의 한계 확인
node spike2.mjs   # 되돌림 + 다시 실행 방식, 기록 재생 결정성 확인
```
