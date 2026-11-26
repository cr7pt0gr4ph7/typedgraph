import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Parser, type Quad } from 'n3';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { readSchemaNote, schemaSetFromNotes, splitFrontmatter, type SchemaSet } from '../src/index.js';
import { exportOwl } from '../src/owl.js';
import { exportShacl } from '../src/shacl.js';

const OWL = 'http://www.w3.org/2002/07/owl#';
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
const SH = 'http://www.w3.org/ns/shacl#';
const DECLARATIONS = ['Class', 'ObjectProperty', 'DatatypeProperty', 'AnnotationProperty', 'Ontology'].map((t) => `${OWL}${t}`);

const setOf = (notes: Record<string, Record<string, unknown>>): SchemaSet => schemaSetFromNotes(Object.entries(notes).map(([p, fm]) => readSchemaNote(p, fm)));
const quadsOf = (ttl: string): Quad[] => new Parser().parse(ttl);
const objects = (qs: Quad[], s: string, p: string) => qs.filter((q) => q.subject.value === s && q.predicate.value === p).map((q) => q.object.value);
/** Named terms by their OWL declaration: IRI → declared types. */
function declared(qs: Quad[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const q of qs)
    if (q.subject.termType === 'NamedNode' && q.predicate.value === `${RDF}type` && DECLARATIONS.includes(q.object.value)) m.set(q.subject.value, [...(m.get(q.subject.value) ?? []), q.object.value.slice(OWL.length)]);
  return m;
}
/** The restrictions on a class, as `onProperty kind value` strings; blank-node values are shown as `_`. */
function restrictions(qs: Quad[], cls: string): string[] {
  const out: string[] = [];
  for (const node of objects(qs, cls, `${RDFS}subClassOf`)) {
    const on = objects(qs, node, `${OWL}onProperty`)[0]!;
    for (const k of ['minCardinality', 'maxCardinality', 'allValuesFrom', 'someValuesFrom']) {
      const q = qs.find((x) => x.subject.value === node && x.predicate.value === `${OWL}${k}`);
      if (q) out.push(`${on.split(/[:#/]/).pop()} ${k} ${q.object.termType === 'BlankNode' ? '_' : q.object.value.split(/[:#/]/).pop()}`);
    }
  }
  return out;
}

function exampleSets(): [string, SchemaSet][] {
  const root = join(__dirname, '../../../spec/tgs/examples');
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
  return readdirSync(root)
    .sort()
    .map((name) => {
      const vault = join(root, name, 'vault');
      const notes = walk(vault)
        .filter((f) => relative(vault, f).startsWith('Types/') && f.endsWith('.md'))
        .sort()
        .map((f) => {
          const yaml = splitFrontmatter(readFileSync(f, 'utf8')).yaml;
          return readSchemaNote(relative(vault, f), yaml === null ? null : (parseYaml(yaml) as Record<string, unknown>));
        });
      return [name, schemaSetFromNotes(notes)];
    });
}

const PEOPLE = {
  schemas: {
    Person: {
      description: 'A human being.',
      properties: { born: 'date', email: { required: true }, status: { values: ['active', 'retired'], default: 'active' }, aliases: 'list', site: 'link' },
      edges: { worksAt: 'Company', mentor: { target: 'Person', many: false }, knows: [ 'Person', 'Bot' ], manager: { target: 'Person', required: true }, likes: { required: true } },
    },
    Bot: { properties: { born: 'datetime' } },
    Company: { uri: 'schema:Organization', edges: [] },
  },
  edgeTypes: { worksAt: { from: 'Person', to: ['Company', 'Team'], description: 'Employment.', properties: { since: 'date', role: { required: true, values: ['dev', 'ops'] } }, visualization: { color: 'green' } } },
};

