import { NodeRef, PathRef, RelRef, type GraphNode, type QueryResult, type Value } from '@obsigraph/core';

export interface NodeElement {
  id: string;
  label: string;
  labels: string[];
  stub: boolean;
  path: string | null;
  props: Record<string, unknown>;
}

export interface EdgeElement {
  id: string;
  source: string;
  target: string;
  type: string;
  sign: 1 | -1;
}

/**
 * A link written in an edge's property value, drawn as a dashed connector from the middle of the
 * edge to the linked note. `key` is the property name and labels the connector.
 */
export interface PropertyLinkElement {
  id: string;
  /** Id of the edge whose property holds the link. */
  edge: string;
  /** Id of the linked node. */
  target: string;
  key: string;
}

export interface GraphElements {
  nodes: NodeElement[];
  edges: EdgeElement[];
  /** Links in edge properties; only drawn while their edge and target node are drawn. */
  links?: PropertyLinkElement[];
}

/** The property links of `g` whose edge and target node are still in `nodes` and `edges`. */
export function keptLinks(g: GraphElements, nodes: readonly NodeElement[], edges: readonly EdgeElement[]): PropertyLinkElement[] | undefined {
  if (!g.links) return undefined;
  const n = new Set(nodes.map((x) => x.id));
  const e = new Set(edges.map((x) => x.id));
  return g.links.filter((l) => n.has(l.target) && e.has(l.edge));
}

/**
 * Display text for a node: its title, then ` — ` and the frontmatter `subtitle` when the note has
 * one, so many notes that share a file name such as `spec.md` stay apart in a graph.
 */
// @tg: implements:: [[openspec:graph-view#Node subtitle]]
// @lat: [[visualization#Node captions]]
export function nodeCaption(n: GraphNode): string {
  const title = typeof n.props.title === 'string' ? n.props.title : n.id;
  const sub = n.props.subtitle;
  const text = typeof sub === 'string' ? sub.trim() : typeof sub === 'number' ? String(sub) : '';
  return text ? `${title} — ${text}` : title;
}

// @tg: implements:: [[openspec:graph-view#Shared renderer]]
export function nodeElement(n: GraphNode): NodeElement {
  return {
    id: n.id,
    label: nodeCaption(n),
    labels: [...n.labels],
    stub: n.stub,
    path: n.stub ? null : n.id,
    props: n.props,
  };
}

/**
 * Collect the nodes and relationships in a result, including values nested in
 * lists, and add relationship endpoints so every edge can be drawn.
 */
export function toElements(result: QueryResult, lookup: (id: string) => GraphNode | undefined): GraphElements {
  const nodes = new Map<string, NodeElement>();
  const edges = new Map<string, EdgeElement>();

  const visit = (v: Value): void => {
    if (v instanceof NodeRef) {
      if (!nodes.has(v.id)) nodes.set(v.id, nodeElement(v.node));
    } else if (v instanceof RelRef) {
      const e = v.edge;
      if (edges.has(e.id)) return;
      edges.set(e.id, { id: e.id, source: e.source, target: e.target, type: e.type, sign: e.sign });
      for (const end of [e.source, e.target]) {
        const n = nodes.has(end) ? undefined : lookup(end);
        if (n) nodes.set(end, nodeElement(n));
      }
    } else if (v instanceof PathRef) {
      v.nodes.forEach(visit);
      v.rels.forEach(visit);
    } else if (Array.isArray(v)) {
      v.forEach(visit);
    }
  };

  for (const row of result.rows) row.forEach(visit);
  // Drop edges whose endpoint vanished, so the renderer never sees a dangling edge.
  for (const [id, e] of edges) if (!nodes.has(e.source) || !nodes.has(e.target)) edges.delete(id);
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

/** True when `g` has exactly the ids already shown, so a refresh can restyle in place. */
export function sameElementSet(shown: { has(id: string): boolean; size: number }, g: GraphElements): boolean {
  const ids = [...g.nodes, ...g.edges, ...(g.links ?? [])].map((x) => x.id);
  return ids.length === shown.size && ids.every((id) => shown.has(id));
}

// @tg: implements:: [[openspec:graph-query-block#Large results are bounded]]
export function elementCount(g: GraphElements): number {
  return g.nodes.length + g.edges.length;
}

const CODE_LABELS = new Set(['CodeFile', 'CodeSymbol']);

/** Remove code nodes and every edge touching them, e.g. for a block with `code: hide`. */
// @tg: implements:: [[cli#Code layer]] {since: "2026-10-04"}
// @lat: [[cli#Code layer]]
export function excludeCode(g: GraphElements): GraphElements {
  const nodes = g.nodes.filter((n) => !n.labels.some((l) => CODE_LABELS.has(l)));
  const keep = new Set(nodes.map((n) => n.id));
  const edges = g.edges.filter((e) => keep.has(e.source) && keep.has(e.target));
  return { nodes, edges, ...(g.links ? { links: keptLinks(g, nodes, edges) } : {}) };
}
