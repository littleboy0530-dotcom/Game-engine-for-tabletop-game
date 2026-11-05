import { LuaFactory, type LuaEngine } from 'wasmoon';
import prelude from './prelude.lua?raw';
import type {
  ActionView, BoardDef, EngineError, GameDef, GameState, Input, Json, LoopDef, NodeDef, OptionView, Pending, Ref, Side, ZoneDef,
} from './types';
import { gridZoneId, playerZoneId } from './loader';

const SIDES: Side[] = ['N', 'E', 'S', 'W'];
const STEP: Record<Side, [number, number]> = { N: [0, 1], E: [1, 0], S: [0, -1], W: [-1, 0] };

/** Node transitions allowed without player input before the engine stops. */
export const LOOP_LIMIT = 32;

const NEED_INPUT = '__NEED_INPUT__';

type Mode = 'effect' | 'judge' | 'sim';

export interface EngineOptions {
  seed?: number;
  /** Browser builds pass the URL of wasmoon's glue.wasm. */
  wasmUrl?: string;
  /** Let script players answer automatically (off while replaying a recorded log). */
  autoplay?: boolean;
}

interface Snapshot {
  state: GameState;
  preview: GameState | null;
  pending: Pending | null;
  error: EngineError | null;
  inputs: number;
}

const clone = <T>(v: T): T => structuredClone(v);

/** An empty Lua table arrives as {} rather than []. */
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? v : v && typeof v === 'object' ? (Object.values(v) as T[]) : []);

/** Values handed to Lua must never be null (wasmoon 1.16 crashes on it). */
const lua = (v: unknown) => (v === null ? undefined : v);

function refOf(v: Json): Ref | null {
  if (v && typeof v === 'object' && !Array.isArray(v) && typeof v.__ref === 'string') {
    const kind = v.__ref;
    if (kind === 'piece' || kind === 'zone' || kind === 'player') return { kind, id: String(v.id) };
  }
  return null;
}

export class Engine {
  readonly def: GameDef;
  readonly seed: number;
  state!: GameState;
  pending: Pending | null = null;
  error: EngineError | null = null;
  /**
   * While a script waits on `choose`, its half-done changes are rolled back
   * (the script re-runs once the answer arrives). This keeps those changes so
   * the screen can show them while the player decides.
   */
  private preview: GameState | null = null;
  /** Every input given so far; replaying them reproduces the game. */
  readonly inputs: Input[] = [];

  private readonly lua: LuaEngine;
  private readonly run: (kind: string, path: string, arg?: unknown) => unknown;
  private mode: Mode = 'effect';
  private auto = true;
  private answers: Json[] = [];
  private answerIdx = 0;
  private pendingChoose: Pending | null = null;
  private readonly undoStack: Snapshot[] = [];

  static async create(def: GameDef, opts: EngineOptions = {}): Promise<Engine> {
    const factory = new LuaFactory(opts.wasmUrl);
    const luaEngine = await factory.createEngine({ enableProxy: false, injectObjects: false });
    const engine = new Engine(def, luaEngine, opts.seed ?? Date.now() % 2147483647);
    engine.auto = opts.autoplay !== false;
    engine.start();
    return engine;
  }

  private constructor(def: GameDef, luaEngine: LuaEngine, seed: number) {
    this.def = def;
    this.seed = seed;
    this.lua = luaEngine;
    this.lua.global.set('__js', this.primitives());
    this.lua.doStringSync(prelude);
    this.run = this.lua.global.get('__run');
  }

  close() {
    this.lua.global.close();
  }

  // ------------------------------------------------------------------
  // public API
  // ------------------------------------------------------------------

  /** Give the answer to the current pending request. Script players then take their turns. */
  input(inp: Input) {
    this.apply(inp);
    this.autoplay();
  }

  /** Turn script players on or off; turning on lets them answer a pending request. */
  setAutoplay(on: boolean) {
    this.auto = on;
    this.autoplay();
  }

