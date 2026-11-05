import { parse, stringify } from 'yaml';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Doc = Record<string, any>;

/** Parse a yaml file of the project; null when it does not parse (shown as an error). */
export function readDoc(files: Record<string, string>, path: string): Doc | null {
  const text = files[path];
  if (text === undefined) return {};
  try {
    const v = parse(text);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Doc) : {};
  } catch {
    return null;
  }
}

export function writeDoc(doc: Doc): string {
  return stringify(doc, { lineWidth: 0 });
}

export const asList = <T = any>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : v === undefined || v === null ? [] : [v as T]);
export const asMap = (v: unknown): Doc => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Doc) : {});

/** A new id like base1, base2... that is not in `taken`. */
export function freshId(base: string, taken: Iterable<string>) {
  const set = new Set(taken);
  for (let i = 1; ; i++) if (!set.has(`${base}${i}`)) return `${base}${i}`;
}
