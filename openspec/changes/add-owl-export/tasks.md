## 1. Specification

- [x] 1.1 TGS 0.7: section 14 OWL mapping, OWL exporter conformance level, renumbered sections 15 to 17; 0.6 archived unchanged; JSON Schema `$id`; `tgs:edgeType` in `namespace.json`
- [x] 1.2 Conformance example `09-owl` and `ontology.ttl` for examples 05 and 09; site builder publishes 0.7

## 2. Implementation

- [x] 2.1 Move the Turtle writer to `packages/core/src/rdf/turtle.ts`, shared by both exporters
- [x] 2.2 `exportOwl` in `packages/core/src/owl/export.ts` with the loss report, entry point `packages/core/src/owl.ts`; annotate it `@tg: implements::` every owl-export requirement
- [x] 2.3 `tg schema export --format owl` with `--ontology-iri` and the loss report; annotate it with the Export and Loss report requirements
- [x] 2.4 Plugin command "Export schemas as OWL" with a loss report dialog
- [x] 2.5 `TGS_VERSION` 0.7, annotated with `[[openspec:tgs-spec#TGS 0.7 published]]`

## 3. Tests

- [x] 3.1 Core tests for every owl-export scenario, each annotated `@tg: verifies::` its scenario
- [x] 3.2 CLI test for the OWL export and its loss report
- [x] 3.3 Conformance test compares `ontology.ttl` byte for byte; spec test for 0.7 and the 0.6 archive

## 4. Docs

- [x] 4.1 lat.md: `shacl#OWL export` with the design's decisions as typed sections and the OWL 2 DL and open-world constraints, `tests/owl-export`, `cli`; list `owl-export` in `shacl.md`'s `openspec:` frontmatter
- [x] 4.2 CLI README, site docs and CHANGELOG
- [x] 4.3 Run `tg check`, `tg ontology check` and `tg trace owl-export --gaps` and close every gap