  /** Is this player decided by a script (automa)? */
  isScripted(playerId: string | null | undefined): boolean {
    return !!this.def.players.find((p) => p.id === playerId)?.script;
  }

  /** Let script players answer their own requests. */
  private autoplay() {
    if (!this.auto) return;
    for (let n = 0; this.pending && !this.error && !this.state.finished; n++) {
      const pl = this.def.players.find((p) => p.id === this.pending!.player);
      if (!pl?.script) return;
      if (n >= 1000) {
        this.error = { message: '스크립트 플레이어가 1000번 연속으로 골랐어요. 사람 차례가 오지 않는지 확인하세요', path: [...this.state.cursor.path] };
        this.pending = null;
        return;
      }
      const p = this.pending;
      const choices = p.kind === 'action'
        ? p.actions.flatMap((a) => a.options.map((o, i) => ({
          label: o.label || a.label, value: o.value, action: a.path[a.path.length - 1]!,
          input: { kind: 'action' as const, node: a.path[a.path.length - 1]!, option: i },
        })))
        : p.options.map((o, i) => ({ label: o.label, value: o.value, action: undefined, input: { kind: 'choose' as const, option: i } }));
      let idx: number;
      try {
        const req = { player: pl.id, kind: p.kind, prompt: p.kind === 'choose' ? p.prompt : '', choices: choices.map(({ input: _, ...c }) => c) };
        idx = Number(this.run('decide', pl.script, req));
      } catch (e) {
        this.error = { message: this.messageOf(e), path: [...this.state.cursor.path] };
        this.pending = null;
        return;
      }
      const c = choices[idx - 1];
      if (!c) {
        this.error = { message: `${pl.script}: decide가 없는 선택지(${idx})를 골랐어요`, path: [...this.state.cursor.path] };
        this.pending = null;
        return;
      }
      this.apply(c.input);
    }
  }

  private apply(inp: Input) {
    const p = this.pending;
    if (!p || this.error || this.state.finished) throw new Error('지금은 입력을 받을 수 없어요');
    const snap: Snapshot = { state: clone(this.state), preview: this.preview, pending: p, error: null, inputs: this.inputs.length };
    const c = this.state.cursor;
    if (inp.kind === 'action') {
      if (p.kind !== 'action') throw new Error('Action을 고를 차례가 아니에요');
      const a = p.actions.find((x) => x.path[x.path.length - 1] === inp.node);
      const opt = a?.options[inp.option];
      if (!a || !opt) throw new Error(`고를 수 없는 Action이에요: ${inp.node}#${inp.option}`);
      const node = this.nodeAt(a.path);
      if (node.limit) {
        const key = a.path.join('/');
        this.state.uses[key] = (this.state.uses[key] ?? 0) + 1;
      }
      if (node.common) this.state.returnTo = [...c.path];
      this.state.cursor = { path: a.path, stage: 'execute', option: opt.value, answers: [] };
    } else {
      if (p.kind !== 'choose') throw new Error('선택지를 고를 차례가 아니에요');
      const opt = p.options[inp.option];
      if (!opt) throw new Error(`없는 선택지예요: ${inp.option}`);
      c.answers.push(opt.value);
    }
    this.undoStack.push(snap);
    this.inputs.push(inp);
    this.state.idle = 0;
    this.state.trail = [];
    this.advance();
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }

  /** Undo the last input. */
  undo() {
    const s = this.undoStack.pop();
    if (!s) return;
    this.state = s.state;
    this.preview = s.preview;
    this.pending = s.pending;
    this.error = s.error;
    this.inputs.length = s.inputs;
  }

  /** Undo back to the last point where the player picked an Action. */
  undoToAction() {
    do this.undo();
    while (this.undoStack.length && (this.pending?.kind !== 'action' || this.isScripted(this.pending.player)));
  }

  /** What the screen should show: the in-progress state while a script waits for a choice. */
  get view(): GameState {
    return this.preview ?? this.state;
  }

