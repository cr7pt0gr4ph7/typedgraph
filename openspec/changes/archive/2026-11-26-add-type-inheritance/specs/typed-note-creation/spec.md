## ADDED Requirements

### Requirement: Abstract types are not offered
The type pickers and menus SHALL NOT offer an abstract type for a new note, and neither SHALL the Luhmann commands. This holds in Obsidian and in VS Code. Creating a note of an abstract type by name SHALL fail with a message that asks for a subtype.

#### Scenario: Picker lists concrete types
- **WHEN** a schema declares the abstract `LegalEntity` with the subtypes `Person`, `Company` and `GeneralLegalEntity`
- **THEN** the types a note can be created as are those subtypes and the other concrete types, without `LegalEntity`
