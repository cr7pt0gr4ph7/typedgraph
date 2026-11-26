## Why

A schema cannot say that one type is a kind of another. Moving a large knowledge graph to Typed Graph shows the cost: `Person` and `Company` are both legal entities, so their shared properties and edge rules are copied onto each type, and no single query, edge type or edge rule can name the family. Requested in Volland/typedgraph#21.

## What Changes

- TGS 0.7 adds two type keys. `is` names the types a type inherits from. `abstract: true` marks a type that exists only for inheritance.
- A derived type inherits `properties`, `edges`, `elements` and `sections`. It also inherits `template`, `visualization` and `id` when it declares none of its own. `uri` and `description` are never inherited.
- A node's labels are its written types plus every supertype of each. So `MATCH (a:LegalEntity)` finds `Person` and `Company` notes, and `owns: {from: LegalEntity}` accepts either one. This works in the Cypher engine, the Ladybug mirror, schema validation and `tg ontology check`.
- New error diagnostics:
  - `unknown-base-type`, `base-not-abstract` and `inheritance-cycle` for an unusable supertype.
  - `property-conflict` when two supertypes, or a type and its supertype, give the same property different kinds.
  - `abstract-type` for a note whose written type is abstract.
- SHACL export writes only a type's own declarations, plus `rdfs:subClassOf` for each supertype and `tgs:abstract true`. Import reads both back.
- The Obsidian, VS Code and Luhmann pickers never offer an abstract type.
- The bundled ontologies move to `tgs: "0.7"`. Where types repeat a property, they share an abstract base.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `schema-notes`: type inheritance, its diagnostics, base type queries and abstract types.
- `tgs-spec`: TGS 0.7 published, with 0.6 archived unchanged.
- `shacl-interop`: supertypes and abstract types in SHACL.
- `typed-note-creation`: abstract types are never offered for a new note.

## Impact

Affected code:
- `packages/core/src/schema/schema.ts`: `resolveInheritance`, `withSupertypes`, `subtypesOf`, `concreteTypes`, validation.
- `packages/core/src/graph/graph.ts`: `setTypeHierarchy` and `writtenLabels`.
- `packages/core/src/latmd/graph.ts`.
- The SHACL exporter and importer.
- The hosts: the Obsidian plugin index, the sidecar sync, the VS Code new-note commands and `tg ontology`.

Also affected: `spec/tgs/` (0.7, the JSON Schema, the namespace term `tgs:abstract`, conformance example 09) and the bundled ontologies.

`SchemaSet` gains two fields:
- `declared`: each type as written.
- `supertypes`: each type's supertypes.

`SchemaSet.schemas` now holds the effective types.
