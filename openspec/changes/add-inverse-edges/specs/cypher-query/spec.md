## ADDED Requirements

### Requirement: Inverse and symmetric patterns
When the engine is given a schema set, it SHALL query the canonical edge view. A relationship pattern with an inverse name SHALL match the declared edge type in the opposite direction, and a directed pattern with a symmetric edge type SHALL match its edges in both directions. `type(r)` SHALL return the declared type. Without a schema set, queries SHALL behave as before.

#### Scenario: Inverse name in a pattern
- **WHEN** Acme writes `hasEmployee:: [[Ada]]` and the query is `MATCH (p)-[:worksAt]->(c) RETURN p.title, c.title`
- **THEN** the result is one row `Ada`, `Acme`; `MATCH (c)-[:hasEmployee]->(p)` returns `Acme`, `Ada` too

#### Scenario: Symmetric pattern
- **WHEN** Ada writes `friendsWith:: [[Bob]]` and the query is `MATCH ({title: 'Bob'})-[:friendsWith]->(x) RETURN x.title`
- **THEN** the result is `Ada`

### Requirement: Directed patterns on symmetric edges
When a directed relationship pattern names a symmetric edge type, the result SHALL carry a notice, once per edge type, saying that the pattern matches in both directions and giving the undirected form. Undirected patterns, and patterns without a symmetric type, SHALL add no notice.

#### Scenario: Directed symmetric pattern noticed
- **WHEN** `friendsWith` is symmetric and the query is `MATCH (a)-[:friendsWith]->(b) RETURN b`
- **THEN** the result has a notice naming `friendsWith` and `-[:friendsWith]-`

#### Scenario: Undirected symmetric pattern quiet
- **WHEN** the query is `MATCH (a)-[:friendsWith]-(b) RETURN b`
- **THEN** the result has no notice
