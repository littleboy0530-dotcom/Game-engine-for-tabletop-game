// Games people make in the browser: kept in localStorage, exported/imported as a file.
import { actionScript, phaseScript, type RecipeContext } from './editor/recipes';

export interface Project {
  id: string;
  name: string;
  files: Record<string, string>;
  updated: number;
}

const KEY = 'tte.projects.v1';

export function loadProjects(): Project[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as Project[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveAll(list: Project[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export function saveProject(p: Project): boolean {
  const list = loadProjects().filter((x) => x.id !== p.id);
  return saveAll([{ ...p, updated: Date.now() }, ...list]);
}

export function deleteProject(id: string) {
  saveAll(loadProjects().filter((x) => x.id !== id));
}

export function newId() {
  return `p${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function exportProject(p: Project) {
  const blob = new Blob([JSON.stringify({ format: 'tabletop-engine-project', version: 1, name: p.name, files: p.files }, null, 2)], {
    type: 'application/json',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${p.name.replace(/[\\/:*?"<>|]/g, '_') || 'game'}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function importProject(file: File): Promise<Project> {
  const data = JSON.parse(await file.text()) as { format?: string; name?: string; files?: Record<string, string> };
  if (data.format !== 'tabletop-engine-project' || !data.files || typeof data.files !== 'object') {
    throw new Error('이 엔진에서 내보낸 게임 파일이 아니에요');
  }
  return { id: newId(), name: data.name ?? '가져온 게임', files: data.files, updated: Date.now() };
}

// ---------------------------------------------------------------- templates

const players2 = `players:
  - { id: p1, name: 1번, color: "#2f6fb5" }
  - { id: p2, name: 2번, color: "#b5562b" }`;

function withScripts(files: Record<string, string>, ctx: RecipeContext, scripts: Record<string, string | ((c: RecipeContext) => string)>) {
  const out = { ...files };
  for (const [path, s] of Object.entries(scripts)) out[path] = typeof s === 'function' ? s(ctx) : s;
  return out;
}

export interface Template {
  id: string;
  label: string;
  help: string;
  files: () => Record<string, string>;
}

export const TEMPLATES: Template[] = [
  {
    id: 'blank',
    label: '빈 게임',
    help: '탁자 하나와 "넘기기" 버튼만 있는 가장 단순한 시작점',
    files: () => {
      const ctx: RecipeContext = { zones: [{ id: 'table', name: '탁자', perPlayer: false }] };
      return withScripts({
        'game.yaml': `name: 새 게임\n${players2}\n`,
        'board.yaml': `id: table\ncoords: none\nzones:\n  - { id: table, name: 탁자, layout: row }\n`,
        'loop.yaml': `nodes:
  start: { type: start, pos: [0, 100] }
  turn: { type: phase, label: 차례, pos: [140, 100] }
  pass: { type: action, label: 넘기기, script: loop/pass.lua, pos: [300, 100] }
  after: { type: phase, label: 다음 사람, script: loop/after.lua, pos: [460, 100] }
  end: { type: end, pos: [620, 100] }
edges:
  - [start, turn]
  - [turn, pass]
  - [pass, after]
  - [after, turn]
  - [after, end]
`,
      }, ctx, {
        'loop/pass.lua': (c) => actionScript({ kind: 'action', id: 'pass', values: {} }, c),
        'loop/after.lua': (c) => phaseScript({ kind: 'phase', steps: [{ id: 'nextPlayer', values: {} }], whenOver: 'end', otherwise: 'turn' }, c),
      });
    },
  },
  {
    id: 'grid',
    label: '격자에 말 놓기',
    help: '3×3 격자에 번갈아 말을 놓는 틀. 승리 조건은 직접 더해요 (예: 한 줄로 3개)',
    files: () => {
      const ctx: RecipeContext = { zones: [] };
      return withScripts({
        'game.yaml': `name: 격자 게임\n${players2}\npieceTypes:\n  stone: { label: { p1: "●", p2: "○" } }\n`,
        'board.yaml': `id: board\ncoords: square\nsize: [3, 3]\nstyle: cells\nadjacency: all\n`,
        'loop.yaml': `nodes:
  start: { type: start, pos: [0, 100] }
  turn: { type: phase, label: 차례, pos: [140, 100] }
  place: { type: action, label: 말 놓기, script: loop/place.lua, pos: [300, 100] }
  judge: { type: phase, label: 승패 확인, script: loop/judge.lua, pos: [460, 100] }
  end: { type: end, pos: [620, 100] }
edges:
  - [start, turn]
  - [turn, place]
  - [place, judge]
  - [judge, turn]
  - [judge, end]
`,
      }, ctx, {
        'loop/place.lua': (c) => actionScript({ kind: 'action', id: 'placeOwnPiece', values: { type: 'stone' } }, c),
        'loop/judge.lua': (c) => phaseScript({
          kind: 'phase', steps: [{ id: 'fullDraw', values: {} }, { id: 'nextPlayer', values: {} }], whenOver: 'end', otherwise: 'turn',
        }, c),
      });
    },
  },
  {
    id: 'track',
    label: '주사위 트랙 경주',
    help: '주사위를 굴려 트랙을 달리는 틀. 끝 칸에 먼저 닿으면 승리',
    files: () => {
      const ctx: RecipeContext = { zones: [{ id: 'dice', name: '주사위', perPlayer: false }] };
      const spaces = Array.from({ length: 12 }, (_, i) => `  - { name: "${i === 0 ? '출발' : i === 11 ? '결승' : i}" }`).join('\n');
      return withScripts({
        'game.yaml': `name: 트랙 경주\n${players2}\npieceTypes:\n  pawn: { label: "●" }\ndiceTypes:\n  d6: {}\nsetup:\n  - { type: pawn, owner: p1, at: 0 }\n  - { type: pawn, owner: p2, at: 0 }\n  - { type: d6, zone: dice }\n`,
        'board.yaml': `id: road\ncoords: track\nclosed: false\nspaces:\n${spaces}\nzones:\n  - { id: dice, name: 주사위, layout: row }\n`,
        'loop.yaml': `nodes:
  start: { type: start, pos: [0, 100] }
  turn: { type: phase, label: 차례, pos: [140, 100] }
  roll: { type: action, label: 주사위 굴리기, script: loop/roll.lua, pos: [300, 100] }
  judge: { type: phase, label: 결승 확인, script: loop/judge.lua, pos: [460, 100] }
  end: { type: end, pos: [620, 100] }
edges:
  - [start, turn]
  - [turn, roll]
  - [roll, judge]
  - [judge, turn]
  - [judge, end]
`,
      }, ctx, {
        'loop/roll.lua': (c) => actionScript({ kind: 'action', id: 'rollAndMove', values: { die: 'd6', piece: 'pawn' } }, c),
        'loop/judge.lua': (c) => phaseScript({
          kind: 'phase', steps: [{ id: 'reachEnd', values: { piece: 'pawn' } }, { id: 'nextPlayer', values: {} }], whenOver: 'end', otherwise: 'turn',
        }, c),
      });
    },
  },
  {
    id: 'cards',
    label: '카드 뽑고 내기',
    help: '덱에서 카드를 뽑고 내서 점수를 모으는 틀. 덱이 비면 점수가 높은 사람이 승리',
    files: () => {
      const ctx: RecipeContext = {
        zones: [
          { id: 'deck', name: '덱', perPlayer: false },
          { id: 'table', name: '낸 카드', perPlayer: false },
          { id: 'hand', name: '손패', perPlayer: true },
        ],
      };
      return withScripts({
        'game.yaml': `name: 카드 게임
${players2}
cardTypes:
  star: { label: 별, back: 카드, text: "1점", props: { value: 1 } }
  moon: { label: 달, back: 카드, text: "2점", props: { value: 2 } }
  sun: { label: 해, back: 카드, text: "3점", props: { value: 3 } }
setup:
  - { type: star, zone: deck, count: 10 }
  - { type: moon, zone: deck, count: 6 }
  - { type: sun, zone: deck, count: 4 }
display:
  player: { score: 점수 }
`,
        'board.yaml': `id: table
coords: none
zones:
  - { id: deck, name: 덱, layout: pile, visibility: hidden }
  - { id: table, name: 낸 카드, layout: row }
  - { id: hand, name: 손패, perPlayer: true, layout: row, visibility: owner }
`,
        'loop.yaml': `nodes:
  start: { type: start, pos: [0, 100] }
  deal: { type: phase, label: 준비, script: loop/deal.lua, pos: [130, 100] }
  turn: { type: phase, label: 차례, pos: [280, 100] }
  draw: { type: action, label: 한 장 뽑기, script: loop/draw.lua, pos: [440, 30] }
  play: { type: action, label: 카드 내기, script: loop/play.lua, pos: [440, 170] }
  judge: { type: phase, label: 끝 확인, script: loop/judge.lua, pos: [600, 100] }
  end: { type: end, pos: [760, 100] }
edges:
  - [start, deal]
  - [deal, turn]
  - [turn, draw]
  - [turn, play]
  - [draw, judge]
  - [play, judge]
  - [judge, turn]
  - [judge, end]
`,
      }, ctx, {
        'loop/deal.lua': (c) => phaseScript({
          kind: 'phase',
          steps: [
            { id: 'resetScores', values: {} },
            { id: 'shuffle', values: { zone: 'deck' } },
            { id: 'deal', values: { from: 'deck', to: 'hand', n: '3' } },
          ],
        }, c),
        'loop/draw.lua': (c) => actionScript({ kind: 'action', id: 'drawCards', values: { from: 'deck', to: 'hand', n: '1' } }, c),
        'loop/play.lua': (c) => actionScript({ kind: 'action', id: 'playCard', values: { from: 'hand', to: 'table', points: 'value' } }, c),
        'loop/judge.lua': (c) => phaseScript({
          kind: 'phase', steps: [{ id: 'emptyEnd', values: { zone: 'deck' } }, { id: 'nextPlayer', values: {} }], whenOver: 'end', otherwise: 'turn',
        }, c),
      });
    },
  },
];
