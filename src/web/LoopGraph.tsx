import { useMemo } from 'react';
import { ReactFlow, Background, Handle, MarkerType, Position, type Edge, type Node, type NodeProps } from '@xyflow/react';
import type { LoopDef, NodeType } from '../engine';

interface Props {
  loop: LoopDef;
  /** Path of the current node; only the top-level node is shown in phase 1. */
  current: string[];
  waiting: boolean;
  finished: boolean;
  errorAt: string[] | null;
  trail: string[] | undefined;
}

type LoopNodeData = { label: string; type: NodeType; active: boolean; waiting: boolean; error: boolean; trail: boolean };

const TYPE_NAME: Record<NodeType, string> = {
  start: '시작', end: '끝', phase: '페이즈', action: 'Action', loop: '하위 루프',
};

function LoopNode({ data }: NodeProps<Node<LoopNodeData>>) {
  const cls = [
    'loop-node', `loop-node-${data.type}`,
    data.active ? 'is-active' : '', data.active && data.waiting ? 'is-waiting' : '',
    data.error ? 'is-error' : '', data.trail ? 'is-trail' : '',
  ].join(' ');
  return (
    <div className={cls} title={TYPE_NAME[data.type]}>
      <Handle id="in" type="target" position={Position.Left} />
      <Handle id="back-in" type="target" position={Position.Bottom} />
      {data.type !== 'start' && data.type !== 'end' && <span className="loop-node-kind">{TYPE_NAME[data.type]}</span>}
      <span className="loop-node-label">{data.type === 'start' ? '시작' : data.type === 'end' ? '끝' : data.label}</span>
      <Handle id="out" type="source" position={Position.Right} />
      <Handle id="back-out" type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes = { loop: LoopNode };

export function LoopGraph({ loop, current, waiting, finished, errorAt, trail }: Props) {
  const ids = Object.keys(loop.nodes);
  const trailSet = useMemo(() => new Set((trail ?? []).map((t) => t.split(' / ')[0])), [trail]);

  const position = (id: string) => {
    const n = loop.nodes[id]!;
    return n.pos ? { x: n.pos[0], y: n.pos[1] } : { x: ids.indexOf(id) * 170, y: (ids.indexOf(id) % 2) * 90 };
  };

  const nodes: Node<LoopNodeData>[] = ids.map((id) => {
    const n = loop.nodes[id]!;
    return {
      id,
      type: 'loop',
      position: position(id),
      data: {
        label: n.label, type: n.type,
        active: current[0] === id && !errorAt,
        waiting: waiting && !finished,
        error: !!errorAt && errorAt[0] === id,
        trail: trailSet.has(id),
      },
      draggable: false,
      selectable: false,
    };
  });

  const edges: Edge[] = loop.edges.map(([a, b], i) => {
    const hot = current[0] === a && loop.nodes[b]!.type === 'action' && waiting;
    // edges that go back (right to left) loop underneath the graph
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

  return (
    <div className="loop-graph">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnScroll
        zoomOnScroll={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} size={1} />
      </ReactFlow>
    </div>
  );
}
