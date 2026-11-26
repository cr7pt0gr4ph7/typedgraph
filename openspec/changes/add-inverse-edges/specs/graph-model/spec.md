## ADDED Requirements

### Requirement: Canonical edge view
Given a schema set, the system SHALL provide a read-only canonical view of the graph. In the view, every edge written with an inverse name becomes the declared edge type with its source and target swapped. The two written ends of one edge are merged into one edge: the declared direction and the inverse name, or the two directions of a symmetric edge type, with equal sign, paired in written order. A merged edge SHALL keep the id and properties of the declared direction, filled up from the other end, and SHALL record what was written. The graph built from markdown SHALL stay as written. Without inverse declarations the view SHALL hold exactly the graph's edges.

#### Scenario: Inverse name turned around
- **WHEN** Acme writes `hasEmployee:: [[Ada]]` and `worksAt` declares `inverseEdge: hasEmployee`
- **THEN** the view holds one `worksAt` edge from Ada to Acme, and the graph still holds `hasEmployee` from Acme to Ada

#### Scenario: Both ends merged
- **WHEN** Ada writes `worksAt:: [[Acme]]` and Acme writes `hasEmployee:: [[Ada]]`
- **THEN** the view holds one edge

#### Scenario: Symmetric ends merged
- **WHEN** Ada writes `friendsWith:: [[Bob]]`, Bob writes `friendsWith:: [[Ada]]`, and `friendsWith` is symmetric
- **THEN** the view holds one edge
