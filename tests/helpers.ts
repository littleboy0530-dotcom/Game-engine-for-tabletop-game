import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Engine, loadGame, type Input, type Pending } from '../src/engine';

export function readGameFolder(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else out[relative(dir, p).split('\\').join('/')] = readFileSync(p, 'utf8');
    }
  };
  walk(dir);
  return out;
}

export async function startGame(files: Record<string, string>, seed = 1) {
  return Engine.create(loadGame(files), { seed });
}

export const gameDir = (name: string) => join(__dirname, '..', 'games', name);

/** Pick an action whose option label matches, or a choose option by label. */
export function pick(e: Engine, label: string, node?: string): Input {
  const p = e.pending as Pending;
  if (!p) throw new Error(`no pending request (error: ${e.error?.message})`);
  if (p.kind === 'choose') {
    const i = p.options.findIndex((o) => o.label === label);
    if (i < 0) throw new Error(`choose option '${label}' not in [${p.options.map((o) => o.label).join(', ')}]`);
    return { kind: 'choose', option: i };
  }
  for (const a of p.actions) {
    if (node && a.path[a.path.length - 1] !== node) continue;
    // button-style actions (no options) are picked by the action's own label
    const i = a.options.findIndex((o) => (o.label || a.label) === label);
    if (i >= 0) return { kind: 'action', node: a.path[a.path.length - 1]!, option: i };
  }
  throw new Error(`action option '${label}' not found in ${JSON.stringify(p.actions.map((a) => [a.label, a.options.map((o) => o.label)]))}`);
}

export function play(e: Engine, ...labels: string[]) {
  for (const l of labels) {
    e.input(pick(e, l));
    if (e.error) throw new Error(`engine error after '${l}': ${e.error.message}`);
  }
}
