// Turns a game folder (path -> text) into a validated GameDef.
import { parse } from 'yaml';
import type { BoardDef, GameDef, LoopDef, NodeDef, NodeType, PieceTypeDef, PlayerDef, SetupEntry, ZoneDef } from './types';

export class DefinitionError extends Error {}

type Files = Record<string, string>;
type Obj = Record<string, unknown>;

const fail = (file: string, msg: string): never => {
  throw new DefinitionError(`${file}: ${msg}`);
};

function readYaml(files: Files, path: string): Obj {
  const text = files[path];
  if (text === undefined) fail(path, '파일이 없어요');
  try {
    const v = parse(text);
    if (!v || typeof v !== 'object' || Array.isArray(v)) fail(path, '최상위는 키-값 형태여야 해요');
    return v as Obj;
  } catch (e) {
    if (e instanceof DefinitionError) throw e;
    return fail(path, `YAML 문법 오류: ${(e as Error).message}`);
  }
}

const asArray = (v: unknown): unknown[] => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
const asStrings = (v: unknown): string[] => asArray(v).map(String);

function coordOf(file: string, v: unknown): [number, number] {
  if (!Array.isArray(v) || v.length !== 2 || !v.every((n) => Number.isInteger(n))) {
    fail(file, `좌표는 [x, y] 형태여야 해요: ${JSON.stringify(v)}`);
  }
  return v as [number, number];
}

export function gridZoneId(board: string, x: number, y: number) {
  return `${board}:${x},${y}`;
}

function loadBoard(files: Files, path: string, zones: Record<string, ZoneDef>): BoardDef {
  const y = readYaml(files, path);
  const id = String(y.id ?? 'board');
  const coords = (y.coords ?? 'square') as BoardDef['coords'];
  if (coords !== 'square' && coords !== 'none') fail(path, `coords는 square 또는 none이어야 해요`);
  const [width, height] = coords === 'square' ? coordOf(path, y.size) : [0, 0];
  const style = (y.style ?? 'cells') as BoardDef['style'];
  const defaults = (y.zoneDefaults ?? {}) as Obj;
  const board: BoardDef = { id, coords, width, height, style, zones: [], grid: [], neighbors: {}, edges: [] };

  const addZone = (z: ZoneDef) => {
    if (zones[z.id]) fail(path, `존 id가 중복돼요: ${z.id}`);
    zones[z.id] = z;
    board.zones.push(z.id);
    board.neighbors[z.id] = [];
  };

  for (let gy = 0; gy < height; gy++) {
    for (let gx = 0; gx < width; gx++) {
      const zid = gridZoneId(id, gx, gy);
      addZone({
        id: zid, board: id, x: gx, y: gy, name: `${gx},${gy}`, tags: [],
        accepts: asStrings(defaults.accepts), layout: 'free',
      });
      board.grid.push(zid);
    }
  }

  const zoneAtCoord = (c: unknown): string => {
    const [cx, cy] = coordOf(path, c);
    if (cx < 0 || cy < 0 || cx >= width || cy >= height) fail(path, `보드 밖 좌표예요: [${cx}, ${cy}]`);
    return board.grid[cy * width + cx]!;
  };
  const zoneRef = (r: unknown): string => {
    if (Array.isArray(r)) return zoneAtCoord(r);
    const s = String(r);
    if (!zones[s]) fail(path, `없는 존이에요: ${s}`);
    return s;
  };

  // extra off-grid zones
  for (const raw of asArray(y.zones)) {
    const z = raw as Obj;
    if (!z.id) fail(path, 'zones 항목에는 id가 필요해요');
    const layout = (z.layout ?? 'row') as ZoneDef['layout'];
    addZone({
      id: String(z.id), board: id, x: null, y: null, name: String(z.name ?? z.id),
      tags: asStrings(z.tags), accepts: asStrings(z.accepts ?? defaults.accepts), layout,
    });
  }

  // tags: { tagName: [ [x,y], ... ] }
  for (const [tag, list] of Object.entries((y.tags ?? {}) as Obj)) {
    for (const c of asArray(list)) {
      const zid = zoneRef(c);
      if (!zones[zid]!.tags.includes(tag)) zones[zid]!.tags.push(tag);
    }
  }

  // names: optional column/row letters, e.g. files: "abcdefgh", ranks: "12345678"
  const names = (y.names ?? null) as Obj | null;
  if (names) {
    const cols = String(names.columns ?? '');
    const rows = asStrings(names.rows);
    for (const zid of board.grid) {
      const z = zones[zid!]!;
      const c = cols[z.x!] ?? String(z.x);
      const r = rows[z.y!] ?? String(z.y);
      z.name = `${c}${r}`;
    }
  }

  // board graph edges
  const link = (a: string, b: string) => {
    if (a === b) return;
    if (!board.neighbors[a]!.includes(b)) board.neighbors[a]!.push(b);
    if (!board.neighbors[b]!.includes(a)) board.neighbors[b]!.push(a);
    if (!board.edges.some(([p, q]) => (p === a && q === b) || (p === b && q === a))) board.edges.push([a, b]);
  };
  const adjacency = String(y.adjacency ?? 'orthogonal');
  if (!['orthogonal', 'all', 'none'].includes(adjacency)) fail(path, 'adjacency는 orthogonal, all, none 중 하나예요');
  if (coords === 'square' && adjacency !== 'none') {
    const dirs = adjacency === 'all'
      ? [[1, 0], [0, 1], [1, 1], [1, -1]]
      : [[1, 0], [0, 1]];
    for (let gy = 0; gy < height; gy++) {
      for (let gx = 0; gx < width; gx++) {
        for (const [dx, dy] of dirs) {
          const nx = gx + dx!, ny = gy + dy!;
          if (nx >= 0 && ny >= 0 && nx < width && ny < height) {
            link(board.grid[gy * width + gx]!, board.grid[ny * width + nx]!);
          }
        }
      }
    }
  }
  for (const e of asArray(y.edges)) {
    if (!Array.isArray(e) || e.length !== 2) fail(path, `edges 항목은 [존, 존] 형태여야 해요: ${JSON.stringify(e)}`);
    link(zoneRef((e as unknown[])[0]), zoneRef((e as unknown[])[1]));
  }
  return board;
}

