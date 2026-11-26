import { Parser } from 'n3';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import {
  BuiltinEngine,
  buildLatGraph,
  concreteTypes,
  Graph,
  LatIndex,
  luhmannTypes,
  planNewNote,
  readSchemaNote,
  schemaSetFromNotes,
  schemasFromGraph,
  splitFrontmatter,
  subtypesOf,
  validateSchemas,
  validateVault,
  withSupertypes,
  type NoteInput,
  type SchemaSet,
} from '../src/index.js';
import { exportShacl, importShacl, planImport } from '../src/shacl.js';

const LEGAL = {
  tgs: '0.7',
  schemas: {
    LegalEntity: { abstract: true, properties: { name: { kind: 'text', required: true } }, edges: { owns: 'Patent' }, visualization: { color: 'blue', shape: 'rectangle' }, id: 'uuid', template: '[[Templates/Entity]]' },
    Person: { is: ['LegalEntity'], properties: { email: { kind: 'text', required: true } }, edges: { worksAt: 'Company', knows: 'Person' }, visualization: { shape: 'ellipse' } },
    Company: { is: 'LegalEntity', uri: 'schema:Organization', properties: { founded: 'date', name: { kind: 'text', default: 'Acme' } } },
    GeneralLegalEntity: { is: 'LegalEntity' },
    Patent: { properties: { id: 'text' } },
  },
  edgeTypes: { owns: { from: 'LegalEntity', to: 'Patent', properties: { since: 'date' } } },
};

const setOf = (notes: Record<string, Record<string, unknown>>): SchemaSet => schemaSetFromNotes(Object.entries(notes).map(([p, fm]) => readSchemaNote(p, fm)));
const codes = (set: SchemaSet) => set.diagnostics.map((d) => d.code).sort();

function vault(notes: NoteInput[]): Graph {
  const paths = new Set(notes.map((n) => n.path));
  const graph = new Graph((l) => [...paths].find((p) => p === `${l}.md` || p.endsWith(`/${l}.md`)) ?? null);
  for (const n of notes) graph.upsertNote(n);
  return graph;
}
const note = (path: string, type: string | string[], text = '', props: Record<string, unknown> = {}): NoteInput => ({ path, text, frontmatter: { type, ...props } });
const legalNote: NoteInput = { path: 'Types/Legal.md', text: '', frontmatter: LEGAL };