  /** Path of the node the game is at (for highlighting the loop graph). */
  get currentPath(): string[] {
    return this.state.cursor.path;
  }

  pieceLabel(id: string): string {
    const pc = this.view.pieces[id] ?? this.piece(id);
    const t = this.def.pieceTypes[pc.type]!;
    if (t.kind === 'die') return t.faces[pc.side]?.label ?? '?';
    if (typeof t.label === 'string') return t.label;
    return (pc.owner && t.label[pc.owner]) ?? pc.type;
  }

  /** A zone, including ones added during play (as shown on screen). */
  zone(id: string): ZoneDef | undefined {
    return this.def.zones[id] ?? this.view.zones[id];
  }

  /** Every zone of a board, including ones added during play. */
  boardZones(boardId: string): ZoneDef[] {
    const b = this.def.boards.find((x) => x.id === boardId);
    const fixed = (b?.zones ?? []).map((z) => this.def.zones[z]!);
    return [...fixed, ...Object.values(this.view.zones).filter((z) => z.board === boardId)];
  }

  /** Tile edges and parts after rotation. */
  tileInfo(id: string) {
    const pc = this.view.pieces[id] ?? this.piece(id);
    const t = this.def.pieceTypes[pc.type]!;
    const turn = (sd: Side) => SIDES[(SIDES.indexOf(sd) + pc.rot) % 4]!;
    const edges: Record<Side, string> = { N: '-', E: '-', S: '-', W: '-' };
    t.edges.forEach((label, i) => { edges[turn(SIDES[i]!)] = label; });
    return { edges, segments: t.segments.map((sg) => ({ ...sg, sides: sg.sides.map(turn) })), rot: pc.rot };
  }

  /** Can `viewer` see the front of this component? Scripts always can; this is for the UI. */
  isVisible(id: string, viewer: string | null): boolean {
    const v = this.view;
    const pc = v.pieces[id];
    if (!pc || pc.face === 'down') return false;
    if (!pc.zone) return true;
    const z = this.zone(pc.zone)!;
    switch (z.visibility) {
      case 'public': return true;
      case 'hidden': return false;
      case 'owner': return viewer !== null && viewer === z.owner;
      case 'topOnly': {
        const list = v.contents[pc.zone]!;
        return list[list.length - 1] === id;
      }
    }
  }

  /** Does the game have information some players must not see? */
  get hasHiddenInfo(): boolean {
    return Object.values(this.def.zones).some((z) => z.visibility === 'owner');
  }

  // ------------------------------------------------------------------
  // setup
  // ------------------------------------------------------------------

  private start() {
    const def = this.def;
    this.state = {
      rng: this.seed | 0,
      nextId: 1,
      pieces: {},
      contents: Object.fromEntries(Object.keys(def.zones).map((z) => [z, []])),
      vars: {},
      playerVars: Object.fromEntries(def.players.map((p) => [p.id, {}])),
      current: def.players[0]!.id,
      cursor: { path: [def.loop.start], stage: 'enter', option: null, answers: [] },
      idle: 0,
      trail: [],
      result: null,
      finished: false,
      log: [],
      uses: {},
      returnTo: null,
      zones: {},
    };
    for (const s of def.setup) for (let i = 0; i < s.count; i++) this.createPiece(s.type, s.owner, s.zone);
    try {
      const load = this.lua.global.get('__load') as (p: string) => void;
      for (const path of Object.keys(def.sources).sort()) load(path);
    } catch (e) {
      this.error = { message: this.messageOf(e), path: null };
      return;
    }
    this.advance();
    this.autoplay();
  }

  // ------------------------------------------------------------------
  // loop runner
  // ------------------------------------------------------------------

  private loopAt(path: string[]): LoopDef {
    let loop = this.def.loop;
    for (let i = 0; i < path.length - 1; i++) loop = loop.nodes[path[i]!]!.loop!;
    return loop;
  }

  private nodeAt(path: string[]): NodeDef {
    return this.loopAt(path).nodes[path[path.length - 1]!]!;
  }

