## ADDED Requirements

### Requirement: Inverse edges in SHACL
The SHACL export SHALL write an edge type's `inverseEdge` as `tgs:inverseEdge` with the name as a string on its edge shape, and the import SHALL read it back, so that the round trip keeps it.

#### Scenario: Inverse round trip
- **WHEN** `worksAt` declares `inverseEdge: hasEmployee` and the schema is exported and imported
- **THEN** the edge shape carries `tgs:inverseEdge "hasEmployee"` and the imported `worksAt` has the same inverse
