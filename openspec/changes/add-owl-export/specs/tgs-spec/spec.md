## ADDED Requirements

### Requirement: TGS 0.7 published
The specification SHALL be published as TGS 0.7 with 0.6 archived unchanged. 0.7 adds no key and changes no rule. It SHALL add the normative OWL mapping (section 14), an OWL exporter conformance level, the annotation term `tgs:edgeType` in `namespace.json`, and an expected `ontology.ttl` for the conformance examples an OWL exporter must reproduce.

#### Scenario: Published 0.7 with the OWL mapping
- **WHEN** the spec folder is read
- **THEN** `SPEC.md` is version 0.7 at `https://typedgraph.org/spec/tgs/v0.7/` with section "14. OWL mapping" and an "OWL exporter" conformance level, its JSON Schema `$id` names v0.7, the site builder publishes 0.7, and `archive/v0.6/SPEC.md` has no OWL mapping

## MODIFIED Requirements

### Requirement: Conformance levels
The specification SHALL define the conformance levels reader (parses every key), validator (reader plus the advisory diagnostics), SHACL exchanger (validator plus the export and import mapping), document validator (validator plus document elements and sections) and OWL exporter (reader plus the OWL mapping), and SHALL include example notes with the expected parse result and diagnostics for each level, with the expected SHACL shapes and OWL ontology where a level writes RDF.

#### Scenario: Conformance examples shipped
- **WHEN** an implementer downloads the specification bundle
- **THEN** it contains example notes paired with the expected parse result and diagnostics, and examples with a `shapes.ttl` and an `ontology.ttl` that an exporter's output must be isomorphic to