  /** Entering a node resets the uses of actions limited "per" that node. */
  private entered(nodeId: string) {
    for (const key of Object.keys(this.state.uses)) {
      if (this.nodeAt(key.split('/')).limit?.per === nodeId) delete this.state.uses[key];
    }
  }

  private available(path: string[], node: NodeDef): ActionView | null {
    if (node.limit && (this.state.uses[path.join('/')] ?? 0) >= node.limit.count) return null;
    const options = this.options(node.script!);
    return options.length ? { path, label: node.label, options } : null;
  }

  private advance() {
    this.pending = null;
    this.preview = null;
    try {
      this.step();
    } catch (e) {
      this.pending = null;
      const trail = (e as { trail?: string[] })?.trail;
      this.error = { message: this.messageOf(e), path: [...this.state.cursor.path], ...(trail ? { trail } : {}) };
    }
  }

  private step() {
    for (;;) {
      const c = this.state.cursor;
      const loop = this.loopAt(c.path);
      const id = c.path[c.path.length - 1]!;
      const node = loop.nodes[id]!;

      if (c.stage === 'enter') {
        switch (node.type) {
          case 'start':
            this.goto(loop.out[id]![0]!);
            continue;
          case 'end':
            if (c.path.length === 1) return this.finish();
            c.path = c.path.slice(0, -1);
            c.stage = 'after';
            continue;
          case 'loop':
            if (node.script && !this.exec('onEnter', node.script)) return;
            this.state.cursor.path = [...this.state.cursor.path, node.loop!.start];
            this.entered(node.loop!.start);
            continue;
          case 'phase':
            if (node.script && !this.exec('onEnter', node.script)) return;
            this.state.cursor.stage = 'after';
            continue;
          case 'action':
            throw new Error(`Action 노드 '${node.label}'는 플레이어가 골라야만 들어갈 수 있어요`);
        }
      }

      if (c.stage === 'execute') {
        if (!this.exec('execute', node.script!, c.option)) return;
        this.state.cursor.stage = 'after';
        this.state.cursor.option = null;
        continue;
      }

      // stage 'after': leave the node
      if (node.common) {
        // a common action returns to where the player was waiting
        const back = this.state.returnTo!;
        this.state.returnTo = null;
        this.state.cursor = { path: back, stage: 'after', option: null, answers: [] };
        continue;
      }
      const outs = loop.out[id]!;
      if (loop.nodes[outs[0]!]!.type === 'action') {
        if (this.state.result) return this.finish();
        const parent = c.path.slice(0, -1);
        const actions: ActionView[] = [];
        for (const target of outs) {
          const a = this.available([...parent, target], loop.nodes[target]!);
          if (a) actions.push(a);
        }
        // common actions of this loop and every loop around it
        for (let depth = c.path.length - 1; depth >= 0; depth--) {
          const prefix = c.path.slice(0, depth);
          const l = this.loopAt([...prefix, '']);
          for (const cid of l.common) {
            if (node.exclude.includes(cid)) continue;
            const a = this.available([...prefix, cid], l.nodes[cid]!);
            if (a) actions.push(a);
          }
        }
        if (!actions.length) throw new Error(`'${node.label}'에서 할 수 있는 Action이 하나도 없어요`);
        this.pending = { kind: 'action', player: this.state.current, actions };
        return;
      }

      let target = outs[0]!;
      if (outs.length > 1) {
        if (!node.script) throw new Error(`'${node.label}'는 연결이 여러 개라서 next 함수가 있는 스크립트가 필요해요`);
        const r = this.run('next', node.script) as string | undefined;
        if (r === undefined) throw new Error(`'${node.label}'는 연결이 여러 개라서 next 함수가 필요해요`);
        if (!outs.includes(r)) {
          throw new Error(`'${node.label}'의 next가 연결되지 않은 노드 '${r}'를 돌려줬어요 (연결된 노드: ${outs.join(', ')})`);
        }
        target = r;
      }
      this.goto(target);
    }
  }

