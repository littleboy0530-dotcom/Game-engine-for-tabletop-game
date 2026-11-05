// Recipes: what a node does, picked from a list and filled in like a form.
// Each recipe writes a complete Lua script. The first line keeps the recipe and its
// values (--@recipe {...}) so the editor can show the form again later.

export type ParamKind = 'number' | 'text' | 'pieceType' | 'cardType' | 'dieType' | 'zone' | 'node';

export interface Param {
  key: string;
  label: string;
  kind: ParamKind;
  default?: string | number;
}

export interface ZoneInfo {
  id: string;
  name: string;
  perPlayer: boolean;
}

export interface RecipeContext {
  zones: ZoneInfo[];
}

export interface Recipe {
  id: string;
  label: string;
  help: string;
  params: Param[];
}

export interface ActionRecipe extends Recipe {
  code: (v: Record<string, string>, ctx: RecipeContext) => { options: string; execute: string };
}

export interface StepRecipe extends Recipe {
  code: (v: Record<string, string>, ctx: RecipeContext) => string;
}

export interface ActionConfig {
  kind: 'action';
  id: string;
  values: Record<string, string>;
}

export interface PhaseConfig {
  kind: 'phase';
  steps: { id: string; values: Record<string, string> }[];
  /** For nodes with several exits: where to go when the game is over, and otherwise. */
  whenOver?: string;
  otherwise?: string;
}

export type RecipeConfig = ActionConfig | PhaseConfig;

const q = (s: string) => JSON.stringify(s ?? '');
const num = (s: string | undefined, d: number) => (Number.isFinite(Number(s)) && s !== '' ? Number(s) : d);

/** Lua expression for a zone: per-player zones are looked up for `who`. */
function zoneExpr(name: string, ctx: RecipeContext, who = 'player') {
  const z = ctx.zones.find((x) => x.id === name);
  return z?.perPlayer ? `${who}:zone(${q(name)})` : `game:zone(${q(name)})`;
}

export const ACTION_RECIPES: ActionRecipe[] = [
  {
    id: 'pass',
    label: '아무것도 안 하고 넘어가기',
    help: '버튼 하나로 다음 노드로 넘어가요. 예: 턴 끝, 넘기기',
    params: [],
    code: () => ({ options: '', execute: '    -- 아무것도 하지 않아요\n' }),
  },
  {
    id: 'placeOwnPiece',
    label: '빈 칸에 내 말 놓기',
    help: '보드의 빈 칸 중 하나를 골라 내 말을 새로 놓아요. 틱택토, 오목 같은 게임',
    params: [{ key: 'type', label: '놓을 말 종류', kind: 'pieceType' }],
    code: (v) => ({
      options: `    local out = {}
    for _, z in ipairs(game:board():zones()) do
      if z.x and z:isEmpty() then out[#out + 1] = z end
    end
    return out
`,
      execute: `    game:create(${q(v.type!)}, player, choice)
    game.vars.last = choice
`,
    }),
  },
  {
    id: 'moveToNeighbor',
    label: '내 말을 이웃 칸으로 옮기기',
    help: '내 말 하나를 골라, 선으로 이어진 이웃 칸으로 옮겨요. 상대 말이 있으면 잡을지 정할 수 있어요',
    params: [{ key: 'capture', label: '상대 말을 잡을 수 있나요? (예/아니요)', kind: 'text', default: '예' }],
    code: (v) => {
      const capture = v.capture !== '아니요';
      return {
        options: `    local out = {}
    for _, p in ipairs(player:pieces()) do
      for _, z in ipairs(game:board():neighbors(p.zone)) do
        local other = z:top()
        if not other${capture ? ' or other.owner ~= player' : ''} then out[#out + 1] = p break end
      end
    end
    return out
`,
        execute: `    local targets = {}
    for _, z in ipairs(game:board():neighbors(choice.zone)) do
      local other = z:top()
      if not other${capture ? ' or other.owner ~= player' : ''} then targets[#targets + 1] = z end
    end
    local to = game:choose(player, targets, "어디로 옮길까요?")
    local other = to:top()
    if other then game:remove(other) end
    game:move(choice, to)
    game.vars.last = to
`,
      };
    },
  },
  {
    id: 'rollAndMove',
    label: '주사위 굴려서 앞으로 가기',
    help: '주사위를 굴려 나온 수만큼 트랙에서 내 말을 앞으로 옮겨요. 끝 칸을 넘지 않아요',
    params: [
      { key: 'die', label: '굴릴 주사위', kind: 'dieType' },
      { key: 'piece', label: '움직일 내 말 종류', kind: 'pieceType' },
    ],
    code: (v) => ({
      options: '',
      execute: `    local value = game:roll(game:dice(${q(v.die!)})[1])
    local pawn = game:pieces(${q(v.piece!)}, player)[1]
    local board = game:board()
    local x = math.min(pawn.zone.x + value, board.width - 1)
    game:move(pawn, board:zoneAt(x, 0))
    game:log(player.name .. ": 주사위 " .. value)
`,
    }),
  },
  {
    id: 'drawCards',
    label: '카드 가져오기',
    help: '한 존의 맨 위 카드를 N장 다른 존으로 옮겨요. 예: 덱에서 손패로',
    params: [
      { key: 'from', label: '어디서', kind: 'zone' },
      { key: 'to', label: '어디로', kind: 'zone' },
      { key: 'n', label: '몇 장', kind: 'number', default: 1 },
    ],
    code: (v, ctx) => ({
      options: '',
      execute: `    for _ = 1, ${num(v.n, 1)} do
      local card = ${zoneExpr(v.from!, ctx)}:top()
      if card then game:move(card, ${zoneExpr(v.to!, ctx)}) end
    end
`,
    }),
  },
  {
    id: 'playCard',
    label: '카드 한 장 내기',
    help: '한 존(예: 손패)의 카드 중 하나를 골라 다른 존으로 옮겨요. 카드의 값을 점수에 더할 수 있어요',
    params: [
      { key: 'from', label: '어디서 (예: 손패)', kind: 'zone' },
      { key: 'to', label: '어디로', kind: 'zone' },
      { key: 'points', label: '점수에 더할 카드 값 이름 (없으면 비워 두기)', kind: 'text', default: '' },
    ],
    code: (v, ctx) => ({
      options: `    return ${zoneExpr(v.from!, ctx)}:cards()
`,
      execute: `    game:move(choice, ${zoneExpr(v.to!, ctx)})
${v.points ? `    player.vars.score = (player.vars.score or 0) + (choice.props[${q(v.points)}] or 0)\n` : ''}    game:log(player.name .. ": " .. choice.label)
`,
    }),
  },
  {
    id: 'addScore',
    label: '점수 얻기',
    help: '버튼을 누르면 내 점수가 오르고 넘어가요',
    params: [{ key: 'n', label: '얼마나', kind: 'number', default: 1 }],
    code: (v) => ({ options: '', execute: `    player.vars.score = (player.vars.score or 0) + ${num(v.n, 1)}\n` }),
  },
];

