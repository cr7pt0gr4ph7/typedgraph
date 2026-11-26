## 1. Schema and canonical view

- [x] 1.1 Read `inverseEdge` on edge types; report `inverse-conflict` for declared or shared inverse names
- [x] 1.2 `edgeSemantics`, `canonicalView` with merging and `inverse-mismatch`, `edgesFrom`, `nameFrom`; `Graph.version` and `GraphView`
- [x] 1.3 `validateSchemas` on the canonical view; annotate with `@tg: implements:: [[openspec:schema-notes#Inverse edge validation]]`
- [x] 1.4 `tg ontology` lists inverses; `tg ontology check` accepts inverse names and reports `inverse-mismatch`
- [x] 1.5 Tests annotated with `@tg: verifies::` to `tests/inverse-edges`

## 2. Cypher

- [x] 2.1 `ExecOptions.schemas`: run on the canonical view; inverse names and symmetric types in relationship patterns
- [x] 2.2 Pass the ontology to the engine from `tg cypher`, the plugin and the sidecar

## 3. SHACL

- [x] 3.1 Export and import `tgs:inverseEdge`; round trip test

## 4. Displays

- [x] 4.1 VS Code backlinks name incoming edges from the note's side
- [x] 4.2 Type details show inverse names among outgoing and incoming edges

## 5. Spec and docs

- [x] 5.1 TGS 0.7 in `spec/tgs/` with 0.6 archived, JSON Schema, a conformance example
- [x] 5.2 lat.md sections and test specs; run `tg check`, `tg ontology check` and `tg trace --gaps`
