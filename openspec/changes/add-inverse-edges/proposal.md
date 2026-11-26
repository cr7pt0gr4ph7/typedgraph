## Why

Many relations are read from both of their ends: a part names its whole (`part_of`) and the whole names its parts (`has_part`); a company has employees and a person works at a company; a friendship holds both ways. Tools such as the Obsidian Breadcrumbs plugin let each note write the relation from its own side and keep the two sides consistent. Typed Graph cannot say that two edge names are one relation. So a vault either writes every relation twice and keeps both copies in sync by hand, or it writes one direction and every note on the other side reads it backwards. Queries, validation and the ontology check then treat the two names as unrelated edges (see issue Volland/typedgraph#20).

## What Changes

- Typed Graph Schema 0.7: an edge type declaration MAY name its reverse direction with `inverseEdge`. `worksAt: {from: Person, to: Company, inverseEdge: hasEmployee}` makes `B hasEmployee A` another way to write `A worksAt B`, with the same properties. An edge type whose `inverseEdge` is its own name is **symmetric**: `A friendsWith B` also states `B friendsWith A`.
- An inverse name is not an edge type of its own. Declaring it as one, or giving two edge types the same inverse name, is reported as `inverse-conflict`, and the `inverseEdge` is ignored.
- A **canonical view** of the graph holds every edge under its declared type and direction. An edge written with the inverse name is turned around. The two written ends of one edge (`A worksAt B` and `B hasEmployee A`, or `A friendsWith B` and `B friendsWith A`) are merged into one edge. The graph built from markdown is unchanged: the view is derived from it and the schema set.
- Validation reads the canonical view. Endpoints, edge properties and edge counts are checked once per logical edge. An edge written from the other end satisfies a required edge. A type's rule for the inverse name constrains the other end. Two ends that disagree on a property, or where one asserts what the other denies, are reported as `inverse-mismatch`.
- `tg ontology` lists the inverse name of each edge type and marks symmetric ones. `tg ontology check` accepts inverse names, checks their ends swapped, and reports `inverse-mismatch`.
- Cypher: a pattern with an inverse name matches the declared edge the other way round, and a symmetric edge type matches in both directions. This applies to `tg cypher`, the plugin and the sidecar's built-in engine.
- SHACL: the export writes `inverseEdge` as the `tgs:inverseEdge` annotation on the edge shape, and the import reads it back.
- Maintaining both ends: `tg inverses [--write]`, an Obsidian command and an on-save option write the missing end of each inverse or symmetric edge into the note at its other end (under a heading, at the end or in frontmatter) and fix property mismatches. The source of truth is the declared end or the last-edited note, and deletions can optionally be mirrored. No marker is written.
- The VS Code backlinks view groups each incoming edge under the name it has from the open note: an incoming `worksAt` is listed as `hasEmployee`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities
- `schema-notes`: inverse edge declarations, edges read from either end, inverse edge validation.
- `graph-model`: the canonical edge view.
- `cypher-query`: inverse and symmetric patterns.
- `shacl-interop`: inverse edges in SHACL.
- `tgs-spec`: TGS 0.7 published.
- `vscode-extension`: backlinks named from the note's side.

## Impact

- `packages/core`: schema reader (`inverseEdge`, `inverse-conflict`), `schema/inverse.ts` (semantics, canonical view, `edgesFrom`, `nameFrom`), `validateSchemas`, the Cypher executor (`ExecOptions.schemas`), SHACL export and import, `Graph.version` and the `GraphView` interface.
- `packages/cli`: `tg ontology` listing and check; `tg cypher` passes the ontology to the engine.
- `packages/plugin`, `packages/sidecar`: the built-in engine gets the schema set.
- `packages/vscode`: backlinks.
- `spec/tgs/`: TGS 0.7, with 0.6 archived; JSON Schema; a conformance example.
- lat.md: `graph-model#Inverse edges`, `edge-syntax`, `query-engine`, `shacl`; test specs in `tests/inverse-edges`.
- Requirements: [[openspec:schema-notes#Inverse edge declarations]], [[openspec:schema-notes#Edges read from either end]], [[openspec:schema-notes#Inverse edge validation]], [[openspec:graph-model#Canonical edge view]], [[openspec:cypher-query#Inverse and symmetric patterns]], [[openspec:shacl-interop#Inverse edges in SHACL]], [[openspec:tgs-spec#TGS 0.7 published]], [[openspec:vscode-extension#Backlinks named from the note's side]].
- Not in scope: the LadybugDB backend and mirror store edges as written. Inverse names in patterns there are future work.
