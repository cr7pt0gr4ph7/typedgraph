## ADDED Requirements

### Requirement: TGS 0.7 published
The specification SHALL publish TGS 0.7, adding `inverseEdge` to edge type declarations, the canonical edge view, the `inverse-conflict` and `inverse-mismatch` diagnostics and the `tgs:inverseEdge` annotation. TGS 0.6 SHALL be archived unchanged, and every 0.6 note SHALL be a valid 0.7 note.

#### Scenario: 0.6 note under 0.7
- **WHEN** a 0.7 reader reads a 0.6 schema note
- **THEN** it reads the same declarations with no new diagnostics
