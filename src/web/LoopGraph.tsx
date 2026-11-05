import { useMemo, useState } from 'react';
import { ReactFlow, Background, Handle, MarkerType, Position, type Edge, type Node, type NodeProps } from '@xyflow/react';
import type { LoopDef, NodeType } from '../engine';

interface Props {
  loop: LoopDef;
  /** Full path of the current node, through nested loops. */
  current: string[];
  waiting: boolean;
  finished: boolean;
  errorAt: string[] | null;
  trail: string[] | undefined;
  /** Full paths ("a/b/c") of the actions the player can pick right now. */
  available: Set<string>;
}

type LoopNodeData = {
  label: string; type: NodeType; common: boolean;
  active: boolean; inside: boolean; waiting: boolean; error: boolean; trail: boolean;
  /** An action offered at this moment, or one that is connected but not allowed now. */
  offer: 'yes' | 'no' | null;
};

const TYPE_NAME: Record<NodeType, string> = {
  start: '시작', end: '끝', phase: '페이즈', action: 'Action', loop: '하위 루프',
};

function LoopNode({ data }: NodeProps<Node<LoopNodeData>>) {
  const cls = [
    'loop-node', `loop-node-${data.type}`, data.common ? 'is-common' : '',
    data.active ? 'is-active' : '', data.inside ? 'is-inside' : '', data.active && data.waiting ? 'is-waiting' : '',
    data.error ? 'is-error' : '', data.trail ? 'is-trail' : '',
    data.offer === 'yes' ? 'is-offered' : data.offer === 'no' ? 'is-unavailable' : '',
  ].join(' ');
  const kind = data.common ? '공통 Action' : TYPE_NAME[data.type];
  return (
    <div className={cls} title={data.type === 'loop' ? '눌러서 안으로 들어가기' : kind}>
      <Handle id="in" type="target" position={Position.Left} />
      <Handle id="back-in" type="target" position={Position.Bottom} />
      {data.type !== 'start' && data.type !== 'end' && <span className="loop-node-kind">{kind}</span>}
      <span className="loop-node-label">{data.type === 'start' ? '시작' : data.type === 'end' ? '끝' : data.label}</span>
      <Handle id="out" type="source" position={Position.Right} />
      <Handle id="back-out" type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes = { loop: LoopNode };

function loopAt(root: LoopDef, prefix: string[]): LoopDef | null {
  let l: LoopDef | undefined = root;
  for (const id of prefix) {
    l = l?.nodes[id]?.loop ?? undefined;
    if (!l) return null;
  }
  return l;
}

const startsWith = (path: string[], prefix: string[]) => prefix.every((id, i) => path[i] === id);

export function LoopGraph({ loop: root, current, waiting, finished, errorAt, trail, available }: Props) {
  /** A loop level the user opened; null = follow the current position. */
  const [pinned, setPinned] = useState<string[] | null>(null);
  const following = pinned === null;
  const prefix = pinned ?? current.slice(0, -1);
  const loop = loopAt(root, prefix) ?? root;
  const shownPrefix = loopAt(root, prefix) ? prefix : [];

  // the node of this level that is (or contains) the current position
  const here = startsWith(current, shownPrefix) ? current[shownPrefix.length] : undefined;
  const errHere = errorAt && startsWith(errorAt, shownPrefix) ? errorAt[shownPrefix.length] : undefined;
  const trailSet = useMemo(
    () => new Set((trail ?? []).map((t) => t.split(' / ')).filter((p) => startsWith(p, shownPrefix)).map((p) => p[shownPrefix.length])),
    [trail, shownPrefix],
  );

  const ids = Object.keys(loop.nodes);
  const waitingHere = waiting && !finished && current.length === shownPrefix.length + 1 && here !== undefined;
  const offered = (id: string) => available.has([...shownPrefix, id].join('/'));
  const connectedFromHere = new Set(here && waitingHere ? loop.out[here] ?? [] : []);
  const position = (id: string) => {
    const n = loop.nodes[id]!;
    return n.pos ? { x: n.pos[0], y: n.pos[1] } : { x: ids.indexOf(id) * 170, y: (ids.indexOf(id) % 2) * 90 };
  };

  const nodes: Node<LoopNodeData>[] = ids.map((id) => {
    const n = loop.nodes[id]!;
    const deeper = here === id && current.length > shownPrefix.length + 1;
    return {
      id,
      type: 'loop',
      position: position(id),
      data: {
        label: n.label, type: n.type, common: n.common,
        active: here === id && !errHere && !deeper,
        inside: deeper && !errHere,
        waiting: waiting && !finished,
        error: errHere === id,
        trail: trailSet.has(id),
        offer: n.type === 'action' && waitingHere && (connectedFromHere.has(id) || n.common)
          ? (offered(id) ? 'yes' : 'no') : null,
      },
      draggable: false,
      selectable: false,
    };
  });

  const edges: Edge[] = loop.edges.map(([a, b], i) => {
    const hot = waitingHere && here === a && loop.nodes[b]!.type === 'action' && offered(b);
    const back = position(b).x <= position(a).x;
    return {
      id: `e${i}`,
      source: a,
      target: b,
      sourceHandle: back ? 'back-out' : 'out',
      targetHandle: back ? 'back-in' : 'in',
      type: back ? 'smoothstep' : 'default',
      pathOptions: back ? { offset: 28, borderRadius: 12 } : undefined,
      animated: hot,
      className: ['loop-edge', hot ? 'is-hot' : '', back ? 'is-back' : ''].join(' '),
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
    };
  });

  // breadcrumb: 전체 > 한 판 > 베팅 라운드
  const crumbs: { label: string; prefix: string[] }[] = [{ label: '전체', prefix: [] }];
  let l: LoopDef = root;
  shownPrefix.forEach((id, i) => {
    crumbs.push({ label: l.nodes[id]!.label, prefix: shownPrefix.slice(0, i + 1) });
    l = l.nodes[id]!.loop!;
  });

  return (
    <div className="loop-graph-wrap">
      <div className="loop-crumbs">
        {crumbs.map((c, i) => (
          <span key={i}>
            {i > 0 && <span className="crumb-sep">›</span>}
            <button className={`crumb${i === crumbs.length - 1 ? ' is-current' : ''}`} onClick={() => setPinned(c.prefix)}>
              {c.label}
            </button>
          </span>
        ))}
        <button className="btn btn-small follow" onClick={() => setPinned(null)} disabled={following}>
          {following ? '현재 위치를 따라가는 중' : '현재 위치 따라가기'}
        </button>
      </div>
      <div className="loop-graph">
        <ReactFlow
          key={shownPrefix.join('/')}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          nodesConnectable={false}
          elementsSelectable={false}
          onNodeClick={(_, n) => {
            if (loop.nodes[n.id]?.type === 'loop') setPinned([...shownPrefix, n.id]);
          }}
          zoomOnDoubleClick={false}
          panOnScroll
          zoomOnScroll={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} size={1} />
        </ReactFlow>
      </div>
    </div>
  );
}
