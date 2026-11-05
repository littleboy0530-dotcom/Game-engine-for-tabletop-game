// Shared types for the engine. Everything in GameState must stay plain JSON
// so it can be snapshotted (structuredClone) for rollback, undo and replay.

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

// ---------- definitions (loaded from yaml, immutable at runtime) ----------

export interface PlayerDef {
  id: string;
  name: string;
  color: string;
}

export interface PieceTypeDef {
  id: string;
  /** Label shown on the piece. Either one label, or one per player id. */
  label: string | Record<string, string>;
  tags: string[];
}

export interface ZoneDef {
  id: string;
  board: string;
  /** Grid coordinates, or null for off-grid zones (trays, hands, decks). */
  x: number | null;
  y: number | null;
  name: string;
  tags: string[];
  /** Component kinds this zone accepts (phase 1: "piece"). Empty = anything. */
  accepts: string[];
  layout: 'free' | 'pile' | 'row';
}

export interface BoardDef {
  id: string;
  coords: 'square' | 'none';
  width: number;
  height: number;
  /** How the grid is drawn: as cells (chess) or as line intersections (janggi). */
  style: 'cells' | 'points';
  zones: string[];
  /** Zones in grid order, index = y * width + x. */
  grid: (string | null)[];
  /** zone id -> neighbour zone ids (the board graph's edges). */
  neighbors: Record<string, string[]>;
  /** Edges to draw (for 'points' boards these are the lines). */
  edges: [string, string][];
}

export type NodeType = 'start' | 'end' | 'phase' | 'action' | 'loop';

export interface NodeDef {
  id: string;
  type: NodeType;
  label: string;
  script: string | null;
  pos: [number, number] | null;
  loop: LoopDef | null;
}

export interface LoopDef {
  start: string;
  nodes: Record<string, NodeDef>;
  edges: [string, string][];
  /** node id -> outgoing node ids */
  out: Record<string, string[]>;
}

export interface SetupEntry {
  type: string;
  owner: string | null;
  zone: string;
}

export interface GameDef {
  name: string;
  players: PlayerDef[];
  pieceTypes: Record<string, PieceTypeDef>;
  boards: BoardDef[];
  zones: Record<string, ZoneDef>;
  loop: LoopDef;
  setup: SetupEntry[];
  /** Lua scripts by path relative to the game folder. */
  sources: Record<string, string>;
  /** Optional script with per-piece-type functions (moveCandidates). */
  pieceScript: string | null;
  /** Optional script with per-zone-tag functions (canAccept). */
  zoneScript: string | null;
}

// ---------- runtime state ----------

export interface PieceState {
  id: string;
  type: string;
  owner: string | null;
  zone: string | null;
  props: Record<string, Json>;
}

export type Stage = 'enter' | 'execute' | 'after';

export interface Cursor {
  /** Node path through nested loops, e.g. ["turnLoop", "move"]. */
  path: string[];
  stage: Stage;
  /** For stage 'execute': the chosen option of the action node. */
  option: Json;
  /** Answers given to `choose` calls inside the current script run. */
  answers: Json[];
}

export interface Result {
  winner: string | null;
  reason: string;
}

export interface GameState {
  rng: number;
  nextId: number;
  pieces: Record<string, PieceState>;
  /** zone id -> piece ids in order (bottom first) */
  contents: Record<string, string[]>;
  vars: Record<string, Json>;
  playerVars: Record<string, Record<string, Json>>;
  current: string;
  cursor: Cursor;
  /** Node transitions since the last player input. */
  idle: number;
  /** Recent node paths visited without input (for the loop-limit report). */
  trail: string[];
  result: Result | null;
  finished: boolean;
  log: string[];
}

// ---------- requests to the UI ----------

export interface Ref {
  kind: 'piece' | 'zone' | 'player';
  id: string;
}

export interface OptionView {
  value: Json;
  label: string;
  ref: Ref | null;
}

export interface ActionView {
  /** Full node path of the action node. */
  path: string[];
  label: string;
  options: OptionView[];
}

export type Pending =
  | { kind: 'action'; player: string; actions: ActionView[] }
  | { kind: 'choose'; player: string; prompt: string; options: OptionView[] };

export type Input =
  | { kind: 'action'; node: string; option: number }
  | { kind: 'choose'; option: number };

export interface EngineError {
  message: string;
  /** Node path where it happened, if inside the loop. */
  path: string[] | null;
  /** For loop-limit errors: the nodes that kept repeating. */
  trail?: string[];
}