describe('OWL export', () => {
  const set = setOf({ 'Types/People.md': PEOPLE });
  const { turtle, losses } = exportOwl(set, { label: 'Types' });
  const qs = quadsOf(turtle);

  it('preserves inheritance, inverse names and symmetric edge types', () => {
    const schemas = setOf({ 'Types/Graph.md': {
      schemas: { Entity: { abstract: true, properties: { name: 'text' } }, Person: { is: 'Entity' } },
      edgeTypes: { worksAt: { from: 'Person', to: 'Entity', inverseEdge: 'employs' }, knows: { inverseEdge: 'knows' } },
    } });
    const quads = quadsOf(exportOwl(schemas).turtle);
    expect(objects(quads, 'urn:tgs:Person', `${RDFS}subClassOf`)).toContain('urn:tgs:Entity');
    expect(objects(quads, 'urn:tgs:Entity', 'https://typedgraph.org/ns/tgs#abstract')).toEqual(['true']);
    expect(objects(quads, 'urn:tgs:worksAt', `${OWL}inverseOf`)).toEqual(['urn:tgs:employs']);
    expect(objects(quads, 'urn:tgs:employs', `${RDF}type`)).toContain(`${OWL}ObjectProperty`);
    expect(objects(quads, 'urn:tgs:knows', `${RDF}type`)).toContain(`${OWL}SymmetricProperty`);
  });

  // @tg: verifies:: [[openspec:owl-export#Export schemas as OWL#Deterministic ontology]] {level: unit}
  // @lat: [[tests/owl-export#Export writes an OWL ontology]]
  it('writes one ontology that parses as Turtle, deterministically', () => {
    expect(objects(qs, 'urn:tgs:', `${RDF}type`)).toEqual([`${OWL}Ontology`]);
    expect(objects(qs, 'urn:tgs:', `${RDFS}label`)).toEqual(['Types']);
    expect(objects(qs, 'urn:tgs:', `${OWL}versionInfo`)[0]).toMatch(/^TGS 0\.\d+$/);
    expect(exportOwl(set, { label: 'Types' }).turtle).toBe(turtle);
    expect(exportOwl(set, { ontologyIri: 'https://example.org/onto' }).turtle).toContain('<https://example.org/onto>\n    a owl:Ontology');
    const empty = exportOwl(setOf({}));
    expect(declared(quadsOf(empty.turtle))).toEqual(new Map([['urn:tgs:', ['Ontology']]]));
    expect(empty.losses).toEqual([]);
  });

  // @tg: verifies:: [[openspec:owl-export#Class mapping#Types become classes]] {level: unit}
  // @lat: [[tests/owl-export#Types become classes]]
  it('declares every type and every referenced target type as a class, without disjointness', () => {
    const d = declared(qs);
    for (const c of ['urn:tgs:Person', 'urn:tgs:Bot', 'https://schema.org/Organization', 'urn:tgs:Team']) expect(d.get(c)).toEqual(['Class']);
    expect(objects(qs, 'urn:tgs:Person', `${RDFS}label`)).toEqual(['Person']);
    expect(objects(qs, 'urn:tgs:Person', `${RDFS}comment`)).toEqual(['A human being.']);
    expect(objects(qs, 'urn:tgs:Person', `${RDFS}isDefinedBy`)).toEqual(['urn:tgs:']);
    expect(objects(qs, 'https://schema.org/Organization', `${RDFS}isDefinedBy`)).toEqual([]);
    expect(qs.some((q) => q.predicate.value === `${OWL}disjointWith`)).toBe(false);
  });

  // @tg: verifies:: [[openspec:owl-export#Property mapping#Properties are global with local restrictions]] {level: unit}
  // @lat: [[tests/owl-export#Properties are global with local restrictions]]
  it('merges a property across types and writes cardinality and values as class restrictions', () => {
    const d = declared(qs);
    expect(d.get('urn:tgs:born')).toEqual(['DatatypeProperty']);
    expect(d.get('urn:tgs:site')).toEqual(['ObjectProperty']);
    expect(objects(qs, 'urn:tgs:email', `${RDFS}range`)).toEqual(['http://www.w3.org/2001/XMLSchema#string']);
    expect(objects(qs, 'urn:tgs:aliases', 'https://typedgraph.org/ns/tgs#kind')).toEqual(['list']);
    // born is a date on Person and a datetime on Bot: one property, a union domain and no range.
    const domain = objects(qs, 'urn:tgs:born', `${RDFS}domain`)[0]!;
    expect(objects(qs, domain, `${OWL}unionOf`)).toHaveLength(1);
    expect(objects(qs, 'urn:tgs:born', `${RDFS}range`)).toEqual([]);
    const r = restrictions(qs, 'urn:tgs:Person');
    expect(r).toEqual(expect.arrayContaining(['born maxCardinality 1', 'email minCardinality 1', 'email maxCardinality 1', 'status allValuesFrom _']));
    expect(r.filter((x) => x.startsWith('aliases'))).toEqual([]);
    expect(qs.some((q) => q.object.value === `${OWL}FunctionalProperty`)).toBe(false);
  });

  // @tg: verifies:: [[openspec:owl-export#Edge type mapping#Edge types become object properties]] {level: unit}
  // @lat: [[tests/owl-export#Edge types become object properties]]
  it('writes an edge type as an object property with domain and range', () => {
    const worksAt = 'urn:tgs:worksAt';
    expect(declared(qs).get(worksAt)).toEqual(['ObjectProperty']);
    expect(objects(qs, worksAt, `${RDFS}domain`)).toEqual(['urn:tgs:Person']);
    const range = objects(qs, worksAt, `${RDFS}range`)[0]!;
    expect(objects(qs, range, `${OWL}unionOf`)).toHaveLength(1);
    expect(objects(qs, worksAt, `${RDFS}comment`)).toEqual(['Employment.']);
    expect(objects(qs, worksAt, 'https://typedgraph.org/ns/tgs#visualization')).toEqual(['{"color":"green"}']);
  });

  // @tg: verifies:: [[openspec:owl-export#Edges of a type as restrictions#Edge entries become restrictions]] {level: unit}
  // @lat: [[tests/owl-export#Edges of a type become restrictions]]
  it('writes the edges of a type as restrictions on its class', () => {
    expect(restrictions(qs, 'urn:tgs:Person')).toEqual(
      expect.arrayContaining([
        'worksAt allValuesFrom Organization',
        'mentor allValuesFrom Person',
        'mentor maxCardinality 1',
        'knows allValuesFrom _',
        'manager allValuesFrom Person',
        'manager someValuesFrom Person',
        'likes minCardinality 1',
      ]),
    );
    expect(declared(qs).get('urn:tgs:likes')).toEqual(['ObjectProperty']);
    expect(objects(qs, 'urn:tgs:Person', 'https://typedgraph.org/ns/tgs#edgesClosed')).toEqual(['true']);
  });

  // @tg: verifies:: [[openspec:owl-export#Edge properties as annotation properties#Edge properties are annotation properties]] {level: unit}
  // @lat: [[tests/owl-export#Edge properties become annotation properties]]
  it('declares edge properties as annotation properties linked to their edge type', () => {
    expect(declared(qs).get('urn:tgs:since')).toEqual(['AnnotationProperty']);
    expect(objects(qs, 'urn:tgs:since', `${RDFS}range`)).toEqual(['http://www.w3.org/2001/XMLSchema#date']);
    expect(objects(qs, 'urn:tgs:role', 'https://typedgraph.org/ns/tgs#edgeType')).toEqual(['urn:tgs:worksAt']);
  });

  // @tg: verifies:: [[openspec:owl-export#Edges of a type as restrictions#Edge description on the axiom]] {level: unit}
  // @lat: [[tests/owl-export#Edge descriptions annotate their axiom]]
  it('annotates the restriction axiom of an edge entry with its description', () => {
    const s = setOf({ 'Types/A.md': { schemas: { A: { edges: { e: { target: 'B', description: 'Why A points at B.' }, f: { description: 'Nothing to annotate.' } } }, B: {} } } });
    const r = exportOwl(s);
    const q = quadsOf(r.turtle);
    const axiom = q.find((x) => x.predicate.value === `${RDF}type` && x.object.value === `${OWL}Axiom`)!.subject.value;
    expect(objects(q, axiom, `${OWL}annotatedSource`)).toEqual(['urn:tgs:A']);
    expect(objects(q, axiom, `${OWL}annotatedProperty`)).toEqual([`${RDFS}subClassOf`]);
    const target = objects(q, axiom, `${OWL}annotatedTarget`)[0]!;
    expect(objects(q, 'urn:tgs:A', `${RDFS}subClassOf`)).toContain(target);
    expect(objects(q, target, `${OWL}allValuesFrom`)).toEqual(['urn:tgs:B']);
    expect(objects(q, axiom, `${RDFS}comment`)).toEqual(['Why A points at B.']);
    expect(r.losses.map((l) => `${l.code} ${l.subject}`)).toContain('owl-edge-description A.f');
  });

  // @tg: verifies:: [[openspec:owl-export#Loss report#Losses listed]] {level: unit}
  // @lat: [[tests/owl-export#Loss report lists what OWL cannot say]]
  it('reports what OWL cannot express, sorted by code and subject', () => {
    expect(losses.map((l) => `${l.code} ${l.subject}`)).toEqual([
      'owl-closed-edges Company',
      'owl-closed-edges Person',
      'owl-default Person.status',
      'owl-edge-property-constraint worksAt.role',
      'owl-foreign-term schema:Organization',
      'owl-range-conflict :born',
    ]);
    for (const l of losses) expect(l.message.length).toBeGreaterThan(10);
  });

  // @tg: verifies:: [[openspec:owl-export#OWL 2 DL output#One role per term]] {level: unit}
  // @lat: [[tests/owl-export#A term has one role]]
  it('keeps one role per IRI when a name is both a property and an edge property', () => {
    const s = setOf({ 'Types/A.md': { schemas: { A: { properties: { since: 'date', homepage: { kind: 'link', values: ['https://example.org/'] } } } }, edgeTypes: { e: { properties: { since: 'date' } } } } });
    const r = exportOwl(s);
    expect(declared(quadsOf(r.turtle)).get('urn:tgs:since')).toEqual(['DatatypeProperty']);
    expect(r.losses.map((l) => `${l.code} ${l.subject}`)).toEqual(['owl-link-values A.homepage', 'owl-property-conflict :since']);
  });
});