export const STEP_RECIPES: StepRecipe[] = [
  {
    id: 'resetScores',
    label: '모두의 점수를 0으로',
    help: '게임을 시작할 때 쓰세요',
    params: [],
    code: () => `  for _, p in ipairs(game:players()) do p.vars.score = 0 end\n`,
  },
  {
    id: 'shuffle',
    label: '존 섞기',
    help: '예: 덱 섞기. 플레이어별 존이면 모두의 것을 섞어요',
    params: [{ key: 'zone', label: '섞을 존', kind: 'zone' }],
    code: (v, ctx) => {
      const z = ctx.zones.find((x) => x.id === v.zone);
      return z?.perPlayer
        ? `  for _, p in ipairs(game:players()) do game:shuffle(p:zone(${q(v.zone!)})) end\n`
        : `  game:shuffle(game:zone(${q(v.zone!)}))\n`;
    },
  },
  {
    id: 'deal',
    label: '모두에게 N장씩 나눠주기',
    help: '한 존의 맨 위 카드를 각 플레이어의 존으로 N장씩 옮겨요',
    params: [
      { key: 'from', label: '어디서', kind: 'zone' },
      { key: 'to', label: '누구의 어디로 (플레이어별 존)', kind: 'zone' },
      { key: 'n', label: '몇 장씩', kind: 'number', default: 5 },
    ],
    code: (v, ctx) => `  for _, p in ipairs(game:players()) do
    for _ = 1, ${num(v.n, 5)} do
      local card = ${zoneExpr(v.from!, ctx, 'p')}:top()
      if card then game:move(card, ${zoneExpr(v.to!, ctx, 'p')}) end
    end
  end
`,
  },
  {
    id: 'lineWin',
    label: '한 줄로 N개면 승리',
    help: '방금 놓은 칸을 지나는 가로/세로/대각선에 내 말이 N개 이어지면 이겨요',
    params: [{ key: 'n', label: '몇 개', kind: 'number', default: 3 }],
    code: (v) => `  local last = game.vars.last
  if last and game:board():line(last, ${num(v.n, 3)}, function(z)
    local top = z:top()
    return top ~= nil and top.owner == player
  end) then
    game:win(player, "한 줄로 ${num(v.n, 3)}개")
  end
`,
  },
  {
    id: 'fullDraw',
    label: '칸이 다 차면 무승부',
    help: '아직 승부가 안 났는데 보드에 빈 칸이 없으면 무승부예요',
    params: [],
    code: () => `  if not game:isOver() and game:board():isFull() then game:draw("빈 칸이 없음") end\n`,
  },
  {
    id: 'reachEnd',
    label: '트랙 끝에 닿으면 승리',
    help: '현재 플레이어의 말이 트랙 마지막 칸에 있으면 이겨요',
    params: [{ key: 'piece', label: '말 종류', kind: 'pieceType' }],
    code: (v) => `  local pawn = game:pieces(${q(v.piece!)}, player)[1]
  if pawn and pawn.zone.x == game:board().width - 1 then game:win(player, "결승 도착") end
`,
  },
  {
    id: 'scoreWin',
    label: '점수가 N 이상이면 승리',
    help: '현재 플레이어의 점수(player.vars.score)를 확인해요',
    params: [{ key: 'n', label: '목표 점수', kind: 'number', default: 10 }],
    code: (v) => `  if (player.vars.score or 0) >= ${num(v.n, 10)} then game:win(player, "${num(v.n, 10)}점 달성") end\n`,
  },
  {
    id: 'emptyEnd',
    label: '존이 비면 끝 (점수가 높은 사람 승리)',
    help: '예: 덱이 다 떨어지면 끝. 플레이어별 존이면 현재 플레이어의 것을 봐요',
    params: [{ key: 'zone', label: '확인할 존', kind: 'zone' }],
    code: (v, ctx) => `  if not game:isOver() and ${zoneExpr(v.zone!, ctx)}:isEmpty() then
    local best, winner, tie = -1, nil, false
    for _, p in ipairs(game:players()) do
      local s = p.vars.score or 0
      if s > best then best, winner, tie = s, p, false elseif s == best then tie = true end
    end
    if tie then game:draw("점수 동점") else game:win(winner, "점수 " .. best) end
  end
`,
  },
  {
    id: 'nextPlayer',
    label: '다음 플레이어로',
    help: '차례를 다음 사람에게 넘겨요',
    params: [],
    code: () => `  game:nextPlayer()\n`,
  },
];

