import type { Input, Pending, Ref } from '../engine';

/** One thing the player can click right now. */
export interface Choice {
  label: string;
  /** Action label (for action requests) or prompt (for choose requests). */
  group: string;
  ref: Ref | null;
  input: Input;
}

export const refKey = (r: Ref) => `${r.kind}:${r.id}`;

export function choicesOf(p: Pending | null): Choice[] {
  if (!p) return [];
  if (p.kind === 'action') {
    return p.actions.flatMap((a) =>
      a.options.map((o, i) => ({
        label: o.label || a.label,
        group: a.label,
        ref: o.ref,
        input: { kind: 'action' as const, node: a.path[a.path.length - 1]!, option: i },
      })),
    );
  }
  return p.options.map((o, i) => ({
    label: o.label,
    group: p.prompt,
    ref: o.ref,
    input: { kind: 'choose' as const, option: i },
  }));
}

/** Choices grouped by the board object they belong to. */
export function choicesByRef(list: Choice[]) {
  const map = new Map<string, Choice[]>();
  for (const c of list) {
    if (!c.ref || c.ref.kind === 'player') continue;
    const k = refKey(c.ref);
    map.set(k, [...(map.get(k) ?? []), c]);
  }
  return map;
}
