import { describe, expect, it } from 'vitest';
import { BuiltinEngine, canonicalView, edgeSemantics, edgesFrom, Graph, nameFrom, readSchemaNote, schemasFromGraph, validateSchemas, type NoteInput } from '../src/index.js';

function vault(notes: NoteInput[]) {
  const paths = new Set(notes.map((n) => n.path));
  const graph = new Graph((l) => {
    for (const p of paths) if (p === `${l}.md` || p.endsWith(`/${l}.md`)) return p;
    return null;
  });
  for (const n of notes) graph.upsertNote(n);
  return graph;
}

const ontology: NoteInput = {
  path: 'Types/Ontology.md',
  text: '',
  frontmatter: {
    tgs: '0.7',
    schemas: { Person: { edges: { worksAt: { target: 'Company', many: false }, friendsWith: 'Person' } }, Company: { edges: { hasEmployee: 'Person' } } },
    edgeTypes: {
      worksAt: { from: 'Person', to: 'Company', inverseEdge: 'hasEmployee', properties: { since: 'date', role: { values: ['engineer', 'manager'] } } },
      friendsWith: { from: 'Person', to: 'Person', inverseEdge: 'friendsWith' },
    },
  },
};

const note = (path: string, type: string, text = ''): NoteInput => ({ path, text, frontmatter: { type } });

describe('inverse edge declarations', () => {
  // @tg: verifies:: [[tests/inverse-edges#Inverse name read]] {level: unit}
  // @lat: [[tests/inverse-edges#Inverse name read]]
  // @tg: verifies:: [[openspec:schema-notes#Inverse edge declarations#Inverse name declared]]
  // @tg: verifies:: [[openspec:schema-notes#Inverse edge declarations#Symmetric edge type declared]]
  it('reads inverseEdge, and a symmetric edge type names itself', () => {
    const n = readSchemaNote(ontology.path, ontology.frontmatter);
    expect(n.diagnostics).toEqual([]);
    expect(n.edgeTypes.find((e) => e.type === 'worksAt')?.inverseEdge).toBe('hasEmployee');
    const sem = edgeSemantics(schemasFromGraph(vault([ontology]), 'Types/'));
    expect(sem.inverseOf.get('hasEmployee')).toBe('worksAt');
    expect(sem.inverseName.get('worksAt')).toBe('hasEmployee');
    expect([...sem.symmetric]).toEqual(['friendsWith']);
  });

  // @tg: verifies:: [[tests/inverse-edges#Inverse name read]] {level: unit}
  // @lat: [[tests/inverse-edges#Inverse name read]]
  it('rejects an inverseEdge that is not a name, and older readers see an unknown key', () => {
    expect(readSchemaNote('Types/X.md', { edgeTypes: { a: { inverseEdge: ['b'] } } }).diagnostics.map((d) => d.message)).toEqual(["Edge type 'a': `inverseEdge` must be an edge type name"]);
    expect(readSchemaNote('Types/X.md', { tgs: '0.8', edgeTypes: { a: { inverseEdge: 'b', reach: 1 } } }).diagnostics.map((d) => d.code)).toEqual(['unknown-key']);
  });

  // @tg: verifies:: [[tests/inverse-edges#Conflicting inverse names]] {level: unit}
  // @lat: [[tests/inverse-edges#Conflicting inverse names]]
  // @tg: verifies:: [[openspec:schema-notes#Inverse edge declarations#Inverse name declared twice]]
  it('reports an inverse name declared differently as an edge type, or claimed twice, as a conflict', () => {
    const g = vault([
      {
        path: 'Types/A.md',
        text: '',
        frontmatter: { edgeTypes: { has_part: { inverseEdge: 'part_of', properties: { count: 'number' } }, part_of: { properties: { note: 'text' } }, contains: { inverseEdge: 'inside' }, holds: { inverseEdge: 'inside' } } },
      },
    ]);
    const set = schemasFromGraph(g, 'Types/');
    expect(set.diagnostics.map((d) => [d.code, d.message])).toEqual([
      ['inverse-conflict', "Edge type 'has_part': inverse 'part_of' is also declared as an edge type in Types/A.md, and the two declarations differ; declare one direction only; inverseEdge ignored"],
      ['inverse-conflict', "Edge type 'holds': inverse 'inside' is already the inverse of 'contains' (Types/A.md); inverseEdge ignored"],
    ]);
    expect(set.edgeTypes.get('has_part')?.inverseEdge).toBeUndefined();
    expect(set.edgeTypes.has('part_of')).toBe(true);
    expect(set.edgeTypes.get('contains')?.inverseEdge).toBe('inside');
  });

  // @tg: verifies:: [[tests/inverse-edges#Repeated inverse declarations]] {level: unit}
  // @lat: [[tests/inverse-edges#Repeated inverse declarations]]
  // @tg: verifies:: [[openspec:schema-notes#Inverse edge declarations#Inverse name declared again the same way]]
  it('drops an edge type that repeats an inverse the same way, reversed, with a warning', () => {
    const g = vault([
      { path: 'Types/A.md', text: '', frontmatter: { edgeTypes: { has_part: { from: 'Whole', to: 'Part', inverseEdge: 'part_of', properties: { count: 'number' } } } } },
      // The other direction, declared again in another note, also pointing back.
      { path: 'Types/B.md', text: '', frontmatter: { edgeTypes: { part_of: { from: 'Part', to: 'Whole', inverseEdge: 'has_part', properties: { count: { kind: 'number' } } }, swapped: { from: 'A', to: 'B', inverseEdge: 'swapped_of' }, swapped_of: { from: 'A', to: 'B' } } } },
    ]);
    const set = schemasFromGraph(g, 'Types/');
    expect(set.diagnostics.map((d) => [d.code, d.path])).toEqual([
      ['inverse-duplicate', 'Types/B.md'],
      // Ends that do not swap are a different declaration.
      ['inverse-conflict', 'Types/B.md'],
    ]);
    expect(set.edgeTypes.has('part_of')).toBe(false);
    expect(set.edgeTypes.get('has_part')?.inverseEdge).toBe('part_of');
    expect(edgeSemantics(set).inverseOf.get('part_of')).toBe('has_part');
  });
});

