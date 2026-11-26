## Context

`Graph` builds nodes and edges from markdown and knows nothing about schemas. Schema notes are notes in the same graph, read afterwards into a `SchemaSet` that validation, the ontology check, the SHACL exchange and (since TGS 0.4) `tg cypher` use. Issue Volland/typedgraph#20 asks for edge names that are the reverse of each other, and for symmetric edges, so that each note can write a relation from its own side.

## Goals / Non-Goals

**Goals:**
- Declare a relation once, with a name for each direction, in the edge type declaration.
- Treat an edge written from either end as the same edge everywhere the schema is known: validation, the ontology check and queries.
- Report when the two written ends of one edge disagree.

**Non-Goals:**
- Rewriting notes to add or remove the other side (a later `tg` command could do it).
- Inverse names on a type's `edges` rules without an edge type declaration.
- The LadybugDB backend and mirror. They keep storing the edges as written.

## Decisions

**1. A canonical view, not a normalised graph.** The `Graph` keeps every edge as written, and `canonicalView(graph, schemas)` derives a read-only `GraphView`. In that view, edges with an inverse name are turned around, and the two ends of one edge are merged into one. The view is cached per graph version and schema set. Rejected: normalising inside `Graph`. The graph's schema comes from its own schema notes, so every edit to a schema note would have to rebuild every edge, and the per-file incremental update would no longer be per file. The view also keeps "what was written" available (`written`, `merged`) for diagnostics and displays.

**2. One key, `inverseEdge`, also for symmetry.** `inverseEdge: friendsWith` on `friendsWith` declares a symmetric edge type, as the issue proposes. Rejected: a separate `symmetric: true`. It adds a second way to say the same thing, and a combination (`symmetric: true` with another `inverseEdge`) that would need its own rule.

**3. The inverse name is an alias, never a declaration.** Only one direction is declared, so `from`, `to` and `properties` exist once and the two directions cannot disagree in the schema. Declaring the inverse name as an edge type too, or reusing one inverse name for two edge types, is an `inverse-conflict`, and the first declaration wins. A type's `edges` rules may use either name, because a type's rule is written from that type's side.

**4. The two ends merge, and differences are reported.** An edge written from both ends is one edge with the properties of the declared direction, filled up from the other end. The written ends pair in written order, so `A worksAt B` twice and `B hasEmployee A` once gives two edges, one of them merged. A property present or different on one end only is an `inverse-mismatch`, and so is an edge one end asserts and the other denies (`-hasEmployee`). Edge `id` properties are not compared. Rejected: reporting every redundant pair. Writing both sides is the point of the feature.

**5. Counts and requirements read from the node's side.** `edgesFrom(view, node)` lists the edges of a node with the name they have there. A type's `required` and `many` rules count those, so `Acme hasEmployee Ada` satisfies Person's required `worksAt`. Whether a note may *write* a name is still checked on the edges as written.

**6. Cypher rewrites the pattern, not the data.** With `ExecOptions.schemas`, the executor runs on the canonical view. A relationship pattern with an inverse name matches the declared type in the opposite direction, and a symmetric type matches in both directions. `type(r)` and `startNode(r)` report the declared type and direction. Without schemas the engine behaves exactly as before.

**7. SHACL carries the alias as an annotation.** The edge shape gets `tgs:inverseEdge "<name>"`. Rejected: `owl:inverseOf` between predicates. The export describes reified statements rather than OWL properties, and the alias has no predicate IRI of its own.

## Risks / Trade-offs

- [Two views of the same data: as written and canonical] → displays and diagnostics that point at a file use the written location (`writtenAt`). Only schema-aware readers use the canonical view.
- [View rebuild cost on every graph change] → O(edges), done lazily and cached per `Graph.version`.
- [LadybugDB queries see the written names] → documented as future work.
