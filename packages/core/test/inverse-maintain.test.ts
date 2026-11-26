import { describe, expect, it } from 'vitest';
import { applyInverseEdits, Graph, planInverseSync, schemasFromGraph, splitFrontmatter, type InverseSyncOptions } from '../src/index.js';
import { parse as parseYaml } from 'yaml';

const ONTOLOGY = '---\nedgeTypes:\n  worksAt: {from: Person, to: Company, inverseEdge: hasEmployee}\n  friendsWith: {inverseEdge: friendsWith}\n---\n';

/** A vault of note texts; `sync` plans, applies and returns the new texts. */
function vault(files: Record<string, string>, frontmatterEdges = false) {
  const texts = new Map(Object.entries({ 'Types/Edges.md': ONTOLOGY, ...files }));
  const build = () => {
    const paths = [...texts.keys()];
    const graph = new Graph((l) => paths.find((p) => p === `${l}.md` || p.endsWith(`/${l}.md`)) ?? null, undefined, { frontmatterEdges });
    for (const [path, text] of texts) graph.upsertNote({ path, text, frontmatter: (parseYaml(splitFrontmatter(text).yaml ?? '') as Record<string, unknown>) ?? null });
    return graph;
  };
  const sync = (opts: InverseSyncOptions = {}) => {
    const graph = build();
    const plan = planInverseSync(graph, schemasFromGraph(graph, 'Types/'), (p) => texts.get(p) ?? null, opts);
    for (const [path, edits] of plan.edits) texts.set(path, applyInverseEdits(texts.get(path)!, edits).text);
    return plan;
  };
  return { texts, sync };
}