const NODE_TYPES: NodeType[] = ['start', 'end', 'phase', 'action', 'loop'];

function loadLoop(files: Files, path: string, raw: Obj): LoopDef {
  const nodes: Record<string, NodeDef> = {};
  for (const [id, v] of Object.entries((raw.nodes ?? {}) as Obj)) {
    const n = (v ?? {}) as Obj;
    const type = String(n.type ?? 'phase') as NodeType;
    if (!NODE_TYPES.includes(type)) fail(path, `노드 '${id}'의 type이 잘못됐어요: ${type}`);
    const script = n.script ? String(n.script) : null;
    if (script && files[script] === undefined) fail(path, `노드 '${id}'의 스크립트 파일이 없어요: ${script}`);
    if (type === 'action' && !script) fail(path, `Action 노드 '${id}'에는 script가 필요해요`);
    let loop: LoopDef | null = null;
    if (type === 'loop') {
      if (typeof n.loop === 'string') loop = loadLoop(files, n.loop, readYaml(files, n.loop));
      else if (n.loop && typeof n.loop === 'object') loop = loadLoop(files, path, n.loop as Obj);
      else fail(path, `하위 루프 노드 '${id}'에는 loop가 필요해요`);
    }
    nodes[id] = {
      id, type, label: String(n.label ?? id), script,
      pos: n.pos ? coordOfAny(path, n.pos) : null, loop,
    };
  }

  const out: Record<string, string[]> = {};
  for (const id of Object.keys(nodes)) out[id] = [];
  const edges: [string, string][] = [];
  for (const e of asArray(raw.edges)) {
    if (!Array.isArray(e) || e.length !== 2) fail(path, `edges 항목은 [노드, 노드] 형태여야 해요: ${JSON.stringify(e)}`);
    const [a, b] = (e as unknown[]).map(String) as [string, string];
    if (!nodes[a]) fail(path, `없는 노드에서 출발하는 연결이에요: ${a}`);
    if (!nodes[b]) fail(path, `없는 노드로 가는 연결이에요: ${b}`);
    edges.push([a, b]);
    out[a]!.push(b);
  }

  const starts = Object.values(nodes).filter((n) => n.type === 'start');
  if (starts.length !== 1) fail(path, `루프에는 start 노드가 정확히 하나 있어야 해요 (지금 ${starts.length}개)`);
  const start = starts[0]!.id;
  if (out[start]!.length !== 1) fail(path, `start 노드는 나가는 연결이 하나여야 해요`);
  if (!Object.values(nodes).some((n) => n.type === 'end')) fail(path, '루프에는 end 노드가 있어야 해요');

  for (const n of Object.values(nodes)) {
    const targets = out[n.id]!;
    if (n.type === 'end' && targets.length) fail(path, `end 노드 '${n.id}'에서는 나가는 연결이 없어야 해요`);
    if (n.type !== 'end' && !targets.length) fail(path, `노드 '${n.id}'에 나가는 연결이 없어요`);
    const toAction = targets.filter((t) => nodes[t]!.type === 'action');
    if (toAction.length && toAction.length !== targets.length) {
      fail(path, `노드 '${n.id}'는 Action 노드와 다른 노드로 동시에 연결될 수 없어요. 다른 노드로 가려면 Action(예: 넘기기)을 거치게 해 주세요`);
    }
    if (n.type === 'start' && nodes[targets[0]!]!.type === 'action') fail(path, 'start 노드는 Action 노드로 바로 연결될 수 없어요');
  }
  return { start, nodes, edges, out };
}

