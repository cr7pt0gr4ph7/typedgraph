## ADDED Requirements

### Requirement: Backlinks named from the note's side
The backlinks view SHALL group an incoming edge under the name it has at the open note (see [[openspec:schema-notes#Edges read from either end]]): its inverse name, or its type when it has none.

#### Scenario: Incoming edge under its inverse name
- **WHEN** Ada's note writes `worksAt:: [[Acme]]`, `worksAt` declares `inverseEdge: hasEmployee`, and Acme's note is open
- **THEN** Ada is listed under `hasEmployee`
