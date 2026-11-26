## MODIFIED Requirements

### Requirement: Note creation commands
The VS Code extension's commands SHALL read types from the schema folder of the Schema folder in VS Code requirement instead of `typegraph.schemaFolder` alone.

## ADDED Requirements

### Requirement: Schema folder in VS Code
The VS Code extension SHALL read types from `typegraph.schemaFolder` when the user set it to a non-blank value at any scope, and otherwise from `schemaFolder` in the workspace folder's `.tg/config.json`, read again on every use so an edit applies without a reload, and otherwise from `Types/`. The setting's own default SHALL be empty, so it never hides the config. A value outside the workspace SHALL be refused with a warning and the next source used.

#### Scenario: Config by default
- **WHEN** `typegraph.schemaFolder` is not set and `.tg/config.json` names `Ontology`, then is edited to name `./Schemas/`
- **THEN** New Typed Note offers the types in `Ontology/`, then reads `Schemas/`; a workspace without the file reads `Types/`

#### Scenario: Setting overrides
- **WHEN** the user sets `typegraph.schemaFolder` to `Types` while the config names `Ontology`, or to `../shared`
- **THEN** `Types/` is read; for `../shared` a warning says it must stay inside the project and `Ontology/` is read