describe('canonical edge view', () => {
  // @tg: verifies:: [[tests/inverse-edges#Inverse name is the same edge]] {level: unit}
  // @lat: [[tests/inverse-edges#Inverse name is the same edge]]
  // @tg: verifies:: [[openspec:graph-model#Canonical edge view#Inverse name turned around]]
  it('turns an edge written with the inverse name into the declared edge, reversed', () => {
    const g = vault([ontology, note('Ada.md', 'Person'), note('Acme.md', 'Company', '- hasEmployee:: [[Ada]] {role: engineer}')]);
    const view = canonicalView(g, schemasFromGraph(g, 'Types/'));
    const edges = [...view.edges()];
    expect(edges.map((e) => [e.type, e.source, e.target, e.written])).toEqual([['worksAt', 'Ada.md', 'Acme.md', { type: 'hasEmployee', reversed: true }]]);
    expect(view.outEdges('Ada.md').map((e) => e.type)).toEqual(['worksAt']);
    // The graph itself keeps the edge as written.
    expect([...g.edges()].map((e) => e.type)).toEqual(['hasEmployee']);
  });

  // @tg: verifies:: [[tests/inverse-edges#Both ends merge into one edge]] {level: unit}
  // @lat: [[tests/inverse-edges#Both ends merge into one edge]]
  // @tg: verifies:: [[openspec:graph-model#Canonical edge view#Both ends merged]]
  // @tg: verifies:: [[openspec:schema-notes#Inverse edge validation#Ends disagree]]
  it('merges the two written ends of one edge, and reports properties that differ', () => {
    const agree = vault([ontology, note('Ada.md', 'Person', '- worksAt:: [[Acme]] {role: engineer}'), note('Acme.md', 'Company', '- hasEmployee:: [[Ada]] {role: engineer}')]);
    const v1 = canonicalView(agree, schemasFromGraph(agree, 'Types/'));
    expect([...v1.edges()].map((e) => [e.id, e.type, e.merged])).toEqual([['Ada.md#worksAt#Acme.md#0', 'worksAt', ['Acme.md#hasEmployee#Ada.md#0']]]);
    expect(v1.diagnostics).toEqual([]);

    const differ = vault([ontology, note('Ada.md', 'Person', '- worksAt:: [[Acme]] {role: engineer}'), note('Acme.md', 'Company', '\n- hasEmployee:: [[Ada]] {role: manager}')]);
    const set = schemasFromGraph(differ, 'Types/');
    expect(canonicalView(differ, set).diagnostics).toEqual([
      { path: 'Acme.md', line: 1, column: 0, code: 'inverse-mismatch', message: `Edge 'worksAt' from Ada to Acme is written on both ends with different properties (role: "engineer" vs "manager"); both ends must agree` },
    ]);
    expect(validateSchemas(differ, set).map((d) => d.code)).toEqual(['inverse-mismatch']);
  });

  // @tg: verifies:: [[tests/inverse-edges#Both ends merge into one edge]] {level: unit}
  // @lat: [[tests/inverse-edges#Both ends merge into one edge]]
  it('reports one end asserting an edge the other denies', () => {
    const g = vault([ontology, note('Ada.md', 'Person', '- worksAt:: [[Acme]]'), note('Acme.md', 'Company', '- -hasEmployee:: [[Ada]]')]);
    const view = canonicalView(g, schemasFromGraph(g, 'Types/'));
    expect(view.diagnostics.map((d) => [d.path, d.code])).toEqual([['Acme.md', 'inverse-mismatch']]);
    expect(view.size.edges).toBe(2);
  });

  // @tg: verifies:: [[tests/inverse-edges#Symmetric edges hold both ways]] {level: unit}
  // @lat: [[tests/inverse-edges#Symmetric edges hold both ways]]
  // @tg: verifies:: [[openspec:graph-model#Canonical edge view#Symmetric ends merged]]
  it('merges a symmetric edge written from both ends and reads it from both', () => {
    const g = vault([ontology, note('Ada.md', 'Person', '- friendsWith:: [[Bob]]'), note('Bob.md', 'Person', '- friendsWith:: [[Ada]]'), note('Cy.md', 'Person', '- friendsWith:: [[Ada]]')]);
    const set = schemasFromGraph(g, 'Types/');
    const view = canonicalView(g, set);
    expect(view.size.edges).toBe(2);
    expect(view.diagnostics).toEqual([]);
    const sem = edgeSemantics(set);
    expect(edgesFrom(view, 'Ada.md', sem).map((x) => [x.name, x.edge.source, x.edge.target])).toEqual([
      ['friendsWith', 'Ada.md', 'Bob.md'],
      ['friendsWith', 'Cy.md', 'Ada.md'],
    ]);
  });

  // @tg: verifies:: [[tests/inverse-edges#Edges read from either end]] {level: unit}
  // @lat: [[tests/inverse-edges#Edges read from either end]]
  // @tg: verifies:: [[openspec:schema-notes#Edges read from either end#Name from each end]]
  it('names an edge from each of its ends', () => {
    const sem = edgeSemantics(schemasFromGraph(vault([ontology]), 'Types/'));
    const e = { type: 'worksAt', source: 'Ada.md', target: 'Acme.md' };
    expect(nameFrom(e, 'Ada.md', sem)).toBe('worksAt');
    expect(nameFrom(e, 'Acme.md', sem)).toBe('hasEmployee');
    const w = { type: 'hasEmployee', source: 'Acme.md', target: 'Ada.md' };
    expect(nameFrom(w, 'Acme.md', sem)).toBe('hasEmployee');
    expect(nameFrom(w, 'Ada.md', sem)).toBe('worksAt');
    expect(nameFrom({ type: 'cites', source: 'a', target: 'b' }, 'b', sem)).toBe('cites');
  });

  it('is the graph itself without inverse declarations, and rebuilds when the graph changes', () => {
    const g = vault([note('Ada.md', 'Person', '- worksAt:: [[Acme]]')]);
    const set = schemasFromGraph(g, 'Types/');
    expect([...canonicalView(g, set).edges()]).toEqual([...g.edges()]);
    const g2 = vault([ontology, note('Ada.md', 'Person'), note('Acme.md', 'Company')]);
    const set2 = schemasFromGraph(g2, 'Types/');
    expect(canonicalView(g2, set2).size.edges).toBe(0);
    g2.upsertNote(note('Acme.md', 'Company', '- hasEmployee:: [[Ada]]'));
    expect(canonicalView(g2, set2).size.edges).toBe(1);
  });
});

