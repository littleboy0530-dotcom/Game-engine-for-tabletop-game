// Turns a game folder (path -> text) into a validated GameDef.
import { parse } from 'yaml';
import type {
  BoardDef, ComponentKind, DieFace, DisplayVar, GameDef, Json, LoopDef, NodeDef, NodeType, PieceTypeDef, PlayerDef,
  SetupEntry, Visibility, ZoneDef,
} from './types';

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
const asProps = (v: unknown): Record<string, Json> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, Json>) : {});

function coordOf(file: string, v: unknown): [number, number] {
  if (!Array.isArray(v) || v.length !== 2 || !v.every((n) => Number.isInteger(n))) {
    fail(file, `좌표는 [x, y] 형태여야 해요: ${JSON.stringify(v)}`);
  }
  return v as [number, number];
}

export function gridZoneId(board: string, x: number, y: number) {
  return `${board}:${x},${y}`;
}

/** Id of a per-player zone, e.g. "hand@white". */
export function playerZoneId(zone: string, player: string) {
  return `${zone}@${player}`;
}

// ---------------------------------------------------------------- CSV

/** Minimal CSV: header row, commas, double-quoted fields with "" escapes. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  const [header, ...body] = rows;
  if (!header) return [];
  const keys = header.map((h) => h.trim());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

const csvValue = (s: string): Json => (s !== '' && !Number.isNaN(Number(s)) ? Number(s) : s);

// ---------------------------------------------------------------- components

function componentType(id: string, kind: ComponentKind, o: Obj, file: string): PieceTypeDef {
  const label = typeof o.label === 'object' && o.label ? (o.label as Record<string, string>) : String(o.label ?? id);
  let faces: DieFace[] = [];
  if (kind === 'die') {
    const raw = o.faces ?? [1, 2, 3, 4, 5, 6];
    faces = asArray(raw).map((f) =>
      f && typeof f === 'object' ? { label: String((f as Obj).label ?? (f as Obj).value), value: ((f as Obj).value ?? (f as Obj).label) as Json }
        : { label: String(f), value: f as Json });
    if (!faces.length) fail(file, `주사위 '${id}'에 면이 없어요`);
  }
  return {
    id, kind, label, back: String(o.back ?? ''), text: String(o.text ?? ''),
    tags: asStrings(o.tags), props: asProps(o.props), faces,
  };
}

// ---------------------------------------------------------------- boards

const VISIBILITY: Visibility[] = ['public', 'owner', 'hidden', 'topOnly'];

function loadBoard(files: Files, path: string, zones: Record<string, ZoneDef>, players: PlayerDef[]): BoardDef {
  const y = readYaml(files, path);
  const id = String(y.id ?? 'board');
  const coords = (y.coords ?? 'square') as BoardDef['coords'];
  if (!['square', 'track', 'none'].includes(coords)) fail(path, `coords는 square, track, none 중 하나예요`);
  const defaults = (y.zoneDefaults ?? {}) as Obj;

  let width = 0, height = 0;
  let spaces: Obj[] = [];
  if (coords === 'square') [width, height] = coordOf(path, y.size);
  if (coords === 'track') {
    spaces = asArray(y.spaces) as Obj[];
    width = spaces.length || Number(y.length ?? 0);
    height = 1;
    if (!width) fail(path, 'track 보드에는 spaces 목록이나 length가 필요해요');
  }
  const style = (y.style ?? (coords === 'track' ? 'ring' : 'cells')) as BoardDef['style'];
  const board: BoardDef = { id, coords, width, height, style, zones: [], grid: [], neighbors: {}, edges: [] };

  const addZone = (z: ZoneDef) => {
    if (zones[z.id]) fail(path, `존 id가 중복돼요: ${z.id}`);
    zones[z.id] = z;
    board.zones.push(z.id);
    board.neighbors[z.id] = [];
  };
  const visibilityOf = (v: unknown, fallback: Visibility): Visibility => {
    const s = String(v ?? fallback) as Visibility;
    if (!VISIBILITY.includes(s)) fail(path, `visibility는 ${VISIBILITY.join(', ')} 중 하나예요: ${s}`);
    return s;
  };
  const baseZone = (zid: string, x: number | null, yy: number | null, name: string): ZoneDef => ({
    id: zid, board: id, x, y: yy, name, tags: [], accepts: asStrings(defaults.accepts), layout: 'free',
    visibility: visibilityOf(defaults.visibility, 'public'), owner: null, props: {}, group: null,
  });

  for (let gy = 0; gy < height; gy++) {
    for (let gx = 0; gx < width; gx++) {
      const zid = gridZoneId(id, gx, gy);
      const z = baseZone(zid, gx, gy, coords === 'track' ? String(gx) : `${gx},${gy}`);
      if (coords === 'track') {
        const sp = spaces[gx] ?? {};
        if (sp.name !== undefined) z.name = String(sp.name);
        z.tags = asStrings(sp.tags);
        z.props = asProps(sp.props);
      }
      addZone(z);
      board.grid.push(zid);
    }
  }

  const zoneAtCoord = (c: unknown): string => {
    if (coords === 'track' && Number.isInteger(c)) {
      const i = c as number;
      if (i < 0 || i >= width) fail(path, `트랙 밖 칸이에요: ${i}`);
      return board.grid[i]!;
    }
    const [cx, cy] = coordOf(path, c);
    if (cx < 0 || cy < 0 || cx >= width || cy >= height) fail(path, `보드 밖 좌표예요: [${cx}, ${cy}]`);
    return board.grid[cy * width + cx]!;
  };
  const zoneRef = (r: unknown): string => {
    if (Array.isArray(r) || (coords === 'track' && Number.isInteger(r))) return zoneAtCoord(r);
    const s = String(r);
    if (!zones[s]) fail(path, `없는 존이에요: ${s}`);
    return s;
  };

  // off-grid zones; perPlayer zones are created once per player as "<id>@<player>"
  for (const raw of asArray(y.zones)) {
    const z = raw as Obj;
    if (!z.id) fail(path, 'zones 항목에는 id가 필요해요');
    const make = (zid: string, owner: string | null, name: string): ZoneDef => ({
      ...baseZone(zid, null, null, name),
      tags: asStrings(z.tags),
      accepts: asStrings(z.accepts ?? defaults.accepts),
      layout: (z.layout ?? 'row') as ZoneDef['layout'],
      visibility: visibilityOf(z.visibility, 'public'),
      owner,
      props: asProps(z.props),
      group: owner ?? (z.group ? String(z.group) : null),
    });
    const layout = String(z.layout ?? 'row');
    if (!['free', 'pile', 'row'].includes(layout)) fail(path, `layout은 free, pile, row 중 하나예요: ${layout}`);
    if (z.perPlayer) {
      for (const p of players) addZone(make(playerZoneId(String(z.id), p.id), p.id, `${p.name}의 ${z.name ?? z.id}`));
    } else {
      addZone(make(String(z.id), null, String(z.name ?? z.id)));
    }
  }

  for (const [tag, list] of Object.entries((y.tags ?? {}) as Obj)) {
    for (const c of asArray(list)) {
      const zid = zoneRef(c);
      if (!zones[zid]!.tags.includes(tag)) zones[zid]!.tags.push(tag);
    }
  }

  const names = (y.names ?? null) as Obj | null;
  if (names && coords === 'square') {
    const cols = String(names.columns ?? '');
    const rows = asStrings(names.rows);
    for (const zid of board.grid) {
      const z = zones[zid!]!;
      z.name = `${cols[z.x!] ?? String(z.x)}${rows[z.y!] ?? String(z.y)}`;
    }
  }

  const link = (a: string, b: string) => {
    if (a === b) return;
    if (!board.neighbors[a]!.includes(b)) board.neighbors[a]!.push(b);
    if (!board.neighbors[b]!.includes(a)) board.neighbors[b]!.push(a);
    if (!board.edges.some(([p, q]) => (p === a && q === b) || (p === b && q === a))) board.edges.push([a, b]);
  };
  const adjacency = String(y.adjacency ?? (coords === 'track' ? 'track' : 'orthogonal'));
  if (coords === 'square') {
    if (!['orthogonal', 'all', 'none'].includes(adjacency)) fail(path, 'adjacency는 orthogonal, all, none 중 하나예요');
    if (adjacency !== 'none') {
      const dirs = adjacency === 'all' ? [[1, 0], [0, 1], [1, 1], [1, -1]] : [[1, 0], [0, 1]];
      for (let gy = 0; gy < height; gy++) {
        for (let gx = 0; gx < width; gx++) {
          for (const [dx, dy] of dirs) {
            const nx = gx + dx!, ny = gy + dy!;
            if (nx >= 0 && ny >= 0 && nx < width && ny < height) link(board.grid[gy * width + gx]!, board.grid[ny * width + nx]!);
          }
        }
      }
    }
  }
  if (coords === 'track') {
    for (let i = 0; i + 1 < width; i++) link(board.grid[i]!, board.grid[i + 1]!);
    if (y.closed !== false && width > 2) link(board.grid[width - 1]!, board.grid[0]!);
  }
  for (const e of asArray(y.edges)) {
    if (!Array.isArray(e) || e.length !== 2) fail(path, `edges 항목은 [존, 존] 형태여야 해요: ${JSON.stringify(e)}`);
    link(zoneRef((e as unknown[])[0]), zoneRef((e as unknown[])[1]));
  }
  return board;
}

// ---------------------------------------------------------------- loop

const NODE_TYPES: NodeType[] = ['start', 'end', 'phase', 'action', 'loop'];

function loadLoop(files: Files, path: string, raw: Obj, scope: string[] = []): LoopDef {
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
      if (typeof n.loop === 'string') loop = loadLoop(files, n.loop, readYaml(files, n.loop), [...scope, id]);
      else if (n.loop && typeof n.loop === 'object') loop = loadLoop(files, path, n.loop as Obj, [...scope, id]);
      else fail(path, `하위 루프 노드 '${id}'에는 loop가 필요해요`);
    }
    let limit: NodeDef['limit'] = null;
    if (n.limit !== undefined) {
      if (type !== 'action') fail(path, `limit은 Action 노드에만 쓸 수 있어요: ${id}`);
      const l = n.limit as Obj;
      if (!Number.isInteger(l.count) || !l.per) fail(path, `노드 '${id}'의 limit은 { count: 숫자, per: 노드 } 형태여야 해요`);
      limit = { count: l.count as number, per: String(l.per) };
    }
    if (n.common && type !== 'action') fail(path, `common은 Action 노드에만 쓸 수 있어요: ${id}`);
    nodes[id] = {
      id, type, label: String(n.label ?? id), script,
      pos: n.pos ? coordOfAny(path, n.pos) : null, loop,
      common: !!n.common, exclude: asStrings(n.exclude), limit,
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
    if (nodes[a]!.common || nodes[b]!.common) fail(path, `공통 Action '${nodes[a]!.common ? a : b}'에는 연결을 그리지 않아요. 루프 안 어디서든 쓸 수 있고, 쓴 뒤 원래 자리로 돌아와요`);
    edges.push([a, b]);
    out[a]!.push(b);
  }

  const starts = Object.values(nodes).filter((n) => n.type === 'start');
  if (starts.length !== 1) fail(path, `루프에는 start 노드가 정확히 하나 있어야 해요 (지금 ${starts.length}개)`);
  const start = starts[0]!.id;
  if (out[start]!.length !== 1) fail(path, `start 노드는 나가는 연결이 하나여야 해요`);
  if (!Object.values(nodes).some((n) => n.type === 'end')) fail(path, '루프에는 end 노드가 있어야 해요');

  for (const n of Object.values(nodes)) {
    if (n.common) continue;
    const targets = out[n.id]!;
    if (n.type === 'end' && targets.length) fail(path, `end 노드 '${n.id}'에서는 나가는 연결이 없어야 해요`);
    if (n.type !== 'end' && !targets.length) fail(path, `노드 '${n.id}'에 나가는 연결이 없어요`);
    const toAction = targets.filter((t) => nodes[t]!.type === 'action');
    if (toAction.length && toAction.length !== targets.length) {
      fail(path, `노드 '${n.id}'는 Action 노드와 다른 노드로 동시에 연결될 수 없어요. 다른 노드로 가려면 Action(예: 넘기기)을 거치게 해 주세요`);
    }
    if (n.type === 'start' && nodes[targets[0]!]!.type === 'action') fail(path, 'start 노드는 Action 노드로 바로 연결될 수 없어요');
  }
  const common = Object.values(nodes).filter((n) => n.common).map((n) => n.id);
  return { start, nodes, edges, out, common };
}

/** Check limit.per and exclude refer to real nodes (anywhere in the loop tree). */
function checkRefs(loop: LoopDef, all: Set<string>, path: string) {
  for (const n of Object.values(loop.nodes)) {
    if (n.limit && !all.has(n.limit.per)) fail(path, `노드 '${n.id}'의 limit.per에 적힌 노드가 없어요: ${n.limit.per}`);
    for (const x of n.exclude) if (!all.has(x)) fail(path, `노드 '${n.id}'의 exclude에 적힌 노드가 없어요: ${x}`);
    if (n.loop) checkRefs(n.loop, all, path);
  }
}
function allNodeIds(loop: LoopDef, out = new Set<string>()) {
  for (const n of Object.values(loop.nodes)) {
    out.add(n.id);
    if (n.loop) allNodeIds(n.loop, out);
  }
  return out;
}