const HEADER = '--@recipe ';

function header(config: RecipeConfig) {
  return `${HEADER}${JSON.stringify(config)}\n-- 이 파일은 편집기의 '하는 일' 설정으로 만들어졌어요. 직접 고치면 설정 화면 대신 코드로 관리돼요.\n`;
}

export function actionScript(config: ActionConfig, ctx: RecipeContext): string {
  const r = ACTION_RECIPES.find((x) => x.id === config.id);
  if (!r) return header(config) + 'return { execute = function() end }\n';
  const c = r.code(config.values, ctx);
  return `${header(config)}-- ${r.label}
return {
${c.options ? `  -- 판정: 고를 수 있는 것
  options = function(game, player)
${c.options}  end,

` : ''}  -- 실행: 고른 것(choice)으로 상태를 바꿔요
  execute = function(game, player, choice)
${c.execute}  end,
}
`;
}

export function phaseScript(config: PhaseConfig, ctx: RecipeContext): string {
  const body = config.steps
    .map((st) => {
      const r = STEP_RECIPES.find((x) => x.id === st.id);
      return r ? `  -- ${r.label}\n${r.code(st.values, ctx)}` : '';
    })
    .join('');
  const next = config.whenOver || config.otherwise
    ? `
  -- 다음 노드: 게임이 끝났으면 ${config.whenOver || '?'}, 아니면 ${config.otherwise || '?'}
  next = function(game)
    if game:isOver() then return ${q(config.whenOver ?? '')} end
    return ${q(config.otherwise ?? '')}
  end,
`
    : '';
  return `${header(config)}return {
  onEnter = function(game, player)
${body || '    -- 할 일이 없어요\n'}  end,
${next}}
`;
}

/** Read the recipe back from a script, unless it was edited by hand. */
export function readRecipe(script: string | undefined, ctx: RecipeContext): RecipeConfig | null {
  if (!script || !script.startsWith(HEADER)) return null;
  try {
    const config = JSON.parse(script.slice(HEADER.length, script.indexOf('\n'))) as RecipeConfig;
    const regenerated = config.kind === 'action' ? actionScript(config, ctx) : phaseScript(config, ctx);
    return regenerated === script ? config : null;
  } catch {
    return null;
  }
}

export function hasRecipeHeader(script: string | undefined) {
  return !!script && script.startsWith(HEADER);
}