function coordOfAny(file: string, v: unknown): [number, number] {
  if (!Array.isArray(v) || v.length !== 2 || !v.every((n) => typeof n === 'number')) fail(file, `pos는 [x, y] 형태여야 해요`);
  return v as [number, number];
}

export function loadGame(files: Files): GameDef {
  const g = readYaml(files, 'game.yaml');

  const players: PlayerDef[] = asArray(g.players).map((p, i) => {
    const o = p as Obj;
    if (!o.id) fail('game.yaml', `players[${i}]에 id가 필요해요`);
    return { id: String(o.id), name: String(o.name ?? o.id), color: String(o.color ?? '#888') };
  });
  if (!players.length) fail('game.yaml', 'players가 비어 있어요');

  const pieceTypes: Record<string, PieceTypeDef> = {};
  for (const [id, v] of Object.entries((g.pieceTypes ?? {}) as Obj)) {
    const o = (v ?? {}) as Obj;
    const label = typeof o.label === 'object' && o.label ? (o.label as Record<string, string>) : String(o.label ?? id);
    pieceTypes[id] = { id, label, tags: asStrings(o.tags) };
  }

  const zones: Record<string, ZoneDef> = {};
  const boards = asStrings(g.boards ?? 'board.yaml').map((p) => loadBoard(files, p, zones));

  const loopPath = String(g.loop ?? 'loop.yaml');
  const loop = loadLoop(files, loopPath, readYaml(files, loopPath));

  const setup: SetupEntry[] = asArray(g.setup).map((raw, i) => {
    const o = raw as Obj;
    const type = String(o.type);
    if (!pieceTypes[type]) fail('game.yaml', `setup[${i}]: 없는 말 종류예요: ${type}`);
    const owner = o.owner === undefined || o.owner === null ? null : String(o.owner);
    if (owner && !players.some((p) => p.id === owner)) fail('game.yaml', `setup[${i}]: 없는 플레이어예요: ${owner}`);
    let zone: string;
    if (o.at !== undefined) {
      const [x, y] = coordOf('game.yaml', o.at);
      const board = String(o.board ?? boards[0]!.id);
      zone = gridZoneId(board, x, y);
    } else zone = String(o.zone);
    if (!zones[zone]) fail('game.yaml', `setup[${i}]: 없는 존이에요: ${zone}`);
    return { type, owner, zone };
  });

  const scripts = (g.scripts ?? {}) as Obj;
  const pieceScript = scripts.pieces ? String(scripts.pieces) : null;
  const zoneScript = scripts.zones ? String(scripts.zones) : null;
  for (const s of [pieceScript, zoneScript]) {
    if (s && files[s] === undefined) fail('game.yaml', `스크립트 파일이 없어요: ${s}`);
  }

  const sources: Record<string, string> = {};
  for (const [p, text] of Object.entries(files)) if (p.endsWith('.lua')) sources[p] = text;

  return {
    name: String(g.name ?? '이름 없는 게임'), players, pieceTypes, boards, zones, loop, setup,
    sources, pieceScript, zoneScript,
  };
}
