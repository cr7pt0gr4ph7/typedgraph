## Context

Schema notes declare types independently. A node with several labels already merges their schemas in label order (TGS section 9). Labels come from a note's frontmatter `type` and are what Cypher, the Ladybug mirror, edge endpoint checks and styles match on. See proposal.md for the motivation.

## Goals / Non-Goals

**Goals:**
- Declare shared properties, edge rules, elements and sections once, on an abstract supertype.
- One query, edge type or edge rule for a whole family of types.
- Report inheritance errors as declaration errors, the way duplicate declarations are reported.

**Non-Goals:**
- Concrete supertypes. Every supertype must be abstract (see decision 3).
- Inheriting from edge types (`edgeTypes` hierarchies).
- Rewriting Cypher queries.

## Decisions

**1. Inferred labels, not query rewriting.** `Graph.setTypeHierarchy` gives each node its written labels followed by the supertypes of each. Matching labels then works the same way everywhere: Cypher, the Ladybug mirror (which copies node labels), endpoint checks and styles. No host needs to know the hierarchy.
- The cost: `labels(n)` includes supertypes. `Graph.writtenLabels` keeps the labels as written, for diagnostics and the abstract-type check.
- Rejected alternative: expanding `(a:LegalEntity)` into `(a:Person|Company)` at match time. That would have to be done separately in the built-in engine, the Ladybug backend and every validator.

**2. Effective schemas in `SchemaSet.schemas`, declarations in `SchemaSet.declared`.** Every consumer that reads a type (validation, note creation, styles, elements) gets what it inherits without changing. SHACL export and `tg ontology` use `declared` to tell a type's own declarations from inherited ones.
- Effective properties: the type's own, then each direct supertype's effective properties in `is` order.
- Edges, elements and sections: merged with the existing multi-label merge.
- Visualization: merged attribute by attribute.
- Template and ids: the first one present.

**3. Only abstract types can be supertypes.** This keeps "query one concrete type" apart from "query a family". A family that needs a concrete member declares one more subtype, such as `GeneralLegalEntity`. It also means a node never carries a concrete type it was not written with.

**4. Kinds decide conflicts.** A property inherited twice with the same kind is not a conflict, even through a diamond, and a type may redeclare it, for example as `required`. A different kind is a `property-conflict`; the first declaration is kept. Unknown, concrete and cyclic supertypes are reported and ignored, so the rest of the schema still works.

**5. SHACL uses `rdfs:subClassOf`.** SHACL engines apply a superclass's shape to instances of its subclasses and match `sh:class` through subclasses. So exporting only a type's own properties, plus `rdfs:subClassOf`, validates the same data as TGS does. `tgs:abstract` keeps the abstract flag.

## Risks / Trade-offs

- [Supertypes appear in `labels(n)` and in Ladybug rows] → Documented in TGS 4.10. `writtenLabels` is available in core.
- [Hosts must reapply the hierarchy when a schema note changes] → The plugin, sidecar and lat graph do it in one place each. Validation also expands labels from the schema set, so diagnostics are right even when a host forgets.
- [Version bump] → 0.6 notes are valid 0.7 notes. The 0.6 JSON Schema rejects `is` and `abstract`, as its strict section says.