describe('maintaining inverse edges', () => {
  // @tg: verifies:: [[tests/inverse-edges#Missing ends are written]] {level: unit}
  // @tg: verifies:: [[openspec:schema-notes#Maintain inverse edges#Missing end written under a heading]]
  it('writes the missing end under a heading, and is idempotent', () => {
    const v = vault({ 'Ada.md': '# Ada\n\n- worksAt:: [[Acme]] {role: engineer}\n- friendsWith:: [[Bob]]\n', 'Acme.md': '# Acme\n\nA company.\n', 'Bob.md': '# Bob\n\n## Relations\n\n- knows:: [[Ada]]\n\n## Notes\n\nText.\n' });
    const plan = v.sync();
    expect(plan.actions.map((a) => [a.kind, a.path])).toEqual([
      ['add', 'Acme.md'],
      ['add', 'Bob.md'],
    ]);
    expect(v.texts.get('Acme.md')).toBe('# Acme\n\nA company.\n\n## Relations\n\n- hasEmployee:: [[Ada]] {role: engineer}\n');
    expect(v.texts.get('Bob.md')).toBe('# Bob\n\n## Relations\n\n- knows:: [[Ada]]\n- friendsWith:: [[Ada]]\n\n## Notes\n\nText.\n');
    expect(v.sync().actions).toEqual([]);
  });

  // @tg: verifies:: [[tests/inverse-edges#Missing ends are written]] {level: unit}
  // @tg: verifies:: [[openspec:schema-notes#Maintain inverse edges#Placement chosen at run time]]
  it('writes at the end of the note or into frontmatter when asked', () => {
    const end = vault({ 'Ada.md': '- worksAt:: [[Acme]]\n', 'Acme.md': 'Text.\n' });
    end.sync({ placement: 'end' });
    expect(end.texts.get('Acme.md')).toBe('Text.\n\n- hasEmployee:: [[Ada]]\n');

    const fm = vault({ 'Ada.md': '- worksAt:: [[Acme]] {role: engineer}\n', 'Cy.md': '- worksAt:: [[Acme]]\n', 'Acme.md': '---\ntype: Company\n---\nText.\n' }, true);
    const plan = fm.sync({ placement: 'frontmatter' });
    expect(fm.texts.get('Acme.md')).toBe('---\ntype: Company\nhasEmployee:\n  - "[[Ada]]"\n  - "[[Cy]]"\n---\nText.\n');
    expect(plan.actions[0]!.text).toContain('properties are not kept in frontmatter');
    expect(fm.sync({ placement: 'frontmatter' }).actions).toEqual([]);
  });

  // @tg: verifies:: [[tests/inverse-edges#Mismatches are fixed]] {level: unit}
  // @tg: verifies:: [[openspec:schema-notes#Maintain inverse edges#Declared direction wins]]
  // @tg: verifies:: [[openspec:schema-notes#Maintain inverse edges#Last edited wins]]
  it('rewrites the properties of the losing end', () => {
    const files = { 'Ada.md': '- worksAt:: [[Acme]] {role: engineer, since: 2020}\n', 'Acme.md': '- hasEmployee:: [[Ada]] {role: manager, id: e1} trailing\n' };
    const declared = vault(files);
    declared.sync();
    expect(declared.texts.get('Acme.md')).toBe('- hasEmployee:: [[Ada]] {role: engineer, since: 2020, id: e1} trailing\n');
    const last = vault(files);
    last.sync({ propertyWinner: 'last-edited', mtime: (p) => (p === 'Acme.md' ? 2 : 1) });
    expect(last.texts.get('Ada.md')).toBe('- worksAt:: [[Acme]] {role: manager}\n');
    expect(last.sync({ propertyWinner: 'last-edited', mtime: (p) => (p === 'Acme.md' ? 2 : 1) }).actions).toEqual([]);
  });

  // @tg: verifies:: [[tests/inverse-edges#Deleted edges are mirrored on request]] {level: unit}
  // @tg: verifies:: [[openspec:schema-notes#Maintain inverse edges#Deletion mirrored]]
  it('removes a lone end only with deletions: mirror, deciding by the declared side or the last edit', () => {
    const files = { 'Ada.md': 'No longer works there.\n', 'Acme.md': '- hasEmployee:: [[Ada]]\n', 'Bob.md': '- worksAt:: [[Acme]]\n' };
    // keep: every lone end is completed.
    const keep = vault(files);
    expect(keep.sync({ placement: 'end' }).actions.map((a) => [a.kind, a.path])).toEqual([
      ['add', 'Ada.md'],
      ['add', 'Acme.md'],
    ]);
    // mirror + declared: an end written with the inverse name lost its declared end.
    const declared = vault(files);
    expect(declared.sync({ placement: 'end', deletions: 'mirror' }).actions.map((a) => [a.kind, a.path])).toEqual([
      ['remove', 'Acme.md'],
      ['add', 'Acme.md'],
    ]);
    expect(declared.texts.get('Acme.md')).toBe('- hasEmployee:: [[Bob]]\n');
    // mirror + last-edited: the end is left over when its other note changed later.
    const times: Record<string, number> = { 'Ada.md': 3, 'Acme.md': 2, 'Bob.md': 1 };
    const last = vault(files);
    const plan = last.sync({ placement: 'end', deletions: 'mirror', deletionWinner: 'last-edited', mtime: (p) => times[p] ?? null });
    expect(plan.actions.map((a) => [a.kind, a.path])).toEqual([
      ['remove', 'Acme.md'],
      ['remove', 'Bob.md'],
    ]);
    // Symmetric edges have no declared side, so declared never removes them.
    const sym = vault({ 'Ada.md': '- friendsWith:: [[Bob]]\n', 'Bob.md': '' });
    expect(sym.sync({ deletions: 'mirror' }).actions.map((a) => a.kind)).toEqual(['add']);
  });

  // @tg: verifies:: [[tests/inverse-edges#Mismatches are fixed]] {level: unit}
  // @tg: verifies:: [[tests/inverse-edges#Deleted edges are mirrored on request]] {level: unit}
  // @tg: verifies:: [[openspec:schema-notes#Maintain inverse edges#Sources of truth chosen separately]]
  it('chooses the source of truth for properties and for deletions separately', () => {
    const files = { 'Ada.md': '- worksAt:: [[Acme]] {role: engineer}\n', 'Acme.md': '- hasEmployee:: [[Ada]] {role: manager}\n- hasEmployee:: [[Bob]]\n', 'Bob.md': '' };
    const times: Record<string, number> = { 'Ada.md': 1, 'Acme.md': 2, 'Bob.md': 3 };
    const mtime = (p: string) => times[p] ?? null;
    // Properties from the last-edited note (Acme), deletions by the declared side (Acme's lone hasEmployee is left over).
    const a = vault(files);
    expect(a.sync({ placement: 'end', deletions: 'mirror', propertyWinner: 'last-edited', deletionWinner: 'declared', mtime }).actions.map((x) => [x.kind, x.path])).toEqual([
      ['update', 'Ada.md'],
      ['remove', 'Acme.md'],
    ]);
    // Properties from the declared end, deletions by the last edit (Bob changed after Acme, so the lone end is left over too).
    const b = vault(files);
    expect(b.sync({ placement: 'end', deletions: 'mirror', propertyWinner: 'declared', deletionWinner: 'last-edited', mtime }).actions.map((x) => [x.kind, x.path])).toEqual([
      ['update', 'Acme.md'],
      ['remove', 'Acme.md'],
    ]);
    expect(b.texts.get('Acme.md')).toBe('- hasEmployee:: [[Ada]] {role: engineer}\n');
  });

  // @tg: verifies:: [[tests/inverse-edges#Missing ends are written]] {level: unit}
  it('limits a sync to the notes given, and leaves stale edits out', () => {
    const v = vault({ 'Ada.md': '- worksAt:: [[Acme]]\n', 'Bob.md': '- worksAt:: [[Acme]]\n', 'Acme.md': '' });
    const plan = v.sync({ only: new Set(['Bob.md']) });
    expect(plan.actions.map((a) => a.cause.path)).toEqual(['Bob.md']);
    expect(applyInverseEdits('changed\n', [{ op: 'replace', line: 0, expect: 'old', text: 'new' }])).toEqual({ text: 'changed\n', stale: 1 });
  });
});
