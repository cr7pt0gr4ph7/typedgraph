## MODIFIED Requirements

### Requirement: Export schemas as SHACL
The system SHALL export every type and edge type in the schema folder as one SHACL document in Turtle, from the CLI (`tg schema export <out.ttl> --format shacl [--vault dir] [--base iri]`) and from a plugin command, and the output SHALL be deterministic so unchanged schemas produce byte-identical files. The CLI SHALL refuse to export, as [[openspec:tg-cli#Schema folder required]] says, when the schema folder holds no schema notes, unless `--ignore missing-ontology` is given.

#### Scenario: Export from the CLI
- **WHEN** the user runs `tg schema export shapes.ttl --format shacl` in a vault with `Person` and `Company` schemas
- **THEN** `shapes.ttl` contains one node shape per type and parses as valid Turtle

#### Scenario: Deterministic output
- **WHEN** the export runs twice without schema changes
- **THEN** both files are byte-identical

#### Scenario: Empty schema folder
- **WHEN** the vault has no schema notes
- **THEN** the CLI prints the "No ontology declared" message to stderr, writes no file and exits 2; with `--ignore missing-ontology` it writes a document with prefixes only and reports that no types were found
