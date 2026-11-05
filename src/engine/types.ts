// Shared types for the engine. Everything in GameState must stay plain JSON
// so it can be snapshotted (structuredClone) for rollback, undo and replay.

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

// ---------- definitions (loaded from yaml, immutable at runtime) ----------

export interface PlayerDef {
  id: string;
  name: string;
  color: string;
}

export type ComponentKind = 'piece' | 'card' | 'die';

export interface DieFace {
  label: string;
  value: Json;
}

export interface PieceTypeDef {
  id: string;
  kind: ComponentKind;
  /** Label shown on the component. Either one label, or one per player id. */
  label: string | Record<string, string>;
  /** Card back label (cards only). */
  back: string;
  /** Rules text shown on a card. */
  text: string;
  tags: string[];
  /** Static properties (cost, value...). component.props falls back to these. */
  props: Record<string, Json>;
  /** Die faces (dice only). */
  faces: DieFace[];
}

export type Visibility = 'public' | 'owner' | 'hidden' | 'topOnly';

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
  visibility: Visibility;
  /** Player who owns this zone (per-player zones such as hands). */
  owner: string | null;
  /** Static zone properties from board.yaml (prices, colours...). */
  props: Record<string, Json>;
  /** Display group for off-grid zones. */
  group: string | null;
}

export interface BoardDef {
  id: string;
  coords: 'square' | 'track' | 'none';
  width: number;
  height: number;
  /** How the grid is drawn: as cells (chess) or as line intersections (janggi). */
  style: 'cells' | 'points' | 'ring';
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
  /** Action nodes: available anywhere inside the loop that holds them. */
  common: boolean;
  /** Common actions not offered while waiting at this node. */
  exclude: string[];
  /** Action nodes: at most `count` uses until the node `per` is entered again. */
  limit: { count: number; per: string } | null;
}

export interface LoopDef {
  start: string;
  nodes: Record<string, NodeDef>;
  edges: [string, string][];
  /** node id -> outgoing node ids */
  out: Record<string, string[]>;
  /** Common action node ids of this loop. */
  common: string[];
}

export interface SetupEntry {
  type: string;
  owner: string | null;
  zone: string;
  count: number;
}

export interface DisplayVar {
  key: string;
  label: string;
}

export interface GameDef {
  name: string;
  players: PlayerDef[];
  /** All component types (pieces, cards, dice) by id. */
  pieceTypes: Record<string, PieceTypeDef>;
  /** Variables shown in the side panel. */
  display: { player: DisplayVar[]; game: DisplayVar[] };
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
  face: 'up' | 'down';
  /** Index of the die face showing (dice only). */
  side: number;
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
  /** Uses of limited actions: "actionPath" -> count, cleared when its `per` node is entered. */
  uses: Record<string, number>;
  /** Where to return after a common action. */
  returnTo: string[] | null;
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
