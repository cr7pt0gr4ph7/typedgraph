## 1. Specification

- [x] 1.1 TGS 0.7: section 4.10 Inheritance, the keys in section 4, the diagnostics in section 9, SHACL section 13.4, versioning; 0.6 archived unchanged
- [x] 1.2 JSON Schema `is` and `abstract`; namespace term `tgs:abstract`; site builder publishes 0.7
- [x] 1.3 Conformance example 09-type-inheritance with expected declarations, diagnostics and shapes

## 2. Implementation

- [x] 2.1 Read `is` and `abstract`; resolve effective types, supertypes and inheritance diagnostics in `schemaSetFromNotes`
- [x] 2.2 `Graph.setTypeHierarchy` and `writtenLabels`; validation accepts subtypes at endpoints and reports `abstract-type`
- [x] 2.3 Hosts apply the hierarchy: lat graph, `tg validate`, Obsidian index, sidecar sync; Ladybug mirror follows the labels
- [x] 2.4 SHACL export and import of `rdfs:subClassOf` and `tgs:abstract`
- [x] 2.5 Pickers and Luhmann commands leave abstract types out; inherited templates resolve from their note
- [x] 2.6 `tg ontology` shows supertypes, abstract types and where inherited properties come from; `tg ontology check` reports docs typed with an abstract type

## 3. Docs and tests

- [x] 3.1 Unit tests and lat.md test specs
- [x] 3.2 lat.md docs, bundled ontologies, site, README and changelog