describe('validation with inverse edges', () => {
  // @tg: verifies:: [[tests/inverse-edges#Validation reads the declared direction]] {level: unit}
  // @lat: [[tests/inverse-edges#Validation reads the declared direction]]
  // @tg: verifies:: [[openspec:schema-notes#Inverse edge validation#Endpoints checked in the declared direction]]
  it('checks endpoints, properties and counts on the declared direction', () => {
    const g = vault([
      ontology,
      note('Ada.md', 'Person', '- worksAt:: [[Acme]]'),
      note('Acme.md', 'Company', '- hasEmployee:: [[Ada]]'),
      note('Initech.md', 'Company', '- hasEmployee:: [[Ada]] {role: intern}\n- hasEmployee:: [[Globex]]'),
      note('Globex.md', 'Company'),
    ]);
    const diags = validateSchemas(g, schemasFromGraph(g, 'Types/')).filter((d) => d.code !== 'missing-inverse');
    expect(diags.map((d) => [d.path, d.code, d.message])).toEqual([
      ['Initech.md', 'too-many-edges', "Edge type 'worksAt' allows one edge for Person, found 2"],
      ['Initech.md', 'edge-value-not-allowed', "Edge property 'role' value 'intern' is not one of: engineer, manager"],
      ['Initech.md', 'wrong-target-type', "Edge 'hasEmployee' expects target type Person, found Company"],
      ['Initech.md', 'wrong-source-type', "Edge 'worksAt' expects source type Person, found Company"],
    ]);
  });

  // @tg: verifies:: [[tests/inverse-edges#Validation reads the declared direction]] {level: unit}
  // @lat: [[tests/inverse-edges#Validation reads the declared direction]]
  // @tg: verifies:: [[openspec:schema-notes#Inverse edge validation#Other end satisfies a required edge]]
  it('lets an edge written from the other end satisfy a required edge', () => {
    const o: NoteInput = { ...ontology, frontmatter: { ...ontology.frontmatter, schemas: { Person: { edges: { worksAt: { target: 'Company', required: true } } }, Company: { edges: ['hasEmployee'] } } } };
    const g = vault([o, note('Ada.md', 'Person'), note('Bob.md', 'Person'), note('Acme.md', 'Company', '- hasEmployee:: [[Ada]]')]);
    expect(validateSchemas(g, schemasFromGraph(g, 'Types/')).filter((d) => d.code !== 'missing-inverse').map((d) => [d.path, d.code])).toEqual([['Bob.md', 'missing-edge']]);
  });

  // @tg: verifies:: [[tests/inverse-edges#Lone ends reported]] {level: unit}
  // @lat: [[tests/inverse-edges#Lone ends reported]]
  // @tg: verifies:: [[openspec:schema-notes#Inverse edge validation#Lone end reported]]
  it('reports an edge written at one end only, at that end', () => {
    const g = vault([
      ontology,
      note('Ada.md', 'Person', '- worksAt:: [[Acme]]\n- friendsWith:: [[Bob]]\n- friendsWith:: [[Ada]]\n- worksAt:: [[Nowhere]]'),
      note('Bob.md', 'Person', '- friendsWith:: [[Ada]]'),
      note('Acme.md', 'Company', '\n- -hasEmployee:: [[Cy]]'),
      note('Cy.md', 'Person'),
    ]);
    const lone = validateSchemas(g, schemasFromGraph(g, 'Types/')).filter((d) => d.code === 'missing-inverse');
    // Not reported: the friendship written on both ends, the self-loop, and the edge to a missing note.
    expect(lone.map((d) => [d.path, d.line, d.message])).toEqual([
      ['Ada.md', 0, "Edge 'worksAt' to Acme is written only here; Acme has no 'hasEmployee:: [[Ada]]' (tg inverses --write adds it)"],
      ['Acme.md', 1, "Edge 'hasEmployee' to Cy is written only here; Cy has no '-worksAt:: [[Acme]]' (tg inverses --write adds it)"],
    ]);
  });
});

