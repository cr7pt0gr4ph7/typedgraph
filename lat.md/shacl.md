---
type: Decision
openspec: [shacl-interop, tgs-spec, owl-export]
---
# SHACL

Exchange of schemas with the RDF world: export of schema notes as W3C SHACL and OWL 2, import of SHACL shapes into schema notes, and the open Typed Graph Schema specification that defines them.

The schema format is described in [[graph-model#Schema notes]]; this file covers the mapping to SHACL and the specification that publishes it.

## Typed Graph Schema

TGS 0.7 is the current schema-note YAML format, published as an open specification so other tools can read and write the same ontologies without this project's code.

Sources live in `spec/tgs/`: `SPEC.md`, a JSON Schema `tgs.schema.json` for the frontmatter keys, `namespace.json` (the `tgs:` annotation terms) and `examples/` conformance cases, each a `vault/` with an `expected.json` of declarations and diagnostics. `site/build-spec.mjs` renders them to `site/spec/tgs/v0.7/` and `site/ns/tgs/`, which GitHub Pages serves at `https://typedgraph.org/spec/tgs/v0.7/`, with `spec/tgs/` redirecting to the latest version. TGS 0.1 to 0.6 are archived unchanged in `spec/tgs/archive/` and still rendered to `site/spec/tgs/v0.1/` to `v0.6/`, 0.1 to 0.5 each with a notice that its published addresses under `volland.github.io/obsigraph` moved to typedgraph.org; TGS 0.3 defines a note as a Markdown or AsciiDoc file ([[asciidoc]]) and adds no schema key; TGS 0.4 adds `description`, `elements` and `sections` and a Document validator conformance level ([[elements]]), with example `07-document-elements`; TGS 0.5 fixes how elements are declared, nested, counted and shown, with example `08-element-scope`; TGS 0.6 moves the version addresses, the JSON Schema `$id` and the `tgs:` namespace to typedgraph.org and adds no key; TGS 0.7 adds `inverseEdge`, inverse and symmetric edge types with canonical edges and the `inverse-conflict` and `inverse-mismatch` diagnostics ([[graph-model#Inverse edges]]), with example `09-inverse-edges`; it also adds `is` and `abstract` ([[graph-model#Type inheritance]]), with example `09-type-inheritance`; it adds the OWL mapping, an OWL exporter conformance level and `tgs:edgeType`, with example `09-owl`; a note without a `tgs` version key is read as 0.1. Published versions never change; minor versions only add optional keys, and a reader reports keys it does not know. Tests run every example through the reader and the JSON Schema, see [[tests/tgs-spec]].

## Export

`exportShacl` writes every type and edge type as one deterministic Turtle document, implemented by [[packages/core/src/shacl/export.ts#exportShacl]].

Types become `sh:NodeShape`s targeting a class, properties become property shapes with datatype, `sh:minCount`, `sh:maxCount`, `sh:defaultValue` and `sh:in`, and per-type edges become property shapes with `sh:class` or `sh:or`. Edge types become reification shapes over `rdf:subject`, `rdf:predicate` and `rdf:object` so edge properties can be constrained with plain SHACL 1.0. Descriptions become `sh:description` on node, property and edge shapes. What SHACL cannot say (`tgs:note`, `tgs:template`, `tgs:visualization`, `tgs:edgesClosed`, `tgs:elements` and `tgs:sections` as JSON in declaration order, an edge type's `tgs:inverseEdge` name ([[graph-model#Inverse edges]]), and a few more) is kept as `tgs:` annotations that SHACL engines ignore; `sh:closed` is not used because it would close frontmatter properties too. Shapes are ordered by name and properties by `sh:order`, so unchanged schemas give byte-identical output. Declarations without `uri` are named by the base IRI, `urn:tgs:` by default.

## Supertypes as subclasses

A node shape lists only a type's own declarations. Each supertype becomes `<type class> rdfs:subClassOf <supertype class>`, and an abstract type gets `tgs:abstract true`.

- motivated_by:: [[graph-model#Type inheritance]] {weight: primary, since: "0.32.0"}

SHACL targets the instances of a subclass with the shapes of its superclasses, and `sh:class` matches instances of subclasses. So a SHACL engine checks inherited properties, and accepts subtypes where a supertype is named, the way TGS does. The import reads `rdfs:subClassOf` on a shape's target class back into `is`, and `tgs:abstract` into `abstract`.

<option id="flatten" outcome="rejected">

Export each type with every property it inherits and no subclass statement. SHACL would validate the same data, but `sh:class LegalEntity` would no longer match a `Person`. The import also could not tell inherited properties from the type's own, so a round trip would lose `is`.

</option>

## Import

`importShacl` reads shapes into TGS declarations and a drop report; `planImport` places them into schema notes, both in [[packages/core/src/shacl/import.ts#importShacl]] and [[packages/core/src/shacl/write.ts#planImport]].

A node shape with a target class is a type; a property shape with a datatype or `sh:nodeKind sh:IRI` is a property; one with `sh:class`, `sh:node` or an `sh:or` of classes is an edge; a shape constraining `rdf:predicate` with `sh:hasValue` is an edge type. IRIs that differ from the base IRI plus the name are written as `uri`, as a CURIE when a prefix matches. Terms in the former `tgs:` namespace `https://volland.github.io/obsigraph/ns/tgs#` (TGS 0.1 to 0.5) are read as terms of `https://typedgraph.org/ns/tgs#`, and a former `tgs` prefix is not kept as a vault prefix, so earlier exports import unchanged. Everything outside that subset (`sh:closed`, `sh:pattern`, property paths, unknown datatypes, ...) is listed in the drop report and the rest of the shape is still imported. Notes are written one per type, grouped by `tgs:note`, or all in one; only the `schema`, `schemas`, `edgeTypes` and `prefixes` keys of an existing note are replaced, bodies and other frontmatter stay as written, and a note that also declares types missing from the import is left alone without `--force`. Nothing is ever deleted. Only a newly created note named after its type receives that type's `tgs:templateBody`, so the import warns for every template body it does not write, naming the type and suggesting `--layout per-type`: a note holding several types keeps no per-type body, and an existing note keeps its own body unless it already matches.

## Commands

`tg schema export <out.ttl>` and `tg schema import <file.ttl>` in `packages/cli/src/commands/schema.mts` and the plugin commands "Export schemas as SHACL", "Export schemas as OWL" and "Import SHACL shapes" run the above.

The CLI takes `--vault`, `--schema-folder` and `--base`; export takes `--format shacl|owl` (default `shacl`) and, for OWL, `--ontology-iri`, and prints the OWL loss report (`losses` with `--json`); import adds `--layout auto|per-type|single`, `--into` and `--force`, prints the drop report and exits 1 only when a note was left unchanged. With no schema notes export stops with exit 2 and writes nothing, as [[cli#Code ontology#Schema folder required]] says, unless `--ignore missing-ontology` is given; import creates the folder. The plugin reads the base IRI from the Schema base IRI setting and shows the report in a dialog. The SHACL module is a separate entry point (`@obsigraph/core/src/shacl.ts`) so hosts that never use it do not load the Turtle parser, `n3`.

## OWL export

`exportOwl` writes a schema set as one OWL 2 DL ontology in Turtle with a loss report, implemented by [[packages/core/src/owl/export.ts#exportOwl]] and specified in TGS section 14.

- motivated_by:: [[graph-model#Type inheritance]]
- motivated_by:: [[graph-model#Inverse edges]]

Direct supertypes become `rdfs:subClassOf`, abstract types carry `tgs:abstract`, and inverse and symmetric edge types become `owl:inverseOf` and `owl:SymmetricProperty`.

It is the other half of RDF exchange. SHACL says what a valid note looks like and round-trips. OWL says what the types and relations mean, for reasoners and ontology editors, and is export only. Both use the identifiers of TGS section 7, so the two exports of one vault name the same terms. Types become `owl:Class`es and frontmatter properties become one global datatype or object property each, with a union domain. Edge types become object properties with domain and range, and edge properties become annotation properties tied to their edge with `tgs:edgeType`. The annotations of the SHACL export (`tgs:note`, `tgs:template`, `tgs:visualization`, ...) are declared `owl:AnnotationProperty` and kept. `exportOwl` returns `{turtle, losses}`: every construct OWL cannot express is a loss with a stable code (`owl-closed-edges`, `owl-default`, `owl-edge-description`, `owl-edge-property-constraint`, `owl-foreign-term`, `owl-link-values`, `owl-property-conflict`, `owl-range-conflict`), which the CLI prints and the plugin shows in a dialog. The SHACL and OWL exporters share the Turtle writer in `packages/core/src/rdf/turtle.ts`. The OWL module is its own entry point, `@obsigraph/core/src/owl.ts`. Tests are in [[tests/owl-export]].

### Restrictions, not global axioms

`required`, single values, `values` and the targets of a type's edges become `rdfs:subClassOf` restrictions on the declaring class, not `owl:FunctionalProperty` or a global `rdfs:range`.

A TGS constraint belongs to one type, and a property that is single-valued on `Person` may be a list on `Project`, so a global axiom would claim more than the schema does. A required edge with targets becomes `owl:someValuesFrom`, with any target `owl:minCardinality 1`.

- motivated_by:: [[owl-constraints#Open-world semantics]] {weight: primary}

### Edge properties as annotation properties

Edge properties are declared `owl:AnnotationProperty`, with `rdfs:range` their datatype and `tgs:edgeType` naming each edge type that declares them.

OWL has no properties on a property assertion. The reification shape the SHACL export uses would need `rdf:Statement`, `rdf:subject` and `rdf:object`, which are reserved in OWL 2 DL. Annotation properties are how OWL 2 annotates an assertion through `owl:Axiom`. `required` and `values` on an edge property are reported as losses.

- motivated_by:: [[owl-constraints#OWL 2 DL]] {weight: primary}

<option id="owl-reification" outcome="rejected">

Datatype properties with domain `rdf:Statement`, as in the SHACL edge shapes. This leaves OWL 2 DL.

</option>

<option id="owl-reifiers" outcome="rejected">

RDF 1.2 reifiers. They have no OWL semantics yet.

</option>

### Allow-list as an annotation

A type that declares `edges` keeps `tgs:edgesClosed true` on its class, as in SHACL, and the export reports `owl-closed-edges`.

Writing `owl:maxCardinality 0` for every other edge type would make the whole ontology inconsistent on one stray edge, and edges that no schema declares would still be allowed.

- motivated_by:: [[owl-constraints#Open-world semantics]] {weight: primary}

### One role per term

When an IRI is used in two roles, such as `since` as a frontmatter property and as an edge property, the export keeps one role in the order class, object property, datatype property, annotation property.

It writes no axioms for the dropped role and reports `owl-property-conflict`. Punning an object property and a datatype property is not allowed in OWL 2 DL.

- motivated_by:: [[owl-constraints#OWL 2 DL]] {weight: primary}

### No disjointness

Classes are never declared disjoint, because a note can carry several types and disjoint classes would make such a note inconsistent.

- motivated_by:: [[owl-constraints#Open-world semantics]]

### Foreign terms described, not defined

A type or property whose `uri` is outside the base IRI, such as `schema:Person`, is exported with its axioms but without `rdfs:isDefinedBy`, and reported as `owl-foreign-term`.

The vault means that term, so its axioms belong in the ontology, but the ontology does not define another vocabulary's term, and users should notice that they make statements about one.

- motivated_by:: [[shacl#OWL export#Restrictions, not global axioms]]
