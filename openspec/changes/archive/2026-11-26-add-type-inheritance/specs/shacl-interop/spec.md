## ADDED Requirements

### Requirement: Type inheritance in SHACL
A type's node shape SHALL carry only its own declarations. Each supertype SHALL be exported as an `rdfs:subClassOf` statement on the type's class, and an abstract type as `tgs:abstract true`. Import SHALL read both back into `is` and `abstract`.

#### Scenario: Supertypes exported as subclasses
- **WHEN** `Person` is `[LegalEntity]` and `LegalEntity` is abstract
- **THEN** the export contains `:Person rdfs:subClassOf :LegalEntity`
- **AND** `LegalEntity`'s shape has `tgs:abstract true`
- **AND** `Person`'s shape has no property shape for the inherited `name`

#### Scenario: Round trip keeps supertypes
- **WHEN** that export is imported and written back as schema notes
- **THEN** the notes declare the same `is` and `abstract`, produce the same supertypes, and export to the same Turtle