describe('type inheritance', () => {
  // @tg: verifies:: [[tests/type-inheritance#Inherited declarations]] {level: unit}
  // @lat: [[tests/type-inheritance#Inherited declarations]]
  // @tg: verifies:: [[openspec:schema-notes#Type inheritance#Inherited property]]
  // @tg: verifies:: [[openspec:schema-notes#Type inheritance#Own declaration wins]]
  it('adds what a type inherits after its own declarations and records its supertypes', () => {
    const set = setOf({ 'Types/Legal.md': LEGAL });
    expect(set.diagnostics).toEqual([]);
    const person = set.schemas.get('Person')!;
    // `id: uuid` on the supertype brings its `id` property along.
    expect(person.properties.map((p) => p.name)).toEqual(['email', 'name', 'id']);
    expect(person.properties.find((p) => p.name === 'name')!.required).toBe(true);
    expect(person.edges!.map((e) => e.type)).toEqual(['worksAt', 'knows', 'owns']);
    expect(person.style).toEqual({ color: 'blue', shape: 'ellipse' });
    expect(person.uri).toBeNull();
    expect(person.is).toEqual(['LegalEntity']);
    // A redeclared property of the same kind is the type's own.
    expect(set.schemas.get('Company')!.properties.find((p) => p.name === 'name')).toMatchObject({ default: 'Acme', required: false });
    expect(set.schemas.get('Company')!.uri).toBe('schema:Organization');
    // `declared` keeps the type as written.
    expect(set.declared.get('Person')!.properties.map((p) => p.name)).toEqual(['email']);
    expect(set.supertypes.get('Person')).toEqual(['LegalEntity']);
    expect(set.supertypes.has('Patent')).toBe(false);
    expect(subtypesOf('LegalEntity', set).sort()).toEqual(['Company', 'GeneralLegalEntity', 'Person']);
    expect(withSupertypes(['Person', 'Patent'], set)).toEqual(['Person', 'Patent', 'LegalEntity']);
  });

  // @tg: verifies:: [[tests/type-inheritance#Supertypes through several levels]] {level: unit}
  // @lat: [[tests/type-inheritance#Supertypes through several levels]]
  it('inherits through abstract types that themselves declare is, nearest first and without duplicates', () => {
    const set = setOf({
      'Types/T.md': {
        schemas: {
          Thing: { abstract: true, properties: { label: 'text' } },
          Agent: { abstract: true, is: 'Thing', properties: { handle: 'text' } },
          Owner: { abstract: true, is: 'Thing', properties: { assets: 'list' } },
          Org: { is: ['Agent', 'Owner'] },
        },
      },
    });
    expect(set.diagnostics).toEqual([]);
    expect(set.supertypes.get('Org')).toEqual(['Agent', 'Thing', 'Owner']);
    expect(set.schemas.get('Org')!.properties.map((p) => p.name)).toEqual(['handle', 'label', 'assets']);
  });

  // @tg: verifies:: [[tests/type-inheritance#Templates and ids inherited]] {level: unit}
  // @lat: [[tests/type-inheritance#Templates and ids inherited]]
  // @tg: verifies:: [[openspec:schema-notes#Type inheritance#Template and ids inherited]]
  it('inherits template and ids as a fallback, and the template body of a schema: note from its note', () => {
    const set = setOf({ 'Types/Legal.md': LEGAL, 'Types/Base.md': { schema: { abstract: true, id: { kind: 'timestamp', property: 'stamp' } } }, 'Types/Sub.md': { schemas: { Sub: { is: 'Base' } } } });
    const person = set.schemas.get('Person')!;
    expect(person.template).toBe('[[Templates/Entity]]');
    expect(person.templateNote).toBe('Types/Legal.md');
    expect(person.ids.map((r) => r.kind)).toEqual(['uuid']);
    const sub = set.schemas.get('Sub')!;
    expect(sub).toMatchObject({ bodyIsTemplate: true, templateNote: 'Types/Base.md', template: null });
    expect(sub.properties.map((p) => p.name)).toEqual(['stamp']);
    const plan = planNewNote({ schema: sub, title: 'X', linkedBody: null, templatePath: null, schemaBody: '## From base\n', graph: new Graph(() => null), now: new Date(2026, 10, 26, 9, 30) });
    expect(plan.content).toContain('## From base');
    expect(plan.content).toContain('stamp: "202611260930"');
  });

  // @tg: verifies:: [[tests/type-inheritance#Inheritance diagnostics]] {level: unit}
  // @lat: [[tests/type-inheritance#Inheritance diagnostics]]
  // @tg: verifies:: [[openspec:schema-notes#Inheritance diagnostics#Conflicting kinds]]
  // @tg: verifies:: [[openspec:schema-notes#Inheritance diagnostics#Supertype not usable]]
  it('reports conflicting kinds, unknown and concrete supertypes and cycles, and ignores the bad supertypes', () => {
    const set = setOf({
      'Types/B.md': {
        schemas: {
          Asset: { abstract: true, properties: { value: 'number' } },
          Valued: { abstract: true, properties: { value: 'text' } },
          Vehicle: { is: ['Asset', 'Valued'] },
          Building: { is: 'Asset', properties: { value: 'date' } },
          Concrete: {},
          Robot: { is: ['Concrete', 'Machine'] },
          A: { abstract: true, is: 'B' },
          B: { abstract: true, is: 'A' },
          Self: { abstract: true, is: 'Self' },
        },
      },
    });
    expect(codes(set)).toEqual(['base-not-abstract', 'inheritance-cycle', 'inheritance-cycle', 'property-conflict', 'property-conflict', 'unknown-base-type']);
    expect(set.diagnostics.find((d) => d.message.includes("'Vehicle'"))!.message).toContain("inherited as number from 'Asset' and as text from 'Valued'");
    expect(set.diagnostics.find((d) => d.message.includes("'Building'"))!.message).toContain("declared as date but inherited from 'Asset' as number");
    // The first declaration wins; ignored supertypes add nothing.
    expect(set.schemas.get('Vehicle')!.properties).toMatchObject([{ name: 'value', kind: 'number' }]);
    expect(set.schemas.get('Building')!.properties).toMatchObject([{ name: 'value', kind: 'date' }]);
    expect(set.supertypes.has('Robot')).toBe(false);
    expect(validateVault([{ path: 'Types/B.md', text: '', frontmatter: { schemas: { Robot: { is: 'Nope' } } } }], { schemaOnly: true })).toMatchObject([{ code: 'unknown-base-type', severity: 'error' }]);
  });

  // @tg: verifies:: [[tests/type-inheritance#Base type matches subtypes]] {level: unit}
  // @lat: [[tests/type-inheritance#Base type matches subtypes]]
  // @tg: verifies:: [[openspec:schema-notes#Base type queries#Query on a base type]]
  it('gives nodes the supertypes of their types, so a query on a base type finds every subtype', () => {
    const graph = vault([legalNote, note('Alice.md', 'Person', 'owns:: [[P1]]'), note('Acme.md', 'Company', 'owns:: [[P1]]'), note('P1.md', 'Patent')]);
    graph.setTypeHierarchy(schemasFromGraph(graph, 'Types/').supertypes);
    expect(graph.node('Alice.md')!.labels).toEqual(['Person', 'LegalEntity']);
    expect(graph.writtenLabels('Alice.md')).toEqual(['Person']);
    const rows = new BuiltinEngine(graph).run('MATCH (a:LegalEntity)-[:owns]->(p:Patent) RETURN a.title AS who ORDER BY who').rows;
    expect(rows).toEqual([['Acme'], ['Alice']]);
    expect(new BuiltinEngine(graph).run('MATCH (a:Person) RETURN count(a) AS n').rows).toEqual([[1]]);
  });

  // @tg: verifies:: [[tests/type-inheritance#Hierarchy follows schema edits]] {level: unit}
  // @lat: [[tests/type-inheritance#Hierarchy follows schema edits]]
  // @tg: verifies:: [[openspec:schema-notes#Base type queries#Hierarchy follows schema edits]]
  it('relabels nodes when the hierarchy changes and reports only the nodes that changed', () => {
    const graph = vault([legalNote, note('Alice.md', 'Person'), note('P1.md', 'Patent')]);
    const changed: string[][] = [];
    graph.onChange((p) => changed.push(p));
    graph.setTypeHierarchy(schemasFromGraph(graph, 'Types/').supertypes);
    expect(changed).toEqual([['Alice.md']]);
    graph.setTypeHierarchy(schemasFromGraph(graph, 'Types/').supertypes);
    expect(changed).toHaveLength(1);
    // A note added later gets its supertypes at once.
    graph.upsertNote(note('Bob.md', 'Person'));
    expect(graph.node('Bob.md')!.labels).toEqual(['Person', 'LegalEntity']);
    graph.upsertNote({ ...legalNote, frontmatter: { schemas: { Person: {} } } });
    graph.setTypeHierarchy(schemasFromGraph(graph, 'Types/').supertypes);
    expect(graph.node('Alice.md')!.labels).toEqual(['Person']);
    graph.removeNote('Bob.md');
    graph.setTypeHierarchy(null);
    expect(graph.writtenLabels('Bob.md')).toEqual([]);
  });

  // @tg: verifies:: [[tests/type-inheritance#Edges accept subtypes]] {level: unit}
  // @lat: [[tests/type-inheritance#Edges accept subtypes]]
  // @tg: verifies:: [[openspec:schema-notes#Base type queries#Edge rules name a base type]]
  it('accepts a subtype wherever an edge type or edge rule names its supertype, without the graph knowing the hierarchy', () => {
    const graph = vault([
      { path: 'Types/Legal.md', text: '', frontmatter: { ...LEGAL, schemas: { ...LEGAL.schemas, Patent: { properties: { id: 'text' }, edges: { heldBy: 'LegalEntity' } } } } },
      note('Alice.md', 'Person', 'owns:: [[P1]]', { name: 'Alice', email: 'a@x' }),
      note('Estate.md', 'GeneralLegalEntity', 'owns:: [[P1]]', { name: 'Estate' }),
      note('P1.md', 'Patent', 'heldBy:: [[Alice]]\nheldBy:: [[P1]]\nowns:: [[Alice]]'),
    ]);
    const diags = validateSchemas(graph, schemasFromGraph(graph, 'Types/'));
    expect(diags.map((d) => `${d.path}:${d.line}:${d.code}`).sort()).toEqual(['P1.md:1:wrong-target-type', 'P1.md:2:edge-not-allowed', 'P1.md:2:wrong-source-type', 'P1.md:2:wrong-target-type']);
  });

  // @tg: verifies:: [[tests/type-inheritance#Inherited properties validated]] {level: unit}
  // @lat: [[tests/type-inheritance#Inherited properties validated]]
  it('checks notes of a subtype against the properties and edges they inherit', () => {
    const graph = vault([legalNote, note('Alice.md', 'Person', 'owns:: [[P1]]\nfounded:: [[P1]]', { email: 'a@x' }), note('P1.md', 'Patent')]);
    const diags = validateSchemas(graph, schemasFromGraph(graph, 'Types/'));
    expect(diags.map((d) => d.code).sort()).toEqual(['edge-not-allowed', 'missing-property']);
    expect(diags.find((d) => d.code === 'missing-property')!.message).toContain("'name' for type Person");
  });

  // @tg: verifies:: [[tests/type-inheritance#Abstract type not written]] {level: unit}
  // @lat: [[tests/type-inheritance#Abstract type not written]]
  // @tg: verifies:: [[openspec:schema-notes#Abstract types#Note of an abstract type]]
  it('reports a note whose written type is abstract as an error, naming the subtypes', () => {
    const findings = validateVault([legalNote, note('Somebody.md', 'LegalEntity', '', { name: 'X' }), note('Alice.md', 'Person', '', { name: 'A', email: 'a' })]);
    expect(findings).toEqual([{ code: 'abstract-type', severity: 'error', path: 'Somebody.md', line: null, message: "Type 'LegalEntity' is abstract; use one of its subtypes (Person, Company, GeneralLegalEntity)" }]);
  });

  // @tg: verifies:: [[tests/type-inheritance#Abstract types not offered]] {level: unit}
  // @lat: [[tests/type-inheritance#Abstract types not offered]]
  // @tg: verifies:: [[openspec:typed-note-creation#Abstract types are not offered#Picker lists concrete types]]
  it('leaves abstract types out of the types a note can be created as', () => {
    const set = setOf({ 'Types/Legal.md': LEGAL, 'Types/Z.md': { schemas: { Card: { abstract: true, id: { kind: 'luhmann', property: 'zk' } }, Note: { is: 'Card' } } } });
    expect(concreteTypes(set).map((t) => t.type).sort()).toEqual(['Company', 'GeneralLegalEntity', 'Note', 'Patent', 'Person']);
    expect(luhmannTypes(set).map((t) => t.type)).toEqual(['Note']);
  });

  // @tg: verifies:: [[tests/type-inheritance#SHACL keeps supertypes]] {level: unit}
  // @lat: [[tests/type-inheritance#SHACL keeps supertypes]]
  // @tg: verifies:: [[openspec:shacl-interop#Type inheritance in SHACL#Supertypes exported as subclasses]]
  // @tg: verifies:: [[openspec:shacl-interop#Type inheritance in SHACL#Round trip keeps supertypes]]
  it('exports own declarations with rdfs:subClassOf and tgs:abstract, and imports them back', () => {
    const set = setOf({ 'Types/Legal.md': LEGAL });
    const ttl = exportShacl(set);
    new Parser().parse(ttl);
    expect(ttl).toContain(':Person\n    rdfs:subClassOf :LegalEntity .');
    expect(ttl).toContain('schema:Organization\n    rdfs:subClassOf :LegalEntity .');
    expect(ttl).toMatch(/:LegalEntityShape\n {4}a sh:NodeShape ;[\s\S]*?tgs:abstract true ;/);
    // Person's shape has only its own email property.
    const personShape = ttl.slice(ttl.indexOf(':PersonShape'), ttl.indexOf('\n\n', ttl.indexOf(':PersonShape')));
    expect(personShape).toContain('sh:name "email"');
    expect(personShape).not.toContain('sh:name "name"');

    const imported = importShacl(ttl);
    expect(imported.dropped).toEqual([]);
    expect(imported.types.find((t) => t.type === 'Person')).toMatchObject({ is: ['LegalEntity'] });
    expect(imported.types.find((t) => t.type === 'LegalEntity')).toMatchObject({ abstract: true });
    const plan = planImport(imported, [], { layout: 'single', into: 'Legal' });
    const back = schemaSetFromNotes(
      plan.writes.map((w) => {
        const fm = parseYaml(splitFrontmatter(w.text).yaml ?? '') as Record<string, unknown>;
        return readSchemaNote(w.path, fm);
      }),
    );
    expect(back.diagnostics).toEqual([]);
    expect(back.supertypes).toEqual(set.supertypes);
    expect(exportShacl(back).replace(/tgs:note "[^"]*"/g, '')).toBe(ttl.replace(/tgs:note "[^"]*"/g, ''));
  });

  // @tg: verifies:: [[tests/type-inheritance#Docs graph uses the hierarchy]] {level: unit}
  // @lat: [[tests/type-inheritance#Docs graph uses the hierarchy]]
  it('adds supertypes to section labels in the lat.md graph', () => {
    const index = new LatIndex([{ path: 'lat.md/people.md', text: '---\ntype: Person\n---\n# People\n\nEveryone.\n\n## Alice\n\nAn engineer.\n' }]);
    const set = setOf({ 'Types/Legal.md': LEGAL });
    const graph = buildLatGraph(index, { schemas: set }).graph;
    expect(graph.node('lat.md/people#People#Alice')!.labels).toEqual(['Section', 'Person', 'LegalEntity']);
    expect(new BuiltinEngine(graph).run('MATCH (s:LegalEntity) RETURN s.title AS t').rows).toEqual([['Alice']]);
  });
});
