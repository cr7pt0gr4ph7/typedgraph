import { compactElements, compactSections, DEFAULT_BASE_IRI, iriOf, TGS_VERSION, type EdgeRule, type EdgeTypeSchema, type PropertySchema, type SchemaSet, type TypeSchema } from '../schema/schema.js';
import { cmp, compact, isScalar, literal, stableJson, statement, type Entry, type Obj } from '../rdf/turtle.js';
import { KIND_DATATYPE } from '../shacl/vocab.js';
import { OWL, RDFS, TGS, XSD } from './vocab.js';

export interface OwlExportOptions {
  /** Base IRI for declarations without a `uri` (default `urn:tgs:`). */
  base?: string;
  /** IRI of the `owl:Ontology` (default: the base IRI). */
  ontologyIri?: string;
  /** `rdfs:label` of the ontology, such as the schema folder. */
  label?: string;
  /** Body of a schema note, exported as the template of its `schema:` type. */
  body?: (path: string) => string | null;
}

/** What the OWL export could not express, and why. */
export type OwlLossCode =
  | 'owl-closed-edges'
  | 'owl-edge-property-constraint'
  | 'owl-default'
  | 'owl-range-conflict'
  | 'owl-property-conflict'
  | 'owl-link-values'
  | 'owl-edge-description'
  | 'owl-foreign-term';

export interface OwlLoss {
  code: OwlLossCode;
  /** The type, property or edge type the loss is about, by name or CURIE. */
  subject: string;
  message: string;
}

export interface OwlExport {
  turtle: string;
  /** Sorted by code, then subject. */
  losses: OwlLoss[];
}

/** How an IRI is declared; a term has exactly one role in OWL 2 DL. */
type Role = 'class' | 'object' | 'datatype' | 'annotation';
const ROLE_RANK: Record<Role, number> = { class: 0, object: 1, datatype: 2, annotation: 3 };
const ROLE_NAME: Record<Role, string> = { class: 'a class', object: 'an object property', datatype: 'a datatype property', annotation: 'an edge property' };

interface PropertyUse {
  labels: Set<string>;
  comments: Set<string>;
  /** Types (frontmatter properties) or edge types (edge properties) that declare it. */
  owners: Set<string>;
  datatypes: Set<string>;
  kinds: Set<string>;
}

const use = (): PropertyUse => ({ labels: new Set(), comments: new Set(), owners: new Set(), datatypes: new Set(), kinds: new Set() });

/**
 * Export a schema set as one OWL 2 DL ontology in Turtle, with a report of
 * what OWL cannot express. Output is deterministic: declarations are ordered
 * by IRI, restrictions by declaration order.
 */
