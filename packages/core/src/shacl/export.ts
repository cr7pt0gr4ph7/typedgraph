import { compactElements, compactSections, DEFAULT_BASE_IRI, iriOf, TGS_VERSION, type EdgeRule, type PropertySchema, type SchemaSet } from '../schema/schema.js';
import { cmp, compact, isScalar, literal, stableJson, statement, type Entry } from '../rdf/turtle.js';
import { KIND_DATATYPE, RDF, RDFS, SH, TGS, XSD } from './vocab.js';

export { compact, stableJson };

export interface ShaclExportOptions {
  /** Base IRI for declarations without a `uri` (default `urn:tgs:`). */
  base?: string;
  /** Body of a schema note, exported as the template of its `schema:` type. */
  body?: (path: string) => string | null;
}

/**
 * Export a schema set as one SHACL document in Turtle. Output is
 * deterministic: shapes are ordered by name, property shapes by `sh:order`.
 */
// @tg: implements:: [[shacl#Export]] {since: "2026-10-06"}
// @lat: [[shacl#Export]]
// @tg: implements:: [[openspec:shacl-interop#Edge mapping]]
// @tg: implements:: [[openspec:shacl-interop#Edge type shapes]]
// @tg: implements:: [[openspec:shacl-interop#Export schemas as SHACL]]
// @tg: implements:: [[openspec:shacl-interop#Lossless round trip]]
// @tg: implements:: [[openspec:shacl-interop#Node type mapping]]
// @tg: implements:: [[openspec:shacl-interop#Typed Graph annotations]]
// @tg: implements:: [[openspec:document-elements#SHACL exchange of descriptions and elements]]
// @tg: implements:: [[openspec:shacl-interop#Type inheritance in SHACL]]
export function exportShacl(set: SchemaSet, opts: ShaclExportOptions = {}): string {
  const base = opts.base ?? DEFAULT_BASE_IRI;
  const prefixes = set.prefixes;
  const term = (iri: string) => compact(iri, base, prefixes);
  const typeIri = (name: string) => term(iriOf(set.schemas.get(name) ?? { uri: null }, name, base, prefixes));
  const edgeIri = (name: string) => term(iriOf(set.edgeTypes.get(name) ?? { uri: null }, name, base, prefixes));
  const shapeIri = (name: string, suffix: string) => term(base + encodeURIComponent(name) + suffix);
  const classes = (names: string[]): Entry[] =>
    names.length === 1 ? [[term(`${SH}class`), typeIri(names[0]!)]] : [[term(`${SH}or`), `( ${names.map((n) => `[ ${term(`${SH}class`)} ${typeIri(n)} ]`).join(' ')} )`]];

  const propertyShape = (p: PropertySchema, order: number): Entry[] => {
    const e: Entry[] = [
      [term(`${SH}path`), term(iriOf(p, p.name, base, prefixes))],
      [term(`${SH}name`), literal(p.name)],
    ];
    if (p.kind === 'link') e.push([term(`${SH}nodeKind`), term(`${SH}IRI`)]);
    else e.push([term(`${SH}datatype`), term(KIND_DATATYPE[p.kind])]);
    if (p.kind === 'list') e.push([term(`${TGS}kind`), literal('list')]);
    if (p.required) e.push([term(`${SH}minCount`), '1']);
    if (!p.many) e.push([term(`${SH}maxCount`), '1']);
    if (p.default !== null && p.default !== undefined) {
      if (isScalar(p.default)) e.push([term(`${SH}defaultValue`), literal(p.default)]);
      else e.push([term(`${TGS}default`), literal(stableJson(p.default))]);
    }
    if (p.values) e.push([term(`${SH}in`), `( ${p.values.map((v) => literal(isScalar(v) ? v : stableJson(v))).join(' ')} )`]);
    if (p.description) e.push([term(`${SH}description`), literal(p.description)]);
    e.push([term(`${SH}order`), String(order)]);
    return e;
  };

  const edgeShape = (r: EdgeRule, order: number): Entry[] => {
    const e: Entry[] = [
      [term(`${SH}path`), edgeIri(r.type)],
      [term(`${SH}name`), literal(r.type)],
    ];
    if (r.targets?.length) e.push(...classes(r.targets));
    else e.push([term(`${SH}nodeKind`), term(`${SH}IRI`)], [term(`${TGS}edge`), 'true']);
    if (r.required) e.push([term(`${SH}minCount`), '1']);
    if (!r.many) e.push([term(`${SH}maxCount`), '1']);
    if (r.description) e.push([term(`${SH}description`), literal(r.description)]);
    e.push([term(`${SH}order`), String(order)]);
    return e;
  };

  const blocks: string[] = [];
  // A type's own declarations: what it inherits is in its supertypes' shapes, which SHACL applies through `rdfs:subClassOf`.
  for (const t of [...set.declared.values()].sort((a, b) => cmp(a.type, b.type))) {
    const e: Entry[] = [
      ['a', term(`${SH}NodeShape`)],
      [term(`${SH}targetClass`), typeIri(t.type)],
      [term(`${SH}name`), literal(t.type)],
      [term(`${TGS}note`), literal(t.path)],
    ];
    if (t.description) e.push([term(`${SH}description`), literal(t.description)]);
    if (t.abstract) e.push([term(`${TGS}abstract`), 'true']);
    if (t.edges) e.push([term(`${TGS}edgesClosed`), 'true']);
    if (t.template) e.push([term(`${TGS}template`), literal(t.template)]);
    const body = t.bodyIsTemplate ? opts.body?.(t.path)?.trim() : '';
    if (body) e.push([term(`${TGS}templateBody`), literal(body)]);
    if (t.style) e.push([term(`${TGS}visualization`), literal(stableJson(t.style))]);
    // Declaration order matters for elements and sections, and is itself deterministic, so keys are not sorted.
    if (t.sections?.length) e.push([term(`${TGS}sections`), literal(JSON.stringify(compactSections(t.sections)))]);
    if (t.elements?.length) e.push([term(`${TGS}elements`), literal(JSON.stringify(compactElements(t.elements)))]);
    let order = 0;
    for (const p of t.properties) e.push([term(`${SH}property`), propertyShape(p, order++)]);
    for (const r of t.edges ?? []) e.push([term(`${SH}property`), edgeShape(r, order++)]);
    blocks.push(statement(shapeIri(t.type, 'Shape'), e));
    if (t.is?.length) blocks.push(statement(typeIri(t.type), t.is.map((b): Entry => [term(`${RDFS}subClassOf`), typeIri(b)])));
  }
  // @tg: implements:: [[openspec:shacl-interop#Inverse edges in SHACL]]
  for (const et of [...set.edgeTypes.values()].sort((a, b) => cmp(a.type, b.type))) {
    const e: Entry[] = [
      ['a', term(`${SH}NodeShape`)],
      [term(`${SH}name`), literal(et.type)],
      [term(`${TGS}note`), literal(et.path)],
    ];
    if (et.description) e.push([term(`${SH}description`), literal(et.description)]);
    if (et.inverseEdge) e.push([term(`${TGS}inverseEdge`), literal(et.inverseEdge)]);
    if (et.style) e.push([term(`${TGS}visualization`), literal(stableJson(et.style))]);
    e.push([term(`${SH}property`), [[term(`${SH}path`), term(`${RDF}predicate`)], [term(`${SH}hasValue`), edgeIri(et.type)]]]);
    if (et.from?.length) e.push([term(`${SH}property`), [[term(`${SH}path`), term(`${RDF}subject`)], ...classes(et.from)]]);
    if (et.to?.length) e.push([term(`${SH}property`), [[term(`${SH}path`), term(`${RDF}object`)], ...classes(et.to)]]);
    let order = 0;
    for (const p of et.properties) e.push([term(`${SH}property`), propertyShape(p, order++)]);
    blocks.push(statement(shapeIri(et.type, 'EdgeShape'), e));
  }

  const head = [`# Typed Graph Schema (TGS ${TGS_VERSION}) exported as SHACL`, `@prefix : <${base}> .`];
  for (const p of Object.keys(prefixes).sort()) head.push(`@prefix ${p}: <${prefixes[p]}> .`);
  return `${head.join('\n')}\n${blocks.map((b) => `\n${b}\n`).join('')}`;
}
