## Context

`exportShacl` in `packages/core/src/shacl/export.ts` maps a `SchemaSet` to SHACL with a small hand-written Turtle writer, so output nests blank nodes and is byte-stable. The OWL export reuses that writer and the identifiers of TGS section 7, so both exports of one vault name the same terms. TGS section 13 is the SHACL mapping; this change adds section 14 for OWL. See proposal.md for motivation and the specs for the required behavior.

## Goals / Non-Goals

**Goals:**
- One OWL 2 DL ontology per schema set, deterministic, using the same IRIs as the SHACL export.
- Every TGS construct either mapped or named in a loss report.
- A normative mapping in the TGS specification, with conformance examples checked by tests.

**Non-Goals:**
- Importing OWL into schema notes.
- Exporting notes as OWL individuals, or edge properties of data as `owl:Axiom` annotations.
- Running a reasoner or an OWL profile checker in tests. The tests check the OWL 2 DL declaration rules directly on the parsed triples.
- `extends` between types (`rdfs:subClassOf` between classes), which waits on inheritance in TGS itself.

## Constraints

- **OWL 2 DL** (W3C OWL 2 Structural Specification, Mapping to RDF Graphs): every IRI has one declaration, reserved vocabulary is not punned, annotation properties are declared, cardinalities are `xsd:nonNegativeInteger`. This binds every mapping rule below.
- **Open-world semantics** of OWL: an axiom licenses inferences and never reports a missing value. This binds what may be exported as an axiom without changing the meaning of a valid vault.
- **Multiple labels** (TGS section 10): a note may carry several types. This rules out disjointness axioms.

## Decisions

**1. Type-local constraints become class restrictions.** TGS properties and edge entries belong to one type. OWL properties are global. So `required`, single values, `values` and edge targets become `rdfs:subClassOf [ a owl:Restriction … ]` on the declaring class. Alternative: `owl:FunctionalProperty` and global `rdfs:range`. Rejected because a property single-valued on `Person` may be a list on `Project`, and a global axiom would claim more than the schema does. Motivated by the open-world constraint.

**2. Edge properties become annotation properties.** OWL has no properties on property assertions. SHACL constrains a reified `rdf:Statement` (TGS 13.3), but `rdf:Statement`, `rdf:subject` and `rdf:object` are reserved in OWL 2 DL. Edge properties are declared `owl:AnnotationProperty`, linked to their edge types with the new term `tgs:edgeType`, matching how OWL 2 annotates an assertion through `owl:Axiom`. Alternatives: datatype properties with domain `rdf:Statement` (leaves DL), or RDF 1.2 reifiers (no OWL semantics yet). Motivated by the OWL 2 DL constraint.

**3. The allow-list stays an annotation.** `tgs:edgesClosed` is exported as in SHACL and reported. `owl:maxCardinality 0` for every other edge type was rejected: one stray edge would make the whole ontology inconsistent, and edges that no schema declares would still be allowed. Motivated by the open-world constraint.

**4. One role per IRI, with a fixed precedence.** When a name is used in two roles (a frontmatter `since` and an edge property `since`), the exporter keeps one in the order class, object property, datatype property, annotation property. It writes no axioms for the dropped role and reports `owl-property-conflict`. Alternative: punning. Rejected because it is not allowed between object and datatype properties in OWL 2 DL.

**5. No disjointness.** Classes are never declared disjoint, so mixed-type notes stay consistent. Motivated by the multiple-labels constraint.

**6. A loss report instead of silent drops.** `exportOwl` returns `{turtle, losses}`. Each loss has a stable code, a subject and a message, sorted by code and subject. The CLI prints it and the plugin shows it. Alternative: write losses as Turtle comments. Rejected because tools then cannot read them.

**7. Foreign terms are described, not defined.** A declared `uri` outside the base IRI (`schema:Person`) is exported with its axioms, because the vault means that term, but without `rdfs:isDefinedBy`, and it is reported as `owl-foreign-term` so users notice they are making statements about another vocabulary.

**8. A shared Turtle writer.** The writer moves from `shacl/export.ts` to `rdf/turtle.ts`. The OWL export names blank nodes (`_:r0`) only where an axiom annotation must refer to a restriction, so output stays deterministic.

## Risks / Trade-offs

- [Users read `owl:minCardinality` as validation] → The spec, the loss dialog and the docs say that validation stays with `tg check` and SHACL.
- [Global domains from merged properties surprise reasoner users] → A domain is the union of exactly the declaring types, which holds for every valid note.
- [A version bump for an export-only feature] → 0.7 adds no key and changes no rule, so every 0.6 note is a 0.7 note.

## Migration Plan

None. Existing exports, notes and commands are unchanged. Only the SHACL header comment names TGS 0.7.