describe('OWL export of the conformance examples', () => {
  // @tg: verifies:: [[openspec:owl-export#OWL 2 DL output#Declared terms]] {level: unit}
  // @lat: [[tests/owl-export#Every term is declared once]]
  it.each(exampleSets())('%s declares every term it uses exactly once', (_name, set) => {
    const qs = quadsOf(exportOwl(set).turtle);
    const d = declared(qs);
    for (const [iri, ts] of d) expect(ts, iri).toHaveLength(1);
    const kind = (iri: string) => d.get(iri)?.[0];
    for (const q of qs) {
      if (q.predicate.termType !== 'NamedNode' || [RDF, RDFS, OWL].some((ns) => q.predicate.value.startsWith(ns))) continue;
      expect(kind(q.predicate.value), `predicate ${q.predicate.value}`).toBe('AnnotationProperty');
    }
    for (const q of qs) {
      if (q.object.termType !== 'NamedNode') continue;
      const p = q.predicate.value;
      if (p === `${OWL}onProperty`) expect(['ObjectProperty', 'DatatypeProperty'], q.object.value).toContain(kind(q.object.value));
      if ([`${OWL}allValuesFrom`, `${OWL}someValuesFrom`, `${RDFS}domain`].includes(p)) expect(kind(q.object.value), q.object.value).toBe('Class');
    }
    // No reserved vocabulary is declared or punned.
    for (const iri of d.keys()) expect([RDF, RDFS, OWL, SH].some((ns) => iri.startsWith(ns)), iri).toBe(false);
  });

  // @tg: verifies:: [[openspec:owl-export#Export schemas as OWL#Same IRIs as SHACL]] {level: unit}
  // @lat: [[tests/owl-export#Same IRIs as the SHACL export]]
  it.each(exampleSets())('%s names the same classes and properties as its SHACL export', (_name, set) => {
    const d = declared(quadsOf(exportOwl(set).turtle));
    const shacl = quadsOf(exportShacl(set));
    for (const c of shacl.filter((q) => q.predicate.value === `${SH}targetClass` || q.predicate.value === `${SH}class`)) expect(d.get(c.object.value), c.object.value).toEqual(['Class']);
    for (const p of shacl.filter((q) => q.predicate.value === `${SH}path` && q.subject.termType === 'BlankNode')) {
      if ([RDF].some((ns) => p.object.value.startsWith(ns))) continue;
      expect(d.has(p.object.value), p.object.value).toBe(true);
    }
  });
});
