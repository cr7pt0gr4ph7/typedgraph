## ADDED Requirements

### Requirement: Schema folder required
Every command that reads the ontology (`tg ontology`, `tg ontology check`, `tg schema export` and `tg cypher`, and the MCP tools that wrap them) SHALL stop before any other work when its schema folder (`Types/` of the project root or vault, or `--schema-folder`) is missing, is not a directory or holds no markdown note directly inside it. It SHALL print one line to stderr that names the folder, says which of the three it is and says what to do (run `tg init`, or pass `--schema-folder`), write nothing to stdout even with `--json`, and exit 2. `tg schema import` SHALL be exempt, since it creates the folder.

#### Scenario: Missing schema folder
- **WHEN** `tg ontology`, `tg ontology check` or `tg cypher` runs in a project without a `Types/` folder
- **THEN** stderr says `schema folder Types/ not found` and names `tg init`, and the exit code is 2

#### Scenario: Schema folder without schema notes
- **WHEN** `Types/` exists but holds no `*.md` file directly inside it
- **THEN** the error says the folder has no schema notes and the exit code is 2

#### Scenario: Other schema folder named
- **WHEN** `--schema-folder Ontology` names a folder that does not exist, even though `Types/` does
- **THEN** the error names `Ontology/`

## MODIFIED Requirements

### Requirement: Ontology listing
`tg ontology [--schema-folder Types] [--json]` SHALL list the types and edge types declared by the schema notes directly in the schema folder of the project root (`Types/` by default): for each type its properties with kind, allowed values, default and whether required, its allowed edges with target types, and the declaring note; for each edge type its source and target types, properties and declaring note. Without schema notes it SHALL fail as [[openspec:tg-cli#Schema folder required]] says. The same listing SHALL be available to MCP clients as the `tg_ontology` tool.

#### Scenario: Code ontology listed
- **WHEN** `tg ontology --json` runs in a project set up by `tg init`
- **THEN** it lists six types including `Decision` with property `status` and eleven edge types including `motivated_by` from `Decision` to `Constraint`, `Concept` and `Decision`

### Requirement: Ontology check
`tg ontology check [--schema-folder Types] [--json]` SHALL report every typed edge in docs and in code annotations whose type the ontology does not declare, with the closest declared name as a suggestion; every edge whose source or target carries types and none of them is allowed by the edge type's `from` or `to`; and every edge property the edge type does not declare or whose value is outside its allowed values. `references`, `contains` and edges written by `@lat:` comments SHALL NOT be reported. It SHALL exit 0 without findings and 1 with findings, and SHALL fail as [[openspec:tg-cli#Schema folder required]] says when the project has no schema notes.

#### Scenario: Unknown edge name
- **WHEN** a doc section contains `- motivatedBy:: [[constraints#GDPR]]`
- **THEN** `tg ontology check` reports `motivatedBy` as undeclared, suggests `motivated_by`, and exits 1

#### Scenario: Wrong endpoint type
- **WHEN** a section of a file typed `Concept` contains `- supersedes:: [[decisions#Old cache]]`
- **THEN** the check reports that `supersedes` does not allow a `Concept` source

#### Scenario: Clean ontology use
- **WHEN** every typed edge uses a declared type with allowed endpoints and properties
- **THEN** the check prints that the edges agree with the ontology and exits 0
