// Visual editor for the loop graph: add, move, connect and delete nodes, and pick what each node does.
import { useEffect, useMemo, useState } from 'react';
import {
  ReactFlow, Background, Controls, Handle, MarkerType, Position, applyNodeChanges,
  type Connection, type Edge, type Node, type NodeChange, type NodeProps, type ReactFlowInstance,
} from '@xyflow/react';
import type { TabProps } from './Forms';
import {
  ACTION_RECIPES, STEP_RECIPES, actionScript, hasRecipeHeader, phaseScript, readRecipe,
  type ActionConfig, type Param, type PhaseConfig, type RecipeContext,
} from './recipes';
import { asList, asMap, freshId, readDoc, writeDoc, type Doc } from './yamlDoc';

const TYPE_NAME: Record<string, string> = { start: '시작', end: '끝', phase: '페이즈', action: 'Action', loop: '하위 루프' };

type EdNodeData = { label: string; type: string; common: boolean };

function EdNode({ data, selected }: NodeProps<Node<EdNodeData>>) {
  return (
    <div className={`loop-node loop-node-${data.type}${data.common ? ' is-common' : ''}${selected ? ' is-active' : ''}`}>
      <Handle id="in" type="target" position={Position.Left} />
      <Handle id="back-in" type="target" position={Position.Bottom} className="hidden-handle" isConnectable={false} />
      {data.type !== 'start' && data.type !== 'end' && <span className="loop-node-kind">{data.common ? '공통 Action' : TYPE_NAME[data.type]}</span>}
      <span className="loop-node-label">{data.type === 'start' ? '시작' : data.type === 'end' ? '끝' : data.label}</span>
      <Handle id="out" type="source" position={Position.Right} />
      <Handle id="back-out" type="source" position={Position.Bottom} className="hidden-handle" isConnectable={false} />
    </div>
  );
}
const nodeTypes = { ed: EdNode };

function loopAt(root: Doc, path: string[]): Doc {
  let l = root;
  for (const id of path) l = asMap(asMap(asMap(l.nodes)[id]).loop);
  return l;
}

function setLoopAt(root: Doc, path: string[], next: Doc): Doc {
  if (!path.length) return next;
  const [head, ...rest] = path;
  const nodes = asMap(root.nodes);
  const node = asMap(nodes[head!]);
  return { ...root, nodes: { ...nodes, [head!]: { ...node, loop: setLoopAt(asMap(node.loop), rest, next) } } };
}

function allIds(l: Doc, out: string[] = []): string[] {
  for (const [id, n] of Object.entries(asMap(l.nodes))) {
    out.push(id);
    const sub = asMap(n).loop;
    if (sub && typeof sub === 'object') allIds(sub as Doc, out);
  }
  return out;
}