function coordOfAny(file: string, v: unknown): [number, number] {
  if (!Array.isArray(v) || v.length !== 2 || !v.every((n) => typeof n === 'number')) fail(file, `pos는 [x, y] 형태여야 해요`);
  return v as [number, number];
}

// ---------------------------------------------------------------- game

export function loadGame(files: Files): GameDef {
  const g = readYaml(files, 'game.yaml');

  const players: PlayerDef[] = asArray(g.players).map((p, i) => {
    const o = p as Obj;
    if (!o.id) fail('game.yaml', `players[${i}]에 id가 필요해요`);
    const script = o.script ? String(o.script) : null;
    if (script && files[script] === undefined) fail('game.yaml', `players[${i}]의 스크립트 파일이 없어요: ${script}`);
    return { id: String(o.id), name: String(o.name ?? o.id), color: String(o.color ?? '#888'), script };
  });
  if (!players.length) fail('game.yaml', 'players가 비어 있어요');

  const pieceTypes: Record<string, PieceTypeDef> = {};
  const addType = (t: PieceTypeDef, file: string) => {
    if (pieceTypes[t.id]) fail(file, `컴포넌트 종류 id가 중복돼요: ${t.id}`);
    pieceTypes[t.id] = t;
  };
  for (const [key, kind] of [['pieceTypes', 'piece'], ['cardTypes', 'card'], ['diceTypes', 'die']] as const) {
    for (const [id, v] of Object.entries((g[key] ?? {}) as Obj)) addType(componentType(id, kind, (v ?? {}) as Obj, 'game.yaml'), 'game.yaml');
  }

  // cards.csv: id,label,back,text,tags(;),count,zone,... other columns become props
  const csvSetup: Obj[] = [];
  for (const csvPath of asStrings(g.cards)) {
    const text = files[csvPath];
    if (text === undefined) fail('game.yaml', `카드 파일이 없어요: ${csvPath}`);
    parseCsv(text).forEach((row, i) => {
      if (!row.id) fail(csvPath, `${i + 2}번째 줄에 id가 없어요`);
      const props: Record<string, Json> = {};
      for (const [k, v] of Object.entries(row)) {
        if (!['id', 'label', 'back', 'text', 'tags', 'count', 'zone', 'perPlayer'].includes(k) && v !== '') props[k] = csvValue(v);
      }
      addType(componentType(row.id, 'card', {
        label: row.label || row.id, back: row.back, text: row.text,
        tags: row.tags ? row.tags.split(';').map((t) => t.trim()).filter(Boolean) : [], props,
      }, csvPath), csvPath);
      if (row.zone && row.count) {
        csvSetup.push({ type: row.id, zone: row.zone, count: Number(row.count), perPlayer: row.perPlayer === 'true' || row.perPlayer === '1' });
      }
    });
  }

  const zones: Record<string, ZoneDef> = {};
  const boards = asStrings(g.boards ?? 'board.yaml').map((p) => loadBoard(files, p, zones, players));

  const loopPath = String(g.loop ?? 'loop.yaml');
  const loop = loadLoop(files, loopPath, readYaml(files, loopPath));
  checkRefs(loop, allNodeIds(loop), loopPath);

  const setup: SetupEntry[] = [];
  [...asArray(g.setup), ...csvSetup].forEach((raw, i) => {
    const o = raw as Obj;
    const where = `setup[${i}]`;
    const type = String(o.type);
    if (!pieceTypes[type]) fail('game.yaml', `${where}: 없는 컴포넌트 종류예요: ${type}`);
    const count = o.count === undefined ? 1 : Number(o.count);
    if (!Number.isInteger(count) || count < 0) fail('game.yaml', `${where}: count는 0 이상의 정수예요`);
    const resolve = (owner: string | null): SetupEntry => {
      let zone: string;
      if (o.at !== undefined) {
        const board = boards.find((b) => b.id === String(o.board ?? boards[0]!.id))!;
        if (board.coords === 'track' && Number.isInteger(o.at)) zone = gridZoneId(board.id, o.at as number, 0);
        else {
          const [x, y] = coordOf('game.yaml', o.at);
          zone = gridZoneId(board.id, x, y);
        }
      } else zone = o.perPlayer ? playerZoneId(String(o.zone), owner!) : String(o.zone);
      if (!zones[zone]) fail('game.yaml', `${where}: 없는 존이에요: ${zone}`);
      return { type, owner, zone, count };
    };
    if (o.perPlayer) {
      for (const p of players) setup.push(resolve(p.id));
    } else {
      const owner = o.owner === undefined || o.owner === null ? null : String(o.owner);
      if (owner && !players.some((p) => p.id === owner)) fail('game.yaml', `${where}: 없는 플레이어예요: ${owner}`);
      setup.push(resolve(owner));
    }
  });

  const scripts = (g.scripts ?? {}) as Obj;
  // scripts.pieces (one file) and scripts.components (list) both hold per-type tables
  const componentScripts = [...asStrings(scripts.pieces), ...asStrings(scripts.components)];
  const listenerScripts = asStrings(scripts.listeners);
  const zoneScript = scripts.zones ? String(scripts.zones) : null;
  for (const s of [...componentScripts, ...listenerScripts, zoneScript]) {
    if (s && files[s] === undefined) fail('game.yaml', `스크립트 파일이 없어요: ${s}`);
  }

  const displayList = (v: unknown): DisplayVar[] =>
    Object.entries(asProps(v)).map(([key, label]) => ({ key, label: String(label) }));
  const display = { player: displayList((g.display as Obj | undefined)?.player), game: displayList((g.display as Obj | undefined)?.game) };

  const sources: Record<string, string> = {};
  for (const [p, text] of Object.entries(files)) if (p.endsWith('.lua')) sources[p] = text;

  return {
    name: String(g.name ?? '이름 없는 게임'), players, pieceTypes, display, boards, zones, loop, setup,
    sources, componentScripts, listenerScripts, zoneScript,
  };
}
