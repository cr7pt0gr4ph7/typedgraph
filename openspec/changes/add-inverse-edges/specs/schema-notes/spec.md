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

### Requirement: Maintain inverse edges
The system SHALL offer to write the missing end of each inverse or symmetric edge into the Markdown note at its other end, with the edge's properties, under a configurable heading (default `Relations`, created when missing), at the end of the note, or as a frontmatter link (without properties), as chosen at run time. When the two ends differ in properties, the end chosen by the `winner` rule SHALL keep its properties and the other end's property block SHALL be rewritten: `declared` picks the end written with the declared name, and `last-edited` picks the end in the more recently modified note. With `deletions: mirror`, a lone end that the `winner` rule finds left over SHALL be removed instead of completed: under `declared`, an end written with the inverse name, and under `last-edited`, an end whose other note was modified after its own. With the default `deletions: keep`, nothing SHALL be removed. Written lines SHALL carry no marker, and a run on a consistent vault SHALL change nothing.

#### Scenario: Missing end written under a heading
- **WHEN** Ada writes `worksAt:: [[Acme]] {role: engineer}` and Acme's note has no `hasEmployee` line
- **THEN** `- hasEmployee:: [[Ada]] {role: engineer}` is added under `## Relations` in Acme's note, and a second run changes nothing

#### Scenario: Placement chosen at run time
- **WHEN** the placement is `end` or `frontmatter`
- **THEN** the line is appended at the end of the note, or `hasEmployee: "[[Ada]]"` is added to its frontmatter

#### Scenario: Declared direction wins
- **WHEN** Ada writes `{role: engineer}` and Acme writes `{role: manager}` and the winner is `declared`
- **THEN** Acme's line is rewritten to `{role: engineer}`

#### Scenario: Last edited wins
- **WHEN** the same mismatch is synced with winner `last-edited` and Acme's note is newer
- **THEN** Ada's line is rewritten to `{role: manager}`

#### Scenario: Deletion mirrored
- **WHEN** Acme writes `hasEmployee:: [[Ada]]`, Ada's note no longer has `worksAt:: [[Acme]]`, and deletions are `mirror` with winner `declared`
- **THEN** Acme's line is removed
