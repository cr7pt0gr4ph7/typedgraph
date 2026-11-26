// A small, deterministic Turtle writer shared by the SHACL and OWL exporters.
// Output is written by hand rather than through n3 so that blank nodes nest as
// property lists and the same schema always gives byte-identical text.

const XSD = 'http://www.w3.org/2001/XMLSchema#';

/** An object in a Turtle statement: a ready term, or a nested blank node. */
export type Obj = string | Entry[];
export type Entry = [predicate: string, object: Obj];

/** One Turtle statement: a subject and its predicate-object list. */
export function statement(subject: string, entries: Entry[]): string {
  return `${subject}\n${body(entries, 1)} .`;
}

function body(entries: Entry[], depth: number): string {
  const pad = '    '.repeat(depth);
  return entries
    .map(([p, o]) => `${pad}${p} ${typeof o === 'string' ? o : `[\n${body(o, depth + 1)}\n${pad}]`}`)
    .join(' ;\n');
}

const PN_LOCAL = /^[A-Za-z_][A-Za-z0-9_-]*$/;

/** Shorten an IRI to `:local` (base), `prefix:local`, or `<iri>`. */
export function compact(iri: string, base: string, prefixes: Record<string, string>): string {
  if (iri.startsWith(base) && PN_LOCAL.test(iri.slice(base.length))) return `:${iri.slice(base.length)}`;
  let best: [string, string] | null = null;
  for (const [p, ns] of Object.entries(prefixes)) {
    if (iri.startsWith(ns) && PN_LOCAL.test(iri.slice(ns.length)) && (!best || ns.length > best[1].length || (ns.length === best[1].length && p < best[0]))) best = [p, ns];
  }
  if (best) return `${best[0]}:${iri.slice(best[1].length)}`;
  return `<${Array.from(iri, (c) => (c.charCodeAt(0) <= 0x20 || '<>"{}|^`\\'.includes(c) ? `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}` : c)).join('')}>`;
}

export function isScalar(v: unknown): v is string | number | boolean {
  return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
}

/** A Turtle literal for a scalar: numbers and booleans bare, everything else a string. */
export function literal(v: unknown): string {
  if (typeof v === 'boolean') return String(v);
  if (typeof v === 'number' && Number.isFinite(v)) return /^-?\d+(\.\d+)?$/.test(String(v)) ? String(v) : `"${v}"^^<${XSD}double>`;
  const s = String(v).replace(/[\\"\n\r\t]/g, (c) => ({ '\\': '\\\\', '"': '\\"', '\n': '\\n', '\r': '\\r', '\t': '\\t' })[c]!);
  return `"${s}"`;
}

/** JSON with object keys sorted, so annotations are byte-stable. */
export function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .filter((k) => o[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

export function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
