import type { Diagnostic } from '../edges/parse.js';
import type { Props } from '../edges/props.js';
import type { Graph, GraphEdge, GraphNode, GraphView } from '../graph/graph.js';
import type { SchemaSet } from './schema.js';

/**
 * What the ontology says about edge directions (TGS 0.7): which names are the reverse of a declared
 * edge type, and which edge types are symmetric.
 */
export interface EdgeSemantics {
  /** Inverse name → the edge type that declares it, e.g. `hasEmployee` → `worksAt`. Never holds a symmetric type. */
  inverseOf: Map<string, string>;
  /** Declared edge type → its inverse name, e.g. `worksAt` → `hasEmployee`. Never holds a symmetric type. */
  inverseName: Map<string, string>;
  /** Edge types that are their own inverse, e.g. `friendsWith`. */
  symmetric: Set<string>;
}

const EMPTY: EdgeSemantics = { inverseOf: new Map(), inverseName: new Map(), symmetric: new Set() };

/** The inverse and symmetric edge types a schema set declares. */
// @tg: implements:: [[openspec:schema-notes#Inverse edge declarations]]
export function edgeSemantics(set: SchemaSet | null | undefined): EdgeSemantics {
  if (!set) return EMPTY;
  let sem: EdgeSemantics | null = null;
  for (const e of set.edgeTypes.values()) {
    if (!e.inverseEdge) continue;
    sem ??= { inverseOf: new Map(), inverseName: new Map(), symmetric: new Set() };
    if (e.inverseEdge === e.type) sem.symmetric.add(e.type);
    else {
      sem.inverseOf.set(e.inverseEdge, e.type);
      sem.inverseName.set(e.type, e.inverseEdge);
    }
  }
  return sem ?? EMPTY;
}

/** True when the semantics declare no inverse and no symmetric edge type, so every view equals the graph. */
export function isPlain(sem: EdgeSemantics): boolean {
  return sem.inverseOf.size === 0 && sem.symmetric.size === 0;
}

/** The declared edge type a written name stands for, and whether the edge then runs the other way. */
export function canonicalType(type: string, sem: EdgeSemantics): { type: string; reversed: boolean } {
  const c = sem.inverseOf.get(type);
  return c ? { type: c, reversed: true } : { type, reversed: false };
}

/**
 * The name of an edge read from one of its ends: its type from the source, its inverse name from the
 * target (the type itself for a symmetric edge type, and the type when it has no inverse).
 */
// @tg: implements:: [[openspec:schema-notes#Edges read from either end]]
export function nameFrom(edge: Pick<GraphEdge, 'type' | 'source' | 'target'>, nodeId: string, sem: EdgeSemantics): string {
  const { type } = canonicalType(edge.type, sem);
  // Read from the canonical source, the canonical name; from the canonical target, the inverse name.
  const canonicalSource = edge.type === type ? edge.source : edge.target;
  if (nodeId === canonicalSource && edge.source !== edge.target) return type;
  return sem.inverseName.get(type) ?? type;
}

/** True when an edge read from `nodeId` has a name of its own there: it starts at the node, or it ends there and its type has an inverse. */
export function readsFrom(edge: Pick<GraphEdge, 'type' | 'source' | 'target'>, nodeId: string, sem: EdgeSemantics): boolean {
  if (edge.source === nodeId) return true;
  if (edge.target !== nodeId) return false;
  const { type } = canonicalType(edge.type, sem);
  return sem.symmetric.has(type) || sem.inverseName.has(type) || sem.inverseOf.has(edge.type);
}

/**
 * The edges of a node read from its own side, each with the name it has there: the edges starting
 * at it under their type, and the edges ending at it whose type has an inverse under that name.
 */
// @tg: implements:: [[openspec:schema-notes#Edges read from either end]]
export function edgesFrom(view: GraphView, nodeId: string, sem: EdgeSemantics): { name: string; edge: GraphEdge }[] {
  const out = view.outEdges(nodeId).map((edge) => ({ name: edge.type, edge }));
  for (const edge of view.inEdges(nodeId)) {
    if (edge.source === nodeId) continue;
    const name = sem.symmetric.has(edge.type) ? edge.type : sem.inverseName.get(edge.type);
    if (name) out.push({ name, edge });
  }
  return out;
}

/** A graph with every edge in its declared type and direction, inverse sides merged, plus what merging found. */
export interface CanonicalView extends GraphView {
  readonly semantics: EdgeSemantics;
  /** `inverse-mismatch`: the two written sides of one edge disagree on properties or sign. */
  readonly diagnostics: Diagnostic[];
}

/** Where an edge was written: its edge note, else its written source. */
export function writtenAt(e: GraphEdge): string {
  return e.file ?? (e.written?.reversed ? e.target : e.source);
}

const cache = new WeakMap<Graph, { version: number; set: SchemaSet; view: CanonicalView }>();

/**
 * The canonical view of a graph under a schema set (TGS 0.7): an edge written with an inverse name
 * becomes the declared edge type from its target to its source, and an edge written from both ends
 * (`A worksAt B` and `B hasEmployee A`, or `A friendsWith B` and `B friendsWith A`) becomes one edge.
 * The graph itself is unchanged. Without inverse declarations the view holds the graph's own edges.
 * The view is cached per graph version and schema set.
 */
// @tg: implements:: [[openspec:graph-model#Canonical edge view]]
// @lat: [[graph-model#Inverse edges]]
export function canonicalView(graph: Graph, set: SchemaSet): CanonicalView {
  const hit = cache.get(graph);
  if (hit && hit.version === graph.version && hit.set === set) return hit.view;
  const view = buildView(graph, edgeSemantics(set));
  cache.set(graph, { version: graph.version, set, view });
  return view;
}