describe('cypher over inverse edges', () => {
  const graph = () => vault([ontology, note('Ada.md', 'Person', '- friendsWith:: [[Bob]]'), note('Bob.md', 'Person'), note('Acme.md', 'Company', '- hasEmployee:: [[Ada]] {role: engineer}')]);
  const run = (g: Graph, q: string) => new BuiltinEngine(g, () => ({ schemas: schemasFromGraph(g, 'Types/') })).run(q).rows;

  // @tg: verifies:: [[tests/inverse-edges#Queries match either name]] {level: unit}
  // @lat: [[tests/inverse-edges#Queries match either name]]
  // @tg: verifies:: [[openspec:cypher-query#Inverse and symmetric patterns#Inverse name in a pattern]]
  it('matches the declared name and the inverse name, whichever was written', () => {
    const g = graph();
    expect(run(g, 'MATCH (p:Person)-[r:worksAt]->(c:Company) RETURN p.title, c.title, r.role, type(r)')).toEqual([['Ada', 'Acme', 'engineer', 'worksAt']]);
    expect(run(g, 'MATCH (c:Company)-[:hasEmployee]->(p) RETURN c.title, p.title')).toEqual([['Acme', 'Ada']]);
    expect(run(g, 'MATCH (p)<-[:hasEmployee]-(c) RETURN p.title, c.title')).toEqual([['Ada', 'Acme']]);
    expect(run(g, 'MATCH (p:Person)-[:hasEmployee]->(c) RETURN p.title, c.title')).toEqual([]);
    expect(run(g, 'MATCH (c)<-[:worksAt]-(p) RETURN c.title, p.title')).toEqual([['Acme', 'Ada']]);
  });

  // @tg: verifies:: [[tests/inverse-edges#Queries match either name]] {level: unit}
  // @lat: [[tests/inverse-edges#Queries match either name]]
  // @tg: verifies:: [[openspec:cypher-query#Inverse and symmetric patterns#Symmetric pattern]]
  it('matches a symmetric edge in both directions', () => {
    const g = graph();
    expect(run(g, "MATCH (a {title: 'Bob'})-[:friendsWith]->(b) RETURN b.title")).toEqual([['Ada']]);
    expect(run(g, "MATCH (a {title: 'Ada'})-[:friendsWith]->(b) RETURN b.title")).toEqual([['Bob']]);
    expect(run(g, 'MATCH (a)-[:friendsWith]-(b) RETURN count(*)')).toEqual([[2]]);
  });

  // @tg: verifies:: [[tests/inverse-edges#Directed symmetric patterns noticed]] {level: unit}
  // @lat: [[tests/inverse-edges#Directed symmetric patterns noticed]]
  // @tg: verifies:: [[openspec:cypher-query#Directed patterns on symmetric edges#Directed symmetric pattern noticed]]
  // @tg: verifies:: [[openspec:cypher-query#Directed patterns on symmetric edges#Undirected symmetric pattern quiet]]
  it('notes that a directed pattern on a symmetric edge type matches both ways', () => {
    const g = graph();
    const engine = new BuiltinEngine(g, () => ({ schemas: schemasFromGraph(g, 'Types/') }));
    const directed = engine.run('MATCH (a)-[:friendsWith]->(b) MATCH (b)<-[:friendsWith]-(c) RETURN count(*)');
    expect(directed.notices).toEqual(["'friendsWith' is symmetric, so the directed pattern matches it in both directions; write -[:friendsWith]- to match it undirected."]);
    expect(engine.run('MATCH (a)-[:friendsWith]-(b) RETURN b').notices).toBeUndefined();
    expect(engine.run('MATCH (a)-[:worksAt]->(b) RETURN b').notices).toBeUndefined();
  });

  // @tg: verifies:: [[tests/inverse-edges#Directed symmetric patterns match undirected]] {level: unit}
  // @lat: [[tests/inverse-edges#Directed symmetric patterns match undirected]]
  // @tg: verifies:: [[openspec:cypher-query#Inverse and symmetric patterns#Symmetric pattern]]
  it('gives a directed pattern on a symmetric type the same rows as the undirected one', () => {
    const notes: NoteInput[] = [
      { path: 'Types/E.md', text: '', frontmatter: { edgeTypes: { friendsWith: { inverseEdge: 'friendsWith' }, knows: {} } } },
      // Both ends written (Bob and Cy), one end only (Ada to Bob), a self-loop (Ada) and an unrelated directed edge.
      note('Ada.md', 'Person', '- friendsWith:: [[Bob]]\n- friendsWith:: [[Ada]]\n- knows:: [[Bob]]'),
      note('Bob.md', 'Person', '- friendsWith:: [[Cy]]'),
      note('Cy.md', 'Person', '- friendsWith:: [[Bob]]'),
    ];
    const g = vault(notes);
    const engine = new BuiltinEngine(g, () => ({ schemas: schemasFromGraph(g, 'Types/') }));
    const rows = (q: string) => engine.run(q).rows.map((r) => JSON.stringify(r)).sort();
    const undirected = rows('MATCH (a)-[:friendsWith]-(b) RETURN a.title, b.title');
    expect(undirected.length).toBeGreaterThan(0);
    expect(rows('MATCH (a)-[:friendsWith]->(b) RETURN a.title, b.title')).toEqual(undirected);
    expect(rows('MATCH (a)<-[:friendsWith]-(b) RETURN a.title, b.title')).toEqual(undirected);
    expect(rows('MATCH (a)-[:friendsWith*1..3]->(b) RETURN a.title, b.title')).toEqual(rows('MATCH (a)-[:friendsWith*1..3]-(b) RETURN a.title, b.title'));
    // In an alternation only the symmetric type is undirected; knows keeps its direction.
    expect(rows('MATCH (a)-[:friendsWith|knows]->(b) RETURN a.title, b.title')).toEqual([...undirected, JSON.stringify(['Ada', 'Bob'])].sort());
    // Without the ontology the pattern stays directed.
    expect(new BuiltinEngine(g).run("MATCH ({title: 'Cy'})<-[:friendsWith]-(b) RETURN b.title").rows).toEqual([['Bob']]);
    expect(new BuiltinEngine(g).run("MATCH ({title: 'Ada'})<-[:friendsWith]-(b) RETURN b.title").rows).toEqual([['Ada']]);
  });

  it('keeps queries as before without schemas', () => {
    const g = graph();
    expect(new BuiltinEngine(g).run('MATCH ()-[r:hasEmployee]->() RETURN count(r)').rows).toEqual([[1]]);
    expect(new BuiltinEngine(g).run('MATCH ()-[r:worksAt]->() RETURN count(r)').rows).toEqual([[0]]);
  });
});