  private goto(target: string) {
    const s = this.state;
    s.cursor = { path: [...s.cursor.path.slice(0, -1), target], stage: 'enter', option: null, answers: [] };
    this.entered(target);
    s.idle++;
    s.trail.push(s.cursor.path.join(' / '));
    if (s.trail.length > LOOP_LIMIT + 1) s.trail.shift();
    if (s.idle > LOOP_LIMIT) {
      const trail = [...s.trail];
      throw Object.assign(new Error(`입력 없이 노드 전환이 ${LOOP_LIMIT}번 넘게 이어져서 멈췄어요`), { trail });
    }
  }

  private finish() {
    this.state.finished = true;
    this.state.result ??= { winner: null, reason: '게임 종료' };
    this.pending = null;
  }

  /** Run a state-changing script as a transaction. False = waiting for input. */
  private exec(kind: 'onEnter' | 'execute', path: string, arg?: Json): boolean {
    const snap = clone(this.state);
    this.answers = this.state.cursor.answers;
    this.answerIdx = 0;
    this.pendingChoose = null;
    this.mode = 'effect';
    try {
      this.run(kind, path, lua(arg));
      // a script may swallow the input request with pcall; still wait for input
      if (!this.pendingChoose) return true;
      throw new Error(NEED_INPUT);
    } catch (e) {
      const partial = this.state;
      this.state = snap;
      this.mode = 'effect';
      if (this.pendingChoose) {
        this.preview = partial;
        this.pending = this.pendingChoose;
        return false;
      }
      throw e;
    }
  }

  private options(path: string): OptionView[] {
    const raw = arr<{ value: Json; label: string }>(this.run('options', path));
    return raw.map((o) => ({ value: o.value, label: o.label, ref: refOf(o.value) }));
  }

  private messageOf(e: unknown): string {
    const msg = e instanceof Error ? e.message : String(e);
    // wasmoon appends a Lua traceback; keep only the first line
    return msg.split('\nstack traceback:')[0]!.replace(/^Error: /, '').trim();
  }

  // ------------------------------------------------------------------
  // state helpers
  // ------------------------------------------------------------------

  private assertMutable(what: string) {
    if (this.mode === 'judge') throw new Error(`판정 스크립트에서는 상태를 바꿀 수 없어요 (${what})`);
  }

  private createPiece(type: string, owner: string | null, zone: string): string {
    if (!this.def.pieceTypes[type]) throw new Error(`없는 컴포넌트 종류예요: ${type}`);
    if (!this.zoneDef(zone)) throw new Error(`없는 존이에요: ${zone}`);
    const id = `p${this.state.nextId++}`;
    this.state.pieces[id] = { id, type, owner, zone, props: {}, face: 'up', side: 0, rot: 0 };
    this.state.contents[zone]!.push(id);
    this.afterPlace(id, zone);
    return id;
  }

  private zoneDef(id: string): ZoneDef | undefined {
    return this.def.zones[id] ?? this.state.zones[id];
  }

  private boardOf(id: string): BoardDef | undefined {
    return this.def.boards.find((b) => b.id === id);
  }

  private neighborsOf(zone: string): string[] {
    const z = this.zoneDef(zone);
    if (!z) return [];
    const b = this.boardOf(z.board)!;
    if (b.coords === 'open') {
      if (z.x === null || z.y === null) return [];
      return SIDES.map((sd) => gridZoneId(b.id, z.x! + STEP[sd][0], z.y! + STEP[sd][1])).filter((id) => this.zoneDef(id));
    }
    return [...(b.neighbors[zone] ?? [])];
  }

  private addZone(z: ZoneDef) {
    this.state.zones[z.id] = z;
    this.state.contents[z.id] ??= [];
  }