/** Build a canonical view of any graph view under given semantics (uncached). */
export function buildView(graph: GraphView, sem: EdgeSemantics): CanonicalView {
  const diagnostics: Diagnostic[] = [];
  if (isPlain(sem)) return passThrough(graph, sem, diagnostics);

  const canon: GraphEdge[] = [];
  for (const e of graph.edges()) {
    const c = canonicalType(e.type, sem);
    canon.push(c.reversed ? { ...e, type: c.type, source: e.target, target: e.source, written: { type: e.type, reversed: true } } : e);
  }

  // Group the two written directions of each logical edge, and pair them in written order.
  const groups = new Map<string, { a: GraphEdge[]; b: GraphEdge[]; sign: number; type: string; ends: [string, string] }>();
  for (const e of canon) {
    const sym = sem.symmetric.has(e.type);
    const paired = sym || sem.inverseName.has(e.type);
    if (!paired) continue;
    // Symmetric: the two directions are the two orders of the ends. Otherwise: written forward or with the inverse name.
    const [lo, hi] = e.source <= e.target ? [e.source, e.target] : [e.target, e.source];
    const key = sym ? `${e.sign}\u0000${e.type}\u0000${lo}\u0000${hi}` : `${e.sign}\u0000${e.type}\u0000${e.source}\u0000${e.target}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { a: [], b: [], sign: e.sign, type: e.type, ends: sym ? [lo, hi] : [e.source, e.target] }));
    const first = sym ? e.source === lo : !e.written?.reversed;
    (first ? g.a : g.b).push(e);
  }

  const replace = new Map<string, GraphEdge | null>();
  const label = (id: string) => graph.node(id)?.props.title ?? id;
  for (const g of groups.values()) {
    const n = Math.min(g.a.length, g.b.length);
    for (let i = 0; i < n; i++) {
      const keep = g.a[i]!;
      const other = g.b[i]!;
      const diff = propDiff(keep.props, other.props);
      if (diff.length) {
        diagnostics.push({
          path: writtenAt(other),
          line: other.line,
          column: 0,
          code: 'inverse-mismatch',
          message: `Edge '${g.type}' from ${String(label(keep.source))} to ${String(label(keep.target))} is written on both ends with different properties (${diff.join('; ')}); both ends must agree`,
        });
      }
      replace.set(keep.id, { ...keep, props: { ...other.props, ...keep.props }, merged: [...(keep.merged ?? []), other.id] });
      replace.set(other.id, null);
    }
  }

  // One end asserts the edge and the other denies it: report, keep both.
  for (const [key, g] of groups) {
    if (g.sign < 0) continue;
    const denied = groups.get(`-1${key.slice(1)}`);
    if (!denied) continue;
    const left = (x: typeof g) => {
      const n = Math.min(x.a.length, x.b.length);
      return { a: x.a.slice(n), b: x.b.slice(n) };
    };
    const pos = left(g);
    const neg = left(denied);
    for (const other of [...neg.b.slice(0, pos.a.length), ...neg.a.slice(0, pos.b.length)]) {
      diagnostics.push({
        path: writtenAt(other),
        line: other.line,
        column: 0,
        code: 'inverse-mismatch',
        message: `Edge '${g.type}' between ${String(label(g.ends[0]))} and ${String(label(g.ends[1]))} is asserted on one end and denied on the other; both ends must agree`,
      });
    }
  }

  const edges = new Map<string, GraphEdge>();
  const out = new Map<string, GraphEdge[]>();
  const inn = new Map<string, GraphEdge[]>();
  for (const e0 of canon) {
    const r = replace.get(e0.id);
    if (r === null) continue;
    const e = r ?? e0;
    edges.set(e.id, e);
    push(out, e.source, e);
    push(inn, e.target, e);
  }
  return {
    semantics: sem,
    diagnostics,
    get size() {
      return { nodes: graph.size.nodes, edges: edges.size };
    },
    nodes: () => graph.nodes(),
    node: (id) => graph.node(id),
    edges: () => edges.values(),
    edge: (id) => edges.get(id),
    outEdges: (id) => out.get(id) ?? [],
    inEdges: (id) => inn.get(id) ?? [],
  };
}

function passThrough(graph: GraphView, sem: EdgeSemantics, diagnostics: Diagnostic[]): CanonicalView {
  return {
    semantics: sem,
    diagnostics,
    get size() {
      return graph.size;
    },
    nodes: (): IterableIterator<GraphNode> => graph.nodes(),
    node: (id) => graph.node(id),
    edges: () => graph.edges(),
    edge: (id) => graph.edge(id),
    outEdges: (id) => graph.outEdges(id),
    inEdges: (id) => graph.inEdges(id),
  };
}

function push(m: Map<string, GraphEdge[]>, k: string, e: GraphEdge): void {
  const l = m.get(k);
  if (l) l.push(e);
  else m.set(k, [e]);
}

/** Properties the two ends of one edge disagree on; `id` is each written edge's own and is not compared. */
function propDiff(a: Props, b: Props): string[] {
  const out: string[] = [];
  const show = (v: unknown) => (v === undefined ? '(none)' : JSON.stringify(v));
  for (const k of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
    if (k === 'id') continue;
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out.push(`${k}: ${show(a[k])} vs ${show(b[k])}`);
  }
  return out;
}
