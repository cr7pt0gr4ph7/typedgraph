## ADDED Requirements

### Requirement: Inverse edge declarations
An edge type declaration MAY name its reverse direction with `inverseEdge`, an edge type name. An edge written with that name from B to A SHALL be the declared edge from A to B, with the same properties. An `inverseEdge` equal to the declaring edge type's own name SHALL make the edge type symmetric: an edge from A to B also holds from B to A. An inverse name that is declared as an edge type itself, or that two edge types share, SHALL be reported as `inverse-conflict`, and that `inverseEdge` SHALL be ignored. An `inverseEdge` that is not a name SHALL be reported.

#### Scenario: Inverse name declared
- **WHEN** a schema note declares `worksAt: {from: Person, to: Company, inverseEdge: hasEmployee}`
- **THEN** `hasEmployee` is the inverse name of `worksAt`, and `hasEmployee` is not an edge type of its own

#### Scenario: Symmetric edge type declared
- **WHEN** a schema note declares `friendsWith: {inverseEdge: friendsWith}`
- **THEN** `friendsWith` is symmetric

#### Scenario: Inverse name declared twice
- **WHEN** `has_part` declares `inverseEdge: part_of` and `part_of` is declared as an edge type too
- **THEN** an `inverse-conflict` diagnostic names both, and `has_part` has no inverse

### Requirement: Edges read from either end
An edge SHALL have a name at each end. At its declared source the name is its type. At its declared target the name is the inverse name, or the type for a symmetric edge type. An edge whose type has no inverse SHALL have a name only at its source.

#### Scenario: Name from each end
- **WHEN** Ada worksAt Acme is read from Acme
- **THEN** its name there is `hasEmployee`

### Requirement: Inverse edge validation
Validation SHALL check endpoints, edge properties and edge counts on the canonical edges (see [[openspec:graph-model#Canonical edge view]]), and a type's `required` and `many` edge rules SHALL count the edges of a node by the names they have at that node. A type's rule for an inverse name SHALL constrain the other end of the edge. Which names a note may write SHALL be checked on the edges as written. When the two written ends of one edge differ in a property, or one end asserts the edge while the other denies it, validation SHALL report `inverse-mismatch` at the second end.

#### Scenario: Other end satisfies a required edge
- **WHEN** Person requires `worksAt` and only Acme's note writes `hasEmployee:: [[Ada]]`
- **THEN** Ada has no `missing-edge` diagnostic

#### Scenario: Ends disagree
- **WHEN** Ada writes `worksAt:: [[Acme]] {role: engineer}` and Acme writes `hasEmployee:: [[Ada]] {role: manager}`
- **THEN** one `inverse-mismatch` diagnostic is reported at Acme's line, naming `role`

#### Scenario: Endpoints checked in the declared direction
- **WHEN** a Company writes `hasEmployee:: [[Globex]]` and Globex is a Company
- **THEN** `wrong-source-type` reports that `worksAt` starts at Person