  /** A tile put on an open-board spot gets a sub-zone for each of its parts (for meeples). */
  private afterPlace(id: string, zone: string) {
    const pc = this.state.pieces[id]!;
    const t = this.def.pieceTypes[pc.type]!;
    const z = this.zoneDef(zone)!;
    if (t.kind !== 'tile' || z.x === null || z.parent) return;
    for (const sg of t.segments) {
      const sid = `${zone}/${sg.id}`;
      if (this.zoneDef(sid)) continue;
      this.addZone({
        id: sid, board: z.board, x: null, y: null, name: sg.kind, tags: [sg.kind], accepts: [], layout: 'free',
        visibility: 'public', owner: null, props: {}, group: null, parent: zone, segment: sg.id,
      });
    }
  }

  private piece(id: string) {
    const p = this.state.pieces[id];
    if (!p) throw new Error(`이미 없어진 컴포넌트예요 (${id}). 제거되거나 다른 것으로 바뀐 컴포넌트를 쓰고 있지 않은지 확인하세요`);
    return p;
  }

  private detach(id: string) {
    const p = this.piece(id);
    if (p.zone) {
      const list = this.state.contents[p.zone]!;
      list.splice(list.indexOf(id), 1);
      p.zone = null;
    }
  }

  private nextRandom() {
    let t = (this.state.rng = (this.state.rng + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  private playerIndex(id: string) {
    const i = this.def.players.findIndex((p) => p.id === id);
    if (i < 0) throw new Error(`없는 플레이어예요: ${id}`);
    return i;
  }

  // ------------------------------------------------------------------
  // primitives exposed to the Lua prelude
  // ------------------------------------------------------------------

  private primitives() {
    const def = this.def;
    return {
      setMode: (m: Mode) => {
        const prev = this.mode;
        this.mode = m;
        return prev;
      },
      source: (path: string) => lua(def.sources[path]),
      componentScripts: () => [...def.componentScripts],
      listenerScripts: () => [...def.listenerScripts],
      zoneScript: () => lua(def.zoneScript),
      log: (text: string) => {
        if (this.mode === 'sim') return;
        this.state.log.push(String(text));
        if (this.state.log.length > 300) this.state.log.shift();
      },

      // players
      players: () => def.players.map((p) => p.id),
      playerInfo: (id: string) => {
        const i = def.players.findIndex((p) => p.id === id);
        if (i < 0) return undefined;
        const p = def.players[i]!;
        return { name: p.name, index: i + 1, color: p.color };
      },
      current: () => this.state.current,
      setCurrent: (id: string) => {
        this.assertMutable('setCurrentPlayer');
        this.playerIndex(id);
        this.state.current = id;
      },
      playerAfter: (id: string) => def.players[(this.playerIndex(id) + 1) % def.players.length]!.id,
      nextPlayer: () => {
        this.assertMutable('nextPlayer');
        const n = def.players[(this.playerIndex(this.state.current) + 1) % def.players.length]!.id;
        this.state.current = n;
        return n;
      },

      // boards and zones
      firstBoard: () => def.boards[0]!.id,
      boardInfo: (id: string) => {
        const b = this.boardOf(id);
        return b ? { width: b.width, height: b.height, coords: b.coords } : undefined;
      },
      zoneInfo: (id: string) => {
        const z = this.zoneDef(id);
        if (!z) return undefined;
        return {
          name: z.name, x: lua(z.x), y: lua(z.y), tags: [...z.tags], board: z.board,
          owner: lua(z.owner), props: structuredClone(z.props), layout: z.layout, visibility: z.visibility,
          parent: lua(z.parent), segment: lua(z.segment),
        };
      },
      zoneAt: (board: string, x: number, y: number) => {
        const b = this.boardOf(board);
        if (!b || !Number.isInteger(x) || !Number.isInteger(y)) return undefined;
        if (b.coords === 'open') {
          const id = gridZoneId(board, x, y);
          return this.zoneDef(id) ? id : undefined;
        }
        if (x < 0 || y < 0 || x >= b.width || y >= b.height) return undefined;
        return lua(b.grid[y * b.width + x]);
      },
      addZone: (board: string, x: number, y: number) => {
        this.assertMutable('addZone');
        const b = this.boardOf(board);
        if (!b || b.coords !== 'open') throw new Error('칸을 더할 수 있는 건 coords: open 보드뿐이에요');
        if (!Number.isInteger(x) || !Number.isInteger(y)) throw new Error(`좌표는 정수여야 해요: ${x}, ${y}`);
        const id = gridZoneId(board, x, y);
        if (!this.zoneDef(id)) {
          this.addZone({
            id, board, x, y, name: `${x},${y}`, tags: [], accepts: [], layout: 'free', visibility: 'public',
            owner: null, props: {}, group: null, parent: null, segment: null,
          });
        }
        return id;
      },
      boardZones: (board: string) => [
        ...(this.boardOf(board)?.zones ?? []),
        ...Object.values(this.state.zones).filter((z) => z.board === board && !z.parent).map((z) => z.id),
      ],
      children: (zone: string) => Object.values(this.state.zones).filter((z) => z.parent === zone).map((z) => z.id),
      neighbors: (zone: string) => this.neighborsOf(zone),
      connected: (a: string, b: string) => this.neighborsOf(a).includes(b),
      zonesWithTag: (board: string, tag: string) =>
        [...(this.boardOf(board)?.zones ?? []), ...Object.keys(this.state.zones)]
          .filter((z) => this.zoneDef(z)!.board === board && this.zoneDef(z)!.tags.includes(tag)),
      zoneContents: (zone: string) => [...(this.state.contents[zone] ?? [])],
      playerZone: (name: string, player: string) => {
        const id = playerZoneId(name, player);
        return this.zoneDef(id) ? id : undefined;
      },
      shuffle: (zone: string) => {
        this.assertMutable('shuffle');
        const list = this.state.contents[zone];
        if (!list) throw new Error(`없는 존이에요: ${zone}`);
        for (let i = list.length - 1; i > 0; i--) {
          const j = Math.floor(this.nextRandom() * (i + 1));
          [list[i], list[j]] = [list[j]!, list[i]!];
        }
      },
      zoneAccepts: (zone: string, kind: string) => {
        const a = this.zoneDef(zone)?.accepts ?? [];
        return a.length === 0 || a.includes(kind);
      },

      // pieces
      pieceType: (id: string) => this.piece(id).type,
      pieceOwner: (id: string) => lua(this.piece(id).owner),
      pieceZone: (id: string) => lua(this.piece(id).zone),
      pieceLabel: (id: string) => this.pieceLabel(id),
      pieceTags: (id: string) => [...def.pieceTypes[this.piece(id).type]!.tags],
      pieceKind: (id: string) => def.pieceTypes[this.piece(id).type]!.kind,
      pieceFace: (id: string) => this.piece(id).face,
      pieceValue: (id: string) => {
        const pc = this.piece(id);
        const t = def.pieceTypes[pc.type]!;
        return lua(t.kind === 'die' ? t.faces[pc.side]?.value : undefined);
      },
      pieceText: (id: string) => def.pieceTypes[this.piece(id).type]!.text,
      pieceRot: (id: string) => this.piece(id).rot,
      tileInfo: (id: string) => {
        const info = this.tileInfo(id);
        return { edges: info.edges, segments: info.segments.map((sg) => ({ id: sg.id, kind: sg.kind, sides: [...sg.sides] })) };
      },
      rotate: (id: string, turns: number) => {
        this.assertMutable('rotate');
        const pc = this.piece(id);
        pc.rot = (((pc.rot + Math.round(turns)) % 4) + 4) % 4;
      },
      setRotation: (id: string, rot: number) => {
        this.assertMutable('rotate');
        this.piece(id).rot = ((Math.round(rot) % 4) + 4) % 4;
      },
      flip: (id: string, face?: string) => {
        this.assertMutable('flip');
        const pc = this.piece(id);
        pc.face = face === 'up' || face === 'down' ? face : pc.face === 'up' ? 'down' : 'up';
      },
      rollDie: (id: string) => {
        this.assertMutable('roll');
        const pc = this.piece(id);
        const t = def.pieceTypes[pc.type]!;
        if (t.kind !== 'die') throw new Error(`주사위가 아니에요: ${pc.type}`);
        pc.side = Math.floor(this.nextRandom() * t.faces.length);
        return lua(t.faces[pc.side]!.value);
      },
      pieceExists: (id: string) => !!this.state.pieces[id],
      pieces: (type?: string, owner?: string, kind?: string) =>
        Object.values(this.state.pieces)
          .filter((p) => (!type || p.type === type) && (!owner || p.owner === owner) && p.zone !== null
            && (!kind || def.pieceTypes[p.type]!.kind === kind))
          .map((p) => p.id),
      getProp: (id: string, k: string) => {
        const pc = this.piece(id);
        return lua(k in pc.props ? pc.props[k] : def.pieceTypes[pc.type]!.props[k]);
      },
      setProp: (id: string, k: string, v: Json) => {
        this.assertMutable('piece.props');
        if (v === undefined) delete this.piece(id).props[k];
        else this.piece(id).props[k] = v;
      },
      create: (type: string, owner: string | undefined, zone: string) => {
        this.assertMutable('create');
        return this.createPiece(type, owner ?? null, zone);
      },
      move: (id: string, zone: string, where?: string) => {
        this.assertMutable('move');
        if (!this.zoneDef(zone)) throw new Error(`없는 존이에요: ${zone}`);
        this.detach(id);
        this.piece(id).zone = zone;
        if (where === 'bottom') this.state.contents[zone]!.unshift(id);
        else this.state.contents[zone]!.push(id);
        this.afterPlace(id, zone);
      },
      remove: (id: string) => {
        this.assertMutable('remove');
        this.detach(id);
        delete this.state.pieces[id];
      },

      // vars
      getVar: (scope: string, k: string) => lua((scope ? this.state.playerVars[scope] : this.state.vars)?.[k]),
      setVar: (scope: string, k: string, v: Json) => {
        this.assertMutable(scope ? 'player.vars' : 'game.vars');
        const t = scope ? this.state.playerVars[scope] : this.state.vars;
        if (!t) throw new Error(`없는 플레이어예요: ${scope}`);
        if (v === undefined) delete t[k];
        else t[k] = v;
      },

      // flow
      roll: (sides: number) => {
        this.assertMutable('roll');
        return 1 + Math.floor(this.nextRandom() * sides);
      },
      choose: (playerId: string, options: Json[], labels: string[], prompt: string) => {
        if (this.mode !== 'effect') throw new Error('판정 스크립트나 simulate 안에서는 choose를 쓸 수 없어요');
        if (this.answerIdx < this.answers.length) return lua(this.answers[this.answerIdx++]);
        this.pendingChoose = {
          kind: 'choose', player: playerId, prompt,
          options: arr<Json>(options).map((v, i) => ({ value: v, label: arr<string>(labels)[i] ?? '', ref: refOf(v) })),
        };
        throw new Error(NEED_INPUT);
      },
      win: (playerId: string | undefined, reason: string) => {
        this.assertMutable('win');
        if (this.mode === 'sim') return;
        this.state.result ??= { winner: playerId ?? null, reason };
      },
      isOver: () => !!this.state.result,
      simulate: (fn: () => unknown) => {
        const saved = clone(this.state);
        const prev = this.mode;
        this.mode = 'sim';
        try {
          return lua(fn());
        } finally {
          this.state = saved;
          this.mode = prev;
        }
      },
    };
  }
}

/** Rebuild a game by replaying inputs from scratch (same seed, same result). */
export async function replay(def: GameDef, seed: number, inputs: Input[], opts: EngineOptions = {}) {
  // the log already holds the script players' answers, so don't let them answer again
  const e = await Engine.create(def, { ...opts, seed, autoplay: false });
  for (const i of inputs) {
    if (e.error || !e.pending) break;
    e.input(i);
  }
  e.setAutoplay(opts.autoplay !== false);
  return e;
}
