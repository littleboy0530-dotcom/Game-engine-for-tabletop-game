// Every folder under /games becomes a playable game. Files are bundled as text.
const raw = import.meta.glob('/games/**/*.{yaml,lua}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export interface GameFolder {
  id: string;
  files: Record<string, string>;
}

export const GAMES: GameFolder[] = (() => {
  const byId: Record<string, Record<string, string>> = {};
  for (const [path, text] of Object.entries(raw)) {
    const m = /^\/games\/([^/]+)\/(.+)$/.exec(path);
    if (!m) continue;
    (byId[m[1]!] ??= {})[m[2]!] = text;
  }
  return Object.entries(byId).map(([id, files]) => ({ id, files }));
})();
