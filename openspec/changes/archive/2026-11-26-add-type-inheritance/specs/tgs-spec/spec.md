## ADDED Requirements

### Requirement: TGS 0.7 published
The specification SHALL be published as TGS 0.7, with 0.6 archived unchanged. 0.7 adds the keys `is` and `abstract` (section 4.10), labels that include supertypes, and the inheritance diagnostics. The JSON Schema SHALL accept the new keys, the namespace SHALL document `tgs:abstract`, and every 0.6 note SHALL be a valid 0.7 note.

#### Scenario: Published 0.7 with type inheritance
- **WHEN** the spec folder is read
- **THEN** `SPEC.md` is version 0.7 with section 4.10 Inheritance
- **AND** its JSON Schema `$id` is `https://typedgraph.org/spec/tgs/v0.7/tgs.schema.json` and accepts `is` and `abstract`
- **AND** `archive/v0.6/` keeps 0.6, whose JSON Schema rejects those keys
- **AND** the site builder publishes 0.7
