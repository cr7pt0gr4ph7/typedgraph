import { Graph } from '@obsigraph/core';
import { describe, expect, it } from 'vitest';
import { applyFilters, buildStylesheet, DEFAULT_DISPLAY, formatLayoutOptions, mergeElements, parseDisplay, neighborhood, resolveSettings, Simulation, ViewFilters, withPropertyLinks, type SimInput } from '../src/index';

const NOTES = ['Alice', 'Bob', 'Carol', 'Dave', 'Eve'];

function fixture(): Graph {
  const graph = new Graph((l) => (NOTES.includes(l) ? `${l}.md` : null));
  graph.upsertNote({ path: 'Alice.md', text: 'knows:: [[Bob]] {see: "[[Carol]]", note: "met via [[Dave|D]] and [[Nobody]]", plain: [[Eve]], since: 2020}', frontmatter: { type: 'Person' } });
  for (const n of ['Bob', 'Carol', 'Dave', 'Eve']) graph.upsertNote({ path: `${n}.md`, text: '', frontmatter: { type: n === 'Carol' ? 'Place' : 'Person' } });
  graph.upsertNote({ path: 'Bob meets Eve.md', text: '', frontmatter: { type: 'edge', from: '[[Bob]]', to: '[[Eve]]', edgeType: 'meets', where: ['[[Carol]]', 'online'] } });
  return graph;
}

const EDGE = 'Alice.md#knows#Bob.md#0';
const link = (edge: string, key: string, target: string) => ({ id: `${edge}\u001f${key}\u001f${target}`, edge, target, key });

describe('property links', () => {
  // @tg: verifies:: [[tests/graph-view#Links in edge properties]] {since: "2026-11-26", level: unit}
  // @lat: [[tests/graph-view#Links in edge properties]]
  // @tg: verifies:: [[openspec:graph-view#Edge property links#Linked notes join the view]]
  it('links an edge to the notes its quoted property values name and adds those notes', () => {
    const g = withPropertyLinks(fixture(), neighborhood(fixture(), 'Alice.md'));
    expect(g.nodes.map((n) => n.id).sort()).toEqual(['Alice.md', 'Bob.md', 'Carol.md', 'Dave.md']);
    expect(g.links).toEqual([link(EDGE, 'see', 'Carol.md'), link(EDGE, 'note', 'Dave.md')]);
    // Edge notes resolve their links from the edge note, and plain values give nothing.
    const bob = withPropertyLinks(fixture(), neighborhood(fixture(), 'Bob.md'));
    expect(bob.links).toContainEqual(link('Bob meets Eve.md', 'where', 'Carol.md'));
    // No links, no change.
    const plain = neighborhood(fixture(), 'Eve.md');
    expect(withPropertyLinks(fixture(), { nodes: plain.nodes, edges: plain.edges.filter((e) => e.id !== 'Bob meets Eve.md') })).not.toHaveProperty('links');
  });

  // @tg: verifies:: [[tests/graph-view#Property links follow filters]] {since: "2026-11-26", level: unit}
  // @lat: [[tests/graph-view#Property links follow filters]]
  // @tg: verifies:: [[openspec:graph-view#Edge property links#Hidden with their ends]]
  it('keeps a property link only while its edge and linked note are shown', () => {
    const graph = fixture();
    const g = withPropertyLinks(graph, neighborhood(graph, 'Alice.md'));
    const filters = new ViewFilters();
    filters.setTypeHidden('Place', true);
    expect(applyFilters(g, filters, new Set()).links).toEqual([link(EDGE, 'note', 'Dave.md')]);
    expect(applyFilters(g, new ViewFilters(), new Set(['Bob.md'])).links).toEqual([]);
    expect(mergeElements(g, neighborhood(graph, 'Bob.md')).links).toEqual(g.links);
  });

  // @tg: verifies:: [[tests/graph-ui#Property link keeps its note near the edge]] {since: "2026-11-26", level: unit}
  // @lat: [[tests/graph-ui#Property link keeps its note near the edge]]
  // @tg: verifies:: [[openspec:graph-view#Edge property links#Connector from the edge]]
  it('pulls a linked note towards the middle of its edge and styles the connector as dashed', () => {
    const input: SimInput = {
      nodes: ['a', 'b', 'c'].map((id) => ({ id, labelWidth: 0 })),
      links: [{ source: 'a', target: 'b', type: 'knows' }],
      ties: [{ node: 'c', a: 'a', b: 'b' }],
    };
    const s = resolveSettings({ distance: 100 });
    const sim = new Simulation(s.forces, s.display, () => 0.5);
    sim.sync(input);
    const c = sim.nodes.get('c')!;
    Object.assign(c, { x: 5000, y: 5000 });
    sim.warmUp();
    const a = sim.nodes.get('a')!;
    const b = sim.nodes.get('b')!;
    expect(Math.hypot(c.x - (a.x + b.x) / 2, c.y - (a.y + b.y) / 2)).toBeLessThan(600);
    expect(sim.ties).toHaveLength(1);

    const rules = buildStylesheet({ text: '#000', muted: '#999', background: '#fff' }, s.display);
    expect(rules.find((r) => r.selector === 'edge.prop-link')?.style).toMatchObject({ 'line-style': 'dashed', 'line-color': '#999' });
    expect(rules.find((r) => r.selector === 'node.prop-anchor')?.style).toMatchObject({ events: 'no' });
  });

  // @tg: verifies:: [[tests/graph-ui#Property links setting]] {since: "2026-11-26", level: unit}
  // @lat: [[tests/graph-ui#Property links setting]]
  // @tg: verifies:: [[openspec:graph-view#Edge property links#Property links checkbox]] {level: unit}
  it('has a display setting for the Property links checkbox, on by default and kept in block options', () => {
    expect(DEFAULT_DISPLAY.propertyLinks).toBe(true);
    expect(parseDisplay('propertyLinks=off')).toEqual({ value: { propertyLinks: false }, errors: [] });
    expect(formatLayoutOptions(resolveSettings({}, { propertyLinks: false }))).toContain('propertyLinks=false');
  });
});