export function LoopEditor({ files, setFiles }: TabProps) {
  const root = readDoc(files, 'loop.yaml');
  const [path, setPath] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [flow, setFlow] = useState<ReactFlowInstance<Node<EdNodeData>, Edge> | null>(null);
  const loop = root ? loopAt(root, path) : {};
  const nodesDoc = asMap(loop.nodes);
  const edges = asList<string[]>(loop.edges);

  const g = readDoc(files, 'game.yaml') ?? {};
  const b = readDoc(files, 'board.yaml') ?? {};
  const ctx: RecipeContext = {
    zones: asList<Doc>(b.zones).map((z) => ({ id: String(z.id), name: String(z.name ?? z.id), perPlayer: !!z.perPlayer })),
  };

  /** Save the loop (and optionally other files) in one change. */
  const commit = (nextLoop: Doc, extra: Record<string, string | null> = {}) => {
    if (!root) return;
    const out: Record<string, string> = { ...files, 'loop.yaml': writeDoc(setLoopAt(root, path, nextLoop)) };
    for (const [p, text] of Object.entries(extra)) {
      if (text === null) delete out[p];
      else out[p] = text;
    }
    setFiles(out);
  };

  // React Flow keeps positions while dragging; we save them when a drag ends
  const derived: Node<EdNodeData>[] = useMemo(() => Object.entries(nodesDoc).map(([id, raw], i) => {
    const n = asMap(raw);
    const pos = asList<number>(n.pos);
    return {
      id, type: 'ed', selected: id === selected,
      position: pos.length === 2 ? { x: pos[0]!, y: pos[1]! } : { x: i * 160, y: 100 },
      data: { label: String(n.label ?? id), type: String(n.type ?? 'phase'), common: !!n.common },
    };
  }), [files, path, selected]); // eslint-disable-line react-hooks/exhaustive-deps
  const [rfNodes, setRfNodes] = useState(derived);
  useEffect(() => setRfNodes(derived), [derived]);

  const xOf = (id: string) => asList<number>(asMap(nodesDoc[id]).pos)[0] ?? 0;
  const rfEdges: Edge[] = edges.map(([a, bb]) => {
    // edges going back (right to left) run underneath the graph
    const back = xOf(bb!) <= xOf(a!);
    return {
      id: `${a}->${bb}`, source: a!, target: bb!,
      sourceHandle: back ? 'back-out' : 'out', targetHandle: back ? 'back-in' : 'in',
      type: back ? 'smoothstep' : 'default',
      pathOptions: back ? { offset: 28, borderRadius: 12 } : undefined,
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
      className: back ? 'loop-edge is-back' : 'loop-edge',
    };
  });

  if (!root) {
    return <div className="error-box"><strong>loop.yaml의 문법이 깨져 있어서 이 화면에서 고칠 수 없어요.</strong><span>파일 탭에서 고쳐 주세요.</span></div>;
  }

  const addNode = (type: 'phase' | 'action' | 'loop' | 'end') => {
    const id = freshId(type === 'end' ? 'end' : type, allIds(root));
    // below the existing nodes, near the middle, so it is on screen
    const ps = Object.values(nodesDoc).map((n) => asList<number>(asMap(n).pos));
    const xs = ps.map((q) => q[0] ?? 0), ys = ps.map((q) => q[1] ?? 0);
    const midX = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0;
    const pos = [Math.round(midX), Math.round((ys.length ? Math.max(...ys) : 0) + 110)];
    const node: Doc = { type, label: type === 'end' ? '끝' : `새 ${TYPE_NAME[type]}`, pos };
    const extra: Record<string, string> = {};
    if (type === 'phase' || type === 'action') {
      node.script = `loop/${id}.lua`;
      extra[node.script] = type === 'phase'
        ? phaseScript({ kind: 'phase', steps: [] }, ctx)
        : actionScript({ kind: 'action', id: 'pass', values: {} }, ctx);
    }
    if (type === 'loop') {
      node.loop = { nodes: { start: { type: 'start', pos: [0, 100] }, end: { type: 'end', pos: [320, 100] } }, edges: [['start', 'end']] };
    }
    commit({ ...loop, nodes: { ...nodesDoc, [id]: node } }, extra);
    setSelected(id);
    setTimeout(() => flow?.fitView({ padding: 0.2, duration: 200 }), 50);
  };

  /** After the exits of a phase change, fill in its branch (game over / otherwise) if it uses a recipe. */
  const withBranch = (source: string, nextEdges: string[][]): Record<string, string> => {
    const n = asMap(nodesDoc[source]);
    if (n.type !== 'phase' || !n.script) return {};
    const config = readRecipe(files[n.script], ctx);
    if (!config || config.kind !== 'phase') return {};
    const outs = nextEdges.filter(([a]) => a === source).map(([, t]) => t!);
    if (outs.length < 2) return { [n.script]: phaseScript({ ...config, whenOver: undefined, otherwise: undefined }, ctx) };
    const endish = outs.find((t) => asMap(nodesDoc[t]).type === 'end');
    const whenOver = config.whenOver && outs.includes(config.whenOver) ? config.whenOver : endish ?? outs[0]!;
    const otherwise = config.otherwise && outs.includes(config.otherwise) && config.otherwise !== whenOver
      ? config.otherwise : outs.find((t) => t !== whenOver)!;
    return { [n.script]: phaseScript({ ...config, whenOver, otherwise }, ctx) };
  };

  const onConnect = (c: Connection) => {
    if (!c.source || !c.target || c.source === c.target) return;
    if (edges.some(([a, t]) => a === c.source && t === c.target)) return;
    const next = [...edges, [c.source, c.target]];
    commit({ ...loop, edges: next }, withBranch(c.source, next));
  };

  const removeEdges = (ids: string[]) => {
    const next = edges.filter(([a, t]) => !ids.includes(`${a}->${t}`));
    const sources = new Set(edges.filter(([a, t]) => ids.includes(`${a}->${t}`)).map(([a]) => a!));
    let extra: Record<string, string> = {};
    for (const s of sources) extra = { ...extra, ...withBranch(s, next) };
    commit({ ...loop, edges: next }, extra);
  };

  const removeNode = (id: string) => {
    const n = asMap(nodesDoc[id]);
    if (n.type === 'start') return;
    const { [id]: _, ...rest } = nodesDoc;
    const extra: Record<string, string | null> = {};
    if (n.script && hasRecipeHeader(files[n.script])) extra[n.script] = null;
    commit({ ...loop, nodes: rest, edges: edges.filter(([a, t]) => a !== id && t !== id) }, extra);
    setSelected(null);
  };

  const onNodesChange = (changes: NodeChange<Node<EdNodeData>>[]) => {
    setRfNodes((ns) => applyNodeChanges(changes, ns));
    const removed = changes.filter((c) => c.type === 'remove').map((c) => c.id);
    if (removed.length === 1) removeNode(removed[0]!);
  };

  // breadcrumb
  const crumbs: { label: string; path: string[] }[] = [{ label: '전체', path: [] }];
  let cur: Doc = root;
  path.forEach((id, i) => {
    crumbs.push({ label: String(asMap(asMap(cur.nodes)[id]).label ?? id), path: path.slice(0, i + 1) });
    cur = asMap(asMap(asMap(cur.nodes)[id]).loop);
  });

  const sel = selected && nodesDoc[selected] ? selected : null;

  return (
    <div className="loop-editor">
      <div className="loop-editor-main">
        <div className="loop-crumbs">
          {crumbs.map((c, i) => (
            <span key={i}>
              {i > 0 && <span className="crumb-sep">›</span>}
              <button className={`crumb${i === crumbs.length - 1 ? ' is-current' : ''}`} onClick={() => { setPath(c.path); setSelected(null); }}>{c.label}</button>
            </span>
          ))}
        </div>
        <div className="row toolbar">
          <span className="muted">노드 더하기:</span>
          <button className="btn btn-small" onClick={() => addNode('phase')}>+ 페이즈</button>
          <button className="btn btn-small" onClick={() => addNode('action')}>+ Action</button>
          <button className="btn btn-small" onClick={() => addNode('loop')}>+ 하위 루프</button>
          <button className="btn btn-small" onClick={() => addNode('end')}>+ 끝</button>
        </div>
        <p className="muted hint">노드 오른쪽 점을 끌어서 다른 노드에 놓으면 연결돼요. 연결이나 노드를 누르고 Delete 키를 누르면 지워져요.</p>
        <div className="loop-graph edit">
          <ReactFlow
            key={path.join('/')}
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onNodeDragStop={(_, n) => commit({ ...loop, nodes: { ...nodesDoc, [n.id]: { ...asMap(nodesDoc[n.id]), pos: [Math.round(n.position.x), Math.round(n.position.y)] } } })}
            onNodeClick={(_, n) => setSelected(n.id)}
            onPaneClick={() => setSelected(null)}
            onConnect={onConnect}
            onEdgesDelete={(es) => removeEdges(es.map((e) => e.id))}
            deleteKeyCode={['Delete', 'Backspace']}
            onInit={setFlow}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={20} size={1} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      </div>
      <aside className="loop-editor-side card">
        {sel ? (
          <NodePanel
            key={sel}
            id={sel}
            node={asMap(nodesDoc[sel])}
            outs={edges.filter(([a]) => a === sel).map(([, t]) => t!)}
            nodesDoc={nodesDoc}
            allNodeIds={allIds(root)}
            files={files}
            game={g}
            ctx={ctx}
            onNode={(patch, extra) => commit({ ...loop, nodes: { ...nodesDoc, [sel]: { ...asMap(nodesDoc[sel]), ...patch } } }, extra)}
            onEnter={() => { setPath([...path, sel]); setSelected(null); }}
            onDelete={() => removeNode(sel)}
          />
        ) : (
          <div className="muted">
            <p><strong>노드를 누르면</strong> 여기서 이름과 하는 일을 정할 수 있어요.</p>
            <p>페이즈는 자동으로 진행되고, Action은 플레이어가 골라야 들어가요.</p>
          </div>
        )}
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------- node panel

interface PanelProps {
  id: string;
  node: Doc;
  outs: string[];
  nodesDoc: Doc;
  allNodeIds: string[];
  files: Record<string, string>;
  game: Doc;
  ctx: RecipeContext;
  onNode: (patch: Doc, extra?: Record<string, string | null>) => void;
  onEnter: () => void;
  onDelete: () => void;
}

function NodePanel({ id, node, outs, nodesDoc, allNodeIds, files, game, ctx, onNode, onEnter, onDelete }: PanelProps) {
  const type = String(node.type ?? 'phase');
  const script = node.script ? String(node.script) : null;
  const config = script ? readRecipe(files[script], ctx) : null;
  const handEdited = !!script && files[script] !== undefined && !config;
  const writeScript = (text: string) => onNode({}, { [script!]: text });
  const label = (n: string) => (asMap(nodesDoc[n]).type === 'end' ? '끝' : String(asMap(nodesDoc[n]).label ?? n));

  return (
    <div className="node-panel">
      <div className="row">
        <strong>{TYPE_NAME[type]}</strong>
        <span className="muted">{id}</span>
        {type !== 'start' && <button className="btn btn-small" onClick={onDelete}>노드 지우기</button>}
      </div>
      {type !== 'start' && type !== 'end' && (
        <label className="field">
          <span>이름</span>
          <input value={String(node.label ?? '')} onChange={(e) => onNode({ label: e.target.value })} />
        </label>
      )}

      {type === 'loop' && <button className="btn" onClick={onEnter}>하위 루프 안으로 들어가서 편집</button>}

      {type === 'action' && (
        <>
          <label className="check">
            <input type="checkbox" checked={!!node.common} onChange={(e) => onNode({ common: e.target.checked || undefined })} />
            공통 Action (연결 없이 이 루프 어디서든 쓸 수 있음)
          </label>
          <div className="row">
            <label className="check">
              <input type="checkbox" checked={!!node.limit} onChange={(e) => onNode({ limit: e.target.checked ? { count: 1, per: allNodeIds[0] } : undefined })} />
              횟수 제한
            </label>
            {node.limit && (
              <>
                <input className="narrow" type="number" min={1} value={Number(asMap(node.limit).count ?? 1)} onChange={(e) => onNode({ limit: { ...asMap(node.limit), count: Number(e.target.value) } })} />
                <span>번, 다시 들어갈 때까지:</span>
                <select value={String(asMap(node.limit).per ?? '')} onChange={(e) => onNode({ limit: { ...asMap(node.limit), per: e.target.value } })}>
                  {allNodeIds.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </>
            )}
          </div>
        </>
      )}

      {(type === 'phase' || type === 'action') && script && (
        <>
          <h4>하는 일</h4>
          {handEdited ? (
            <div className="note">
              <p>이 노드의 스크립트({script})는 직접 고친 코드예요. 파일 탭에서 볼 수 있어요.</p>
              <button className="btn btn-small" onClick={() => writeScript(type === 'phase'
                ? phaseScript({ kind: 'phase', steps: [] }, ctx)
                : actionScript({ kind: 'action', id: 'pass', values: {} }, ctx))}>
                설정 화면으로 다시 만들기 (지금 코드는 지워져요)
              </button>
            </div>
          ) : type === 'action' ? (
            <ActionForm config={(config as ActionConfig) ?? { kind: 'action', id: 'pass', values: {} }} game={game} ctx={ctx}
              onChange={(c) => writeScript(actionScript(c, ctx))} />
          ) : (
            <PhaseForm config={(config as PhaseConfig) ?? { kind: 'phase', steps: [] }} outs={outs} label={label} game={game} ctx={ctx}
              onChange={(c) => writeScript(phaseScript(c, ctx))} />
          )}
        </>
      )}
      {type === 'phase' && !script && (
        <button className="btn btn-small" onClick={() => onNode({ script: `loop/${id}.lua` }, { [`loop/${id}.lua`]: phaseScript({ kind: 'phase', steps: [] }, ctx) })}>
          이 페이즈에 할 일 정하기
        </button>
      )}
    </div>
  );
}

function ParamInput({ p, value, game, ctx, onChange }: { p: Param; value: string; game: Doc; ctx: RecipeContext; onChange: (v: string) => void }) {
  const types = (key: string) => Object.keys(asMap(game[key]));
  let options: { value: string; label: string }[] | null = null;
  if (p.kind === 'pieceType') options = types('pieceTypes').map((t) => ({ value: t, label: t }));
  if (p.kind === 'cardType') options = types('cardTypes').map((t) => ({ value: t, label: t }));
  if (p.kind === 'dieType') options = types('diceTypes').map((t) => ({ value: t, label: t }));
  if (p.kind === 'zone') options = ctx.zones.map((z) => ({ value: z.id, label: `${z.name}${z.perPlayer ? ' (내 것)' : ''}` }));
  return (
    <label className="field small">
      <span>{p.label}</span>
      {options ? (
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">고르세요</option>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <input type={p.kind === 'number' ? 'number' : 'text'} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  );
}

const defaults = (params: Param[]) => Object.fromEntries(params.map((p) => [p.key, p.default !== undefined ? String(p.default) : '']));

function ActionForm({ config, game, ctx, onChange }: { config: ActionConfig; game: Doc; ctx: RecipeContext; onChange: (c: ActionConfig) => void }) {
  const recipe = ACTION_RECIPES.find((r) => r.id === config.id) ?? ACTION_RECIPES[0]!;
  return (
    <div className="recipe">
      <select aria-label="Action이 하는 일" value={recipe.id} onChange={(e) => {
        const r = ACTION_RECIPES.find((x) => x.id === e.target.value)!;
        onChange({ kind: 'action', id: r.id, values: defaults(r.params) });
      }}>
        {ACTION_RECIPES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
      </select>
      <p className="muted">{recipe.help}</p>
      {recipe.params.map((p) => (
        <ParamInput key={p.key} p={p} value={config.values[p.key] ?? ''} game={game} ctx={ctx}
          onChange={(v) => onChange({ ...config, values: { ...config.values, [p.key]: v } })} />
      ))}
    </div>
  );
}

function PhaseForm({ config, outs, label, game, ctx, onChange }: {
  config: PhaseConfig; outs: string[]; label: (id: string) => string; game: Doc; ctx: RecipeContext; onChange: (c: PhaseConfig) => void;
}) {
  const [adding, setAdding] = useState('');
  const steps = config.steps;
  const setSteps = (s: PhaseConfig['steps']) => onChange({ ...config, steps: s });
  return (
    <div className="recipe">
      <p className="muted">이 페이즈에 들어오면 아래 일을 차례대로 해요.</p>
      <ol className="steps">
        {steps.map((st, i) => {
          const r = STEP_RECIPES.find((x) => x.id === st.id);
          return (
            <li key={i} className="step">
              <div className="row">
                <strong>{r?.label ?? st.id}</strong>
                <button className="btn btn-small" disabled={i === 0} onClick={() => setSteps(steps.map((x, j) => (j === i - 1 ? steps[i]! : j === i ? steps[i - 1]! : x)))} aria-label="위로">↑</button>
                <button className="btn btn-small" disabled={i === steps.length - 1} onClick={() => setSteps(steps.map((x, j) => (j === i ? steps[i + 1]! : j === i + 1 ? steps[i]! : x)))} aria-label="아래로">↓</button>
                <button className="btn btn-small" onClick={() => setSteps(steps.filter((_, j) => j !== i))} aria-label="빼기">✕</button>
              </div>
              {r?.params.map((p) => (
                <ParamInput key={p.key} p={p} value={st.values[p.key] ?? ''} game={game} ctx={ctx}
                  onChange={(v) => setSteps(steps.map((x, j) => (j === i ? { ...x, values: { ...x.values, [p.key]: v } } : x)))} />
              ))}
            </li>
          );
        })}
      </ol>
      <div className="row">
        <select aria-label="할 일 더하기" value={adding} onChange={(e) => setAdding(e.target.value)}>
          <option value="">할 일 고르기</option>
          {STEP_RECIPES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
        <button className="btn btn-small" disabled={!adding} onClick={() => {
          const r = STEP_RECIPES.find((x) => x.id === adding)!;
          setSteps([...steps, { id: r.id, values: defaults(r.params) }]);
          setAdding('');
        }}>+ 더하기</button>
      </div>
      {adding && <p className="muted">{STEP_RECIPES.find((x) => x.id === adding)?.help}</p>}

      {outs.length >= 2 && (
        <div className="branch">
          <h4>다음에 갈 곳</h4>
          <label className="field small">
            <span>게임이 끝났으면</span>
            <select value={config.whenOver ?? ''} onChange={(e) => onChange({ ...config, whenOver: e.target.value })}>
              {outs.map((o) => <option key={o} value={o}>{label(o)}</option>)}
            </select>
          </label>
          <label className="field small">
            <span>아니면</span>
            <select value={config.otherwise ?? ''} onChange={(e) => onChange({ ...config, otherwise: e.target.value })}>
              {outs.map((o) => <option key={o} value={o}>{label(o)}</option>)}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}