// @tg: implements:: [[shacl#OWL export]] {since: "2026-11-26"}
// @lat: [[shacl#OWL export]]
// @tg: implements:: [[openspec:owl-export#Export schemas as OWL]]
// @tg: implements:: [[openspec:owl-export#Class mapping]]
// @tg: implements:: [[openspec:owl-export#Property mapping]]
// @tg: implements:: [[openspec:owl-export#Edge type mapping]]
// @tg: implements:: [[openspec:owl-export#Edges of a type as restrictions]]
// @tg: implements:: [[openspec:owl-export#Edge properties as annotation properties]]
// @tg: implements:: [[openspec:owl-export#OWL 2 DL output]]
// @tg: implements:: [[openspec:owl-export#Loss report]]
// @tg: implements:: [[openspec:tgs-spec#Conformance levels]] {confidence: partial, note: "the OWL exporter level"}
export function exportOwl(set: SchemaSet, opts: OwlExportOptions = {}): OwlExport {
  const base = opts.base ?? DEFAULT_BASE_IRI;
  const ontology = opts.ontologyIri ?? base;
  const prefixes: Record<string, string> = { owl: OWL, ...set.prefixes };
  const term = (iri: string) => compact(iri, base, prefixes);
  const typeIri = (name: string) => iriOf(set.schemas.get(name) ?? { uri: null }, name, base, set.prefixes);
  const edgeIri = (name: string) => iriOf(set.edgeTypes.get(name) ?? { uri: null }, name, base, set.prefixes);
  const propIri = (p: PropertySchema) => iriOf(p, p.name, base, set.prefixes);
  const owl = (local: string) => term(`${OWL}${local}`);
  const rdfs = (local: string) => term(`${RDFS}${local}`);
  const tgsUsed = new Set<string>();
  const tgs = (local: string) => {
    tgsUsed.add(local);
    return term(`${TGS}${local}`);
  };
  const count = (n: number) => `"${n}"^^${term(`${XSD}nonNegativeInteger`)}`;

  const losses = new Map<string, OwlLoss>();
  const lose = (code: OwlLossCode, subject: string, message: string) => {
    if (!losses.has(`${code}\0${subject}`)) losses.set(`${code}\0${subject}`, { code, subject, message });
  };

  // Pass 1: give every IRI one role. A clash keeps the stronger role and drops the rest.
  const roles = new Map<string, Role>();
  const claim = (iri: string, role: Role, by: string) => {
    const had = roles.get(iri);
    if (!had) roles.set(iri, role);
    else if (had !== role) {
      const [win, lose_] = ROLE_RANK[had] <= ROLE_RANK[role] ? [had, role] : [role, had];
      roles.set(iri, win);
      lose('owl-property-conflict', term(iri), `${term(iri)} is used both as ${ROLE_NAME[had]} and as ${ROLE_NAME[role]} (by ${by}); it is declared as ${ROLE_NAME[win]} and its use as ${ROLE_NAME[lose_]} is left out`);
    }
  };
  const classLabels = new Map<string, string>();
  const claimClass = (name: string) => {
    const iri = typeIri(name);
    claim(iri, 'class', name);
    if (!classLabels.has(iri)) classLabels.set(iri, name);
  };
  const types = [...set.declared.values()].sort((a, b) => cmp(a.type, b.type));
  const edgeTypes = [...set.edgeTypes.values()].sort((a, b) => cmp(a.type, b.type));
  for (const t of types) claimClass(t.type);
  for (const t of types) for (const r of t.edges ?? []) for (const n of r.targets ?? []) claimClass(n);
  for (const e of edgeTypes) for (const n of [...(e.from ?? []), ...(e.to ?? [])]) claimClass(n);

  const objects = new Map<string, { labels: Set<string>; comments: Set<string>; edgeType: EdgeTypeSchema | null; linkOwners: Set<string> }>();
  const object = (iri: string) => {
    let o = objects.get(iri);
    if (!o) objects.set(iri, (o = { labels: new Set(), comments: new Set(), edgeType: null, linkOwners: new Set() }));
    return o;
  };
  for (const e of edgeTypes) {
    const iri = edgeIri(e.type);
    claim(iri, 'object', e.type);
    const o = object(iri);
    o.labels.add(e.type);
    if (e.description) o.comments.add(e.description);
    o.edgeType = e;
    if (e.inverseEdge && e.inverseEdge !== e.type) {
      const inverse = edgeIri(e.inverseEdge);
      claim(inverse, 'object', e.type);
      object(inverse).labels.add(e.inverseEdge);
    }
  }
  for (const t of types)
    for (const r of t.edges ?? []) {
      claim(edgeIri(r.type), 'object', t.type);
      object(edgeIri(r.type)).labels.add(r.type);
    }

  const datatypes = new Map<string, PropertyUse>();
  for (const t of types)
    for (const p of t.properties) {
      const iri = propIri(p);
      if (p.kind === 'link') {
        claim(iri, 'object', t.type);
        const o = object(iri);
        o.labels.add(p.name);
        if (p.description) o.comments.add(p.description);
        o.linkOwners.add(t.type);
        continue;
      }
      claim(iri, 'datatype', t.type);
      let u = datatypes.get(iri);
      if (!u) datatypes.set(iri, (u = use()));
      u.labels.add(p.name);
      if (p.description) u.comments.add(p.description);
      u.owners.add(t.type);
      u.datatypes.add(KIND_DATATYPE[p.kind]);
      u.kinds.add(p.kind);
    }

  const annotations = new Map<string, PropertyUse>();
  for (const e of edgeTypes)
    for (const p of e.properties) {
      const iri = propIri(p);
      claim(iri, 'annotation', e.type);
      let u = annotations.get(iri);
      if (!u) annotations.set(iri, (u = use()));
      u.labels.add(p.name);
      if (p.description) u.comments.add(p.description);
      u.owners.add(edgeIri(e.type));
      if (p.kind !== 'link') u.datatypes.add(KIND_DATATYPE[p.kind]);
      u.kinds.add(p.kind);
      if (p.required) lose('owl-edge-property-constraint', `${e.type}.${p.name}`, `edge property ${p.name} of ${e.type} is required, which OWL annotations cannot enforce`);
      if (p.values) lose('owl-edge-property-constraint', `${e.type}.${p.name}`, `edge property ${p.name} of ${e.type} has allowed values, which OWL annotations cannot enforce`);
      if (p.default !== null && p.default !== undefined) lose('owl-default', `${e.type}.${p.name}`, `the default of edge property ${p.name} of ${e.type} has no OWL counterpart`);
    }

  for (const iri of roles.keys()) if (!iri.startsWith(base) && !iri.startsWith(TGS)) lose('owl-foreign-term', term(iri), `${term(iri)} is outside the base IRI ${base}; the ontology makes statements about another vocabulary's term`);

  const classExpr = (names: string[]): Obj =>
    names.length === 1 ? term(typeIri(names[0]!)) : [['a', owl('Class')], [owl('unionOf'), `( ${names.map((n) => term(typeIri(n))).join(' ')} )`]];
  const unionOf = (iris: string[]): Obj => (iris.length === 1 ? term(iris[0]!) : [['a', owl('Class')], [owl('unionOf'), `( ${iris.map(term).join(' ')} )`]]);
  const restriction = (property: string, pred: string, value: Obj): Entry[] => [
    ['a', owl('Restriction')],
    [owl('onProperty'), term(property)],
    [owl(pred), value],
  ];
  // A foreign term (schema:Person) is described here but not defined by this ontology.
  const labelled = (iri: string, labels: Set<string>, comments: Set<string>): Entry[] => [
    ...[...labels].sort().map((l): Entry => [rdfs('label'), literal(l)]),
    ...[...comments].sort().map((c): Entry => [rdfs('comment'), literal(c)]),
    ...(iri.startsWith(base) ? [[rdfs('isDefinedBy'), term(ontology)] as Entry] : []),
  ];

  // Pass 2: write the ontology.
  const blocks: string[] = [];
  const after: string[] = [];
  let blank = 0;

  const ontologyEntries: Entry[] = [['a', owl('Ontology')]];
  if (opts.label) ontologyEntries.push([rdfs('label'), literal(opts.label)]);
  ontologyEntries.push([owl('versionInfo'), literal(`TGS ${TGS_VERSION}`)]);
  blocks.push(statement(term(ontology), ontologyEntries));

  const classBlocks = new Map<string, string>();
  for (const t of types) classBlocks.set(typeIri(t.type), statement(term(typeIri(t.type)), classEntries(t)));
  for (const [iri, name] of classLabels) {
    if (classBlocks.has(iri) || roles.get(iri) !== 'class') continue;
    classBlocks.set(iri, statement(term(iri), [['a', owl('Class')], ...labelled(iri, new Set([name]), new Set())]));
  }

  function classEntries(t: TypeSchema): Entry[] {
    const iri = typeIri(t.type);
    const e: Entry[] = [['a', owl('Class')], ...labelled(iri, new Set([t.type]), new Set(t.description ? [t.description] : []))];
    e.push([tgs('note'), literal(t.path)]);
    if (t.abstract) e.push([tgs('abstract'), 'true']);
    for (const parent of t.is ?? []) if (set.supertypes.get(t.type)?.includes(parent)) e.push([rdfs('subClassOf'), term(typeIri(parent))]);
    if (t.template) e.push([tgs('template'), literal(t.template)]);
    const body = t.bodyIsTemplate ? opts.body?.(t.path)?.trim() : '';
    if (body) e.push([tgs('templateBody'), literal(body)]);
    if (t.style) e.push([tgs('visualization'), literal(stableJson(t.style))]);
    if (t.sections?.length) e.push([tgs('sections'), literal(JSON.stringify(compactSections(t.sections)))]);
    if (t.elements?.length) e.push([tgs('elements'), literal(JSON.stringify(compactElements(t.elements)))]);
    if (t.edges) {
      e.push([tgs('edgesClosed'), 'true']);
      lose('owl-closed-edges', t.type, `${t.type} allows only the edges it declares; OWL keeps this only as the annotation tgs:edgesClosed`);
    }
    for (const p of t.properties) e.push(...propertyRestrictions(t, p));
    for (const r of t.edges ?? []) e.push(...edgeRestrictions(iri, t, r));
    return e;
  }

  function propertyRestrictions(t: TypeSchema, p: PropertySchema): Entry[] {
    const iri = propIri(p);
    if (roles.get(iri) !== (p.kind === 'link' ? 'object' : 'datatype')) return [];
    const out: Entry[] = [];
    if (p.required) out.push([rdfs('subClassOf'), restriction(iri, 'minCardinality', count(1))]);
    if (!p.many) out.push([rdfs('subClassOf'), restriction(iri, 'maxCardinality', count(1))]);
    if (p.values) {
      if (p.kind === 'link') lose('owl-link-values', `${t.type}.${p.name}`, `the allowed values of link property ${p.name} of ${t.type} are not exported`);
      else out.push([rdfs('subClassOf'), restriction(iri, 'allValuesFrom', [['a', rdfs('Datatype')], [owl('oneOf'), `( ${p.values.map((v) => literal(isScalar(v) ? v : stableJson(v))).join(' ')} )`]])]);
    }
    if (p.default !== null && p.default !== undefined) lose('owl-default', `${t.type}.${p.name}`, `the default of ${p.name} on ${t.type} has no OWL counterpart`);
    return out;
  }

  function edgeRestrictions(source: string, t: TypeSchema, r: EdgeRule): Entry[] {
    const iri = edgeIri(r.type);
    if (roles.get(iri) !== 'object') return [];
    const rs: Entry[][] = [];
    if (r.targets?.length) rs.push(restriction(iri, 'allValuesFrom', classExpr(r.targets)));
    if (r.required) rs.push(r.targets?.length ? restriction(iri, 'someValuesFrom', classExpr(r.targets)) : restriction(iri, 'minCardinality', count(1)));
    if (!r.many) rs.push(restriction(iri, 'maxCardinality', count(1)));
    const out: Entry[] = rs.map((x) => [rdfs('subClassOf'), x]);
    if (r.description) {
      if (!rs.length) lose('owl-edge-description', `${t.type}.${r.type}`, `the description of edge ${r.type} on ${t.type} has no restriction to annotate`);
      else {
        // The first restriction gets a label so the axiom that states it can be annotated.
        const node = `_:r${blank++}`;
        out[0] = [rdfs('subClassOf'), node];
        after.push(statement(node, rs[0]!));
        after.push(
          statement('[]', [
            ['a', owl('Axiom')],
            [owl('annotatedSource'), term(source)],
            [owl('annotatedProperty'), rdfs('subClassOf')],
            [owl('annotatedTarget'), node],
            [rdfs('comment'), literal(r.description)],
          ]),
        );
      }
    }
    return out;
  }

  for (const iri of [...classBlocks.keys()].sort(cmp)) blocks.push(classBlocks.get(iri)!);
  blocks.push(...after);

  for (const iri of [...objects.keys()].sort(cmp)) {
    if (roles.get(iri) !== 'object') continue;
    const o = objects.get(iri)!;
    const e: Entry[] = [['a', owl('ObjectProperty')], ...labelled(iri, o.labels, o.comments)];
    const et = o.edgeType;
    if (et?.inverseEdge && et.inverseEdge === et.type) e.push(['a', owl('SymmetricProperty')]);
    else if (et?.inverseEdge && roles.get(edgeIri(et.inverseEdge)) === 'object') e.push([owl('inverseOf'), term(edgeIri(et.inverseEdge))]);
    if (et?.from?.length) e.push([rdfs('domain'), classExpr(et.from)]);
    else if (!et && o.linkOwners.size) e.push([rdfs('domain'), unionOf([...o.linkOwners].sort().map(typeIri))]);
    if (et?.to?.length) e.push([rdfs('range'), classExpr(et.to)]);
    if (et) e.push([tgs('note'), literal(et.path)]);
    if (et?.style) e.push([tgs('visualization'), literal(stableJson(et.style))]);
    blocks.push(statement(term(iri), e));
  }

  for (const iri of [...datatypes.keys()].sort(cmp)) {
    if (roles.get(iri) !== 'datatype') continue;
    const u = datatypes.get(iri)!;
    const e: Entry[] = [['a', owl('DatatypeProperty')], ...labelled(iri, u.labels, u.comments)];
    e.push([rdfs('domain'), unionOf([...u.owners].sort().map(typeIri))]);
    if (u.datatypes.size === 1) e.push([rdfs('range'), term([...u.datatypes][0]!)]);
    else lose('owl-range-conflict', term(iri), `${term(iri)} has different kinds on different types (${[...u.kinds].sort().join(', ')}); no rdfs:range is written`);
    if (u.kinds.size === 1 && u.kinds.has('list')) e.push([tgs('kind'), literal('list')]);
    blocks.push(statement(term(iri), e));
  }

  for (const iri of [...annotations.keys()].sort(cmp)) {
    if (roles.get(iri) !== 'annotation') continue;
    const u = annotations.get(iri)!;
    const e: Entry[] = [['a', owl('AnnotationProperty')], ...labelled(iri, u.labels, u.comments)];
    if (u.datatypes.size === 1) e.push([rdfs('range'), term([...u.datatypes][0]!)]);
    if (u.kinds.size === 1 && u.kinds.has('list')) e.push([tgs('kind'), literal('list')]);
    for (const edge of [...u.owners].sort(cmp)) e.push([tgs('edgeType'), term(edge)]);
    blocks.push(statement(term(iri), e));
  }

  // tgs: terms carry what OWL cannot say; declaring them keeps the ontology in OWL 2 DL.
  const declared = [...tgsUsed].sort().map((t) => statement(term(`${TGS}${t}`), [['a', owl('AnnotationProperty')]]));
  blocks.splice(1, 0, ...declared);

  const head = [`# Typed Graph Schema (TGS ${TGS_VERSION}) exported as OWL 2`, `@prefix : <${base}> .`];
  for (const p of Object.keys(prefixes).sort()) head.push(`@prefix ${p}: <${prefixes[p]}> .`);
  return {
    turtle: `${head.join('\n')}\n${blocks.map((b) => `\n${b}\n`).join('')}`,
    losses: [...losses.values()].sort((a, b) => cmp(a.code, b.code) || cmp(a.subject, b.subject)),
  };
}
